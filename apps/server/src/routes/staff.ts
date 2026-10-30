import { StaffLoginBody, TransitionOrderBody, UpdateMenuItemBody } from '@ordering/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { OrderBus } from '../events.ts';
import { readCookie, serializeCookie } from '../http/cookies.ts';
import { HttpError, parseWith } from '../http/errors.ts';
import { createRateLimiter, rateLimit } from '../http/rate-limit.ts';
import { openSse } from '../http/sse.ts';
import type { MenuRepo } from '../menu/menu-repo.ts';
import type { OrderRepo } from '../orders/order-repo.ts';
import { SESSION_COOKIE, SESSION_TTL_S, type StaffAuth } from '../staff/auth.ts';

export interface StaffRoutesOptions {
  menu: MenuRepo;
  orders: OrderRepo;
  bus: OrderBus;
  auth: StaffAuth;
}

const SESSION_RECHECK_MS = 60_000;

/** Staff routes under /api/staff. Everything except login requires a session cookie. */
export const staffRoutes: FastifyPluginAsync<StaffRoutesOptions> = async (app, { menu, orders, bus, auth }) => {
  // Per-IP limits can be dodged by changing IP on the LAN, so failed logins are also
  // counted shop-wide; too many locks the login for everyone until the window resets.
  const failedLogins = createRateLimiter({ max: 20, windowMs: 60_000 });
  let lockedUntil = 0;

  app.post('/login', { onRequest: rateLimit({ max: 10, windowMs: 60_000 }) }, async (request, reply) => {
    const now = Date.now();
    if (now < lockedUntil) {
      reply.header('Retry-After', String(Math.ceil((lockedUntil - now) / 1000)));
      throw new HttpError(429, 'rate_limited', 'Too many failed logins. Try again in a minute.');
    }
    const { passcode } = parseWith(StaffLoginBody, request.body);
    if (!auth.checkPasscode(passcode)) {
      const { allowed, retryAfterS } = failedLogins('all', now);
      if (!allowed) lockedUntil = now + retryAfterS * 1000;
      throw new HttpError(401, 'unauthorized', 'Wrong passcode');
    }
    reply.header('Set-Cookie', serializeCookie(SESSION_COOKIE, auth.createSession(), { maxAgeS: SESSION_TTL_S }));
    return { ok: true };
  });

  app.post('/logout', async (request, reply) => {
    auth.revoke(readCookie(request.headers.cookie, SESSION_COOKIE));
    reply.header('Set-Cookie', serializeCookie(SESSION_COOKIE, '', { maxAgeS: 0 }));
    return { ok: true };
  });

  await app.register(async (authed) => {
    authed.addHook('onRequest', auth.requireStaff);

    authed.get('/me', async () => ({ ok: true }));

    authed.get('/orders', async () => orders.listActive());

    authed.post<{ Params: { id: string } }>('/orders/:id/transition', async (request) => {
      const { to, from } = parseWith(TransitionOrderBody, request.body);
      const order = orders.transition(request.params.id, to, 'staff', from);
      bus.publish(order);
      return order;
    });

    authed.get('/events', async (request, reply) => {
      const token = readCookie(request.headers.cookie, SESSION_COOKIE);
      const stream = openSse(request, reply);
      stream.send('snapshot', orders.listActive());
      stream.onClose(bus.subscribe((order) => stream.send('order', order)));
      // Auth is checked on connect; also end the stream after logout or expiry.
      const recheck = setInterval(() => auth.isValid(token) || stream.close(), SESSION_RECHECK_MS);
      stream.onClose(() => clearInterval(recheck));
    });

    authed.get('/menu', async () => menu.getMenu());

    authed.patch<{ Params: { id: string } }>('/menu/items/:id', async (request) => {
      const { available } = parseWith(UpdateMenuItemBody, request.body);
      const item = menu.setAvailability(Number(request.params.id), available);
      if (!item) throw new HttpError(404, 'not_found', 'Menu item not found');
      return item;
    });
  });
};
