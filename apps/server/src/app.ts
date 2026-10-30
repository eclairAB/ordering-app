import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.ts';
import type { DB } from './db/connection.ts';
import { createOrderBus } from './events.ts';
import { HttpError, errorBody } from './http/errors.ts';
import { createMenuRepo } from './menu/menu-repo.ts';
import { createOrderRepo } from './orders/order-repo.ts';
import { customerRoutes } from './routes/customer.ts';
import { staffRoutes } from './routes/staff.ts';
import { createStaffAuth } from './staff/auth.ts';

export interface BuildAppOptions {
  config: Config;
  db: DB;
  logger?: boolean;
}

export async function buildApp({ config, db, logger = true }: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger, bodyLimit: 64 * 1024 });

  const menu = createMenuRepo(db);
  const orders = createOrderRepo(db, menu, config.timeZone);
  const bus = createOrderBus();
  const auth = createStaffAuth(db, config.staffPasscode);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send(errorBody(error.code, error.message, error.details));
    }
    const statusCode = (error as { statusCode?: unknown }).statusCode;
    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
      // Fastify-level client errors: malformed JSON, body too large, wrong content type.
      return reply.status(statusCode).send(errorBody('validation_failed', (error as Error).message));
    }
    request.log.error(error);
    return reply.status(500).send(errorBody('internal', 'Something went wrong'));
  });

  app.get('/healthz', async () => {
    db.prepare('SELECT 1').get();
    return { ok: true };
  });

  await app.register(customerRoutes, { prefix: '/api', menu, orders, bus });
  await app.register(staffRoutes, { prefix: '/api/staff', menu, orders, bus, auth });

  // Static files: menu images always; built apps when present (production / `pnpm build`).
  const imagesDir = resolve(config.imagesDir);
  mkdirSync(imagesDir, { recursive: true });
  await app.register(fastifyStatic, { root: imagesDir, prefix: '/images/', maxAge: '1h' });

  const hasStaff = existsSync(resolve(config.staffDistDir, 'index.html'));
  const hasCustomer = existsSync(resolve(config.customerDistDir, 'index.html'));
  if (hasStaff) {
    await app.register(fastifyStatic, {
      root: resolve(config.staffDistDir),
      prefix: '/staff/',
      decorateReply: false,
    });
  }
  if (hasCustomer) {
    await app.register(fastifyStatic, {
      root: resolve(config.customerDistDir),
      prefix: '/',
      decorateReply: false,
      index: false,
      wildcard: false,
    });
  }

  // Unknown API paths get a JSON 404; everything else falls back to the right SPA.
  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    if (request.method === 'GET' && !path.startsWith('/api/') && !path.startsWith('/images/')) {
      if ((path === '/staff' || path.startsWith('/staff/')) && hasStaff) {
        return reply.sendFile('index.html', resolve(config.staffDistDir));
      }
      if (!path.startsWith('/staff') && hasCustomer) {
        return reply.sendFile('index.html', resolve(config.customerDistDir));
      }
    }
    return reply.status(404).send(errorBody('not_found', 'Not found'));
  });

  return app;
}
