import { CreateOrderBody, IdempotencyKey, isTerminalStatus } from '@ordering/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { OrderBus } from '../events.ts';
import { HttpError, parseWith } from '../http/errors.ts';
import { rateLimit } from '../http/rate-limit.ts';
import { openSse } from '../http/sse.ts';
import type { MenuRepo } from '../menu/menu-repo.ts';
import type { OrderRepo } from '../orders/order-repo.ts';

export interface CustomerRoutesOptions {
  menu: MenuRepo;
  orders: OrderRepo;
  bus: OrderBus;
}

const MAX_STREAMS_PER_IP = 5;

/** Public routes under /api. Rate limited per client IP; never mounts staff endpoints. */
export const customerRoutes: FastifyPluginAsync<CustomerRoutesOptions> = async (app, { menu, orders, bus }) => {
  app.addHook('onRequest', rateLimit({ max: 120, windowMs: 60_000 }));
  const openStreams = new Map<string, number>();

  app.get('/menu', async () => menu.getMenu());

  app.post(
    '/orders',
    { onRequest: rateLimit({ max: 10, windowMs: 60_000 }) },
    async (request, reply) => {
      const key = request.headers['idempotency-key'];
      if (key === undefined) {
        throw new HttpError(400, 'validation_failed', 'Missing Idempotency-Key header');
      }
      const idempotencyKey = parseWith(IdempotencyKey, key);
      const body = parseWith(CreateOrderBody, request.body);
      const { order, created } = orders.create(body, idempotencyKey);
      if (created) bus.publish(order);
      return reply.status(created ? 201 : 200).send(order);
    },
  );

  app.get<{ Params: { id: string } }>('/orders/:id', async (request) => {
    const order = orders.get(request.params.id);
    if (!order) throw new HttpError(404, 'not_found', 'Order not found');
    return order;
  });

  app.get<{ Params: { id: string } }>('/orders/:id/events', async (request, reply) => {
    const order = orders.get(request.params.id);
    if (!order) throw new HttpError(404, 'not_found', 'Order not found');

    const ip = request.ip;
    const open = openStreams.get(ip) ?? 0;
    if (open >= MAX_STREAMS_PER_IP) {
      throw new HttpError(429, 'rate_limited', 'Too many open status pages on this device');
    }

    const stream = openSse(request, reply);
    openStreams.set(ip, open + 1);
    stream.onClose(() => {
      const left = (openStreams.get(ip) ?? 1) - 1;
      if (left <= 0) openStreams.delete(ip);
      else openStreams.set(ip, left);
    });

    stream.send('order', order);
    if (isTerminalStatus(order.status)) return stream.close();
    const unsubscribe = bus.subscribe((changed) => {
      if (changed.id !== order.id) return;
      stream.send('order', changed);
      if (isTerminalStatus(changed.status)) stream.close();
    });
    stream.onClose(unsubscribe);
  });
};
