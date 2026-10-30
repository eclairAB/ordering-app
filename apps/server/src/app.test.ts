import type { Menu, MenuItem, Order } from '@ordering/shared';
import type { FastifyInstance } from 'fastify';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { openDatabase, type DB } from './db/connection.ts';
import { migrate } from './db/migrate.ts';
import { seedMenu } from './db/seed.ts';

let app: FastifyInstance;
let db: DB;
let tmp: string;
let menu: Menu;

const PASSCODE = 'test-passcode';
let keyCounter = 0;
const newKey = () => `test-key-${++keyCounter}-${Date.now()}`;

function item(name: string): MenuItem {
  const found = menu.items.find((i) => i.name === name);
  if (!found) throw new Error(`No seeded item ${name}`);
  return found;
}

function modifierId(menuItem: MenuItem, name: string): number {
  const found = menuItem.modifierGroups.flatMap((g) => g.modifiers).find((m) => m.name === name);
  if (!found) throw new Error(`No modifier ${name} on ${menuItem.name}`);
  return found.id;
}

function placeOrder(body: unknown, key: string | null = newKey()) {
  return app.inject({
    method: 'POST',
    url: '/api/orders',
    headers: key === null ? {} : { 'idempotency-key': key },
    payload: body as Record<string, unknown>,
  });
}

function latteOrder() {
  const latte = item('Café Latte');
  return {
    tableOrName: 'Table 3',
    lines: [{ itemId: latte.id, qty: 2, modifierIds: [modifierId(latte, 'Large (16oz)'), modifierId(latte, 'Oat milk')] }],
  };
}

async function staffCookie(): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/staff/login', payload: { passcode: PASSCODE } });
  expect(res.statusCode).toBe(200);
  const cookie = res.headers['set-cookie'];
  return String(Array.isArray(cookie) ? cookie[0] : cookie).split(';')[0] ?? '';
}

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'ordering-test-'));
  db = openDatabase(':memory:');
  migrate(db);
  seedMenu(db);
  const config = { ...loadConfig({}), staffPasscode: PASSCODE, imagesDir: join(tmp, 'images'), customerDistDir: tmp, staffDistDir: tmp };
  app = await buildApp({ config, db, logger: false });
  menu = (await app.inject('/api/menu')).json<Menu>();
});

afterEach(async () => {
  await app.close();
  db.close();
  rmSync(tmp, { recursive: true, force: true });
});

describe('health and menu', () => {
  it('reports healthy', async () => {
    expect((await app.inject('/healthz')).statusCode).toBe(200);
  });

  it('serves the seeded menu with local image URLs', () => {
    expect(menu.categories.map((c) => c.name)).toEqual(['Coffee', 'Non-Coffee', 'Pastries', 'Meals']);
    expect(item('Café Latte').imageUrl).toBe('/images/menu/cafe-latte.svg');
    expect(item('Ube Cheesecake').available).toBe(false);
  });

  it('returns JSON 404 for unknown API paths', async () => {
    const res = await app.inject('/api/nope');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'not_found', message: 'Not found' } });
  });
});

describe('POST /api/orders', () => {
  it('creates an order with a server-computed total', async () => {
    const res = await placeOrder(latteOrder());
    expect(res.statusCode).toBe(201);
    const order = res.json<Order>();
    // (150.00 + 25.00 large + 30.00 oat) * 2
    expect(order.totalCentavos).toBe(41_000);
    expect(order.status).toBe('placed');
    expect(order.number).toBe(1);
    expect(order.lines[0]?.nameSnapshot).toBe('Café Latte');
    expect(order.lines[0]?.modifiers.map((m) => m.nameSnapshot)).toEqual(['Large (16oz)', 'Oat milk']);
  });

  it('returns the original order when the Idempotency-Key is retried', async () => {
    const key = newKey();
    const first = await placeOrder(latteOrder(), key);
    const retry = await placeOrder(latteOrder(), key);
    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(200);
    expect(retry.json<Order>().id).toBe(first.json<Order>().id);
    expect(db.prepare('SELECT COUNT(*) FROM "order"').pluck().get()).toBe(1);
  });

  it('numbers orders sequentially within the day', async () => {
    await placeOrder(latteOrder());
    const second = await placeOrder(latteOrder());
    expect(second.json<Order>().number).toBe(2);
  });

  it('requires an Idempotency-Key', async () => {
    const res = await placeOrder(latteOrder(), null);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('validation_failed');
  });

  it('rejects client-sent prices instead of trusting them', async () => {
    const body = latteOrder();
    const res = await placeOrder({ ...body, lines: [{ ...body.lines[0], unitPriceCentavos: 1 }] });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unavailable items with their names (422)', async () => {
    const res = await placeOrder({ tableOrName: 'Ana', lines: [{ itemId: item('Ube Cheesecake').id, qty: 1 }] });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('item_unavailable');
    expect(res.json().error.message).toContain('Ube Cheesecake');
  });

  it('enforces required modifier groups (422)', async () => {
    const res = await placeOrder({ tableOrName: 'Ana', lines: [{ itemId: item('Café Latte').id, qty: 1 }] });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('invalid_modifiers');
  });

  it('rejects modifiers that belong to a different item (422)', async () => {
    const tapsilog = item('Tapsilog');
    const latte = item('Café Latte');
    const res = await placeOrder({
      tableOrName: 'Ana',
      lines: [{ itemId: tapsilog.id, qty: 1, modifierIds: [modifierId(tapsilog, 'Scrambled'), modifierId(latte, 'Oat milk')] }],
    });
    expect(res.statusCode).toBe(422);
  });

  it('lets a customer read their order by id', async () => {
    const created = (await placeOrder(latteOrder())).json<Order>();
    const res = await app.inject(`/api/orders/${created.id}`);
    expect(res.json<Order>().id).toBe(created.id);
  });
});

describe('staff routes', () => {
  it('require a session', async () => {
    for (const url of ['/api/staff/orders', '/api/staff/menu', '/api/staff/me']) {
      expect((await app.inject(url)).statusCode).toBe(401);
    }
  });

  it('reject a wrong passcode', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/staff/login', payload: { passcode: 'nope' } });
    expect(res.statusCode).toBe(401);
  });

  it('move an order through legal transitions and record events', async () => {
    const cookie = await staffCookie();
    const order = (await placeOrder(latteOrder())).json<Order>();
    const move = (to: string, from?: string) =>
      app.inject({
        method: 'POST',
        url: `/api/staff/orders/${order.id}/transition`,
        headers: { cookie },
        payload: from ? { to, from } : { to },
      });

    expect((await move('ready')).statusCode).toBe(409);
    expect((await move('accepted', 'placed')).json<Order>().status).toBe('accepted');
    // A second screen with a stale view gets a 409 instead of a double move.
    expect((await move('preparing', 'placed')).statusCode).toBe(409);
    expect((await move('preparing')).statusCode).toBe(200);

    const events = db.prepare('SELECT "from", "to", actor FROM order_event WHERE order_id = ? ORDER BY id').all(order.id);
    expect(events).toEqual([
      { from: null, to: 'placed', actor: 'customer' },
      { from: 'placed', to: 'accepted', actor: 'staff' },
      { from: 'accepted', to: 'preparing', actor: 'staff' },
    ]);
  });

  it('list active orders and toggle item availability', async () => {
    const cookie = await staffCookie();
    await placeOrder(latteOrder());
    const active = await app.inject({ url: '/api/staff/orders', headers: { cookie } });
    expect(active.json<Order[]>()).toHaveLength(1);

    const cheesecake = item('Ube Cheesecake');
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/staff/menu/items/${cheesecake.id}`,
      headers: { cookie },
      payload: { available: true },
    });
    expect(res.json<MenuItem>().available).toBe(true);
    const order = await placeOrder({ tableOrName: 'Ana', lines: [{ itemId: cheesecake.id, qty: 1 }] });
    expect(order.statusCode).toBe(201);
  });

  it('stop working after logout', async () => {
    const cookie = await staffCookie();
    await app.inject({ method: 'POST', url: '/api/staff/logout', headers: { cookie } });
    expect((await app.inject({ url: '/api/staff/me', headers: { cookie } })).statusCode).toBe(401);
  });
});

describe('pricing edge cases', () => {
  it('rejects a line whose modifiers push the price below zero (422)', async () => {
    const categoryId = menu.categories[0]?.id;
    const itemId = db
      .prepare("INSERT INTO menu_item (name, price_centavos, category_id) VALUES ('Promo cup', 500, ?)")
      .run(categoryId).lastInsertRowid;
    const groupId = db
      .prepare("INSERT INTO modifier_group (item_id, name, min, max) VALUES (?, 'Promo', 0, 1)")
      .run(itemId).lastInsertRowid;
    const modId = db
      .prepare("INSERT INTO modifier (group_id, name, price_delta_centavos) VALUES (?, 'Big discount', -1000)")
      .run(groupId).lastInsertRowid;

    const res = await placeOrder({ tableOrName: 'Ana', lines: [{ itemId: Number(itemId), qty: 1, modifierIds: [Number(modId)] }] });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('invalid_modifiers');
  });
});

describe('rate limits', () => {
  it('limits order creation per client (429)', async () => {
    for (let i = 0; i < 10; i++) expect((await placeOrder(latteOrder())).statusCode).toBe(201);
    const res = await placeOrder(latteOrder());
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('limits staff login attempts per client (429)', async () => {
    const attempt = () => app.inject({ method: 'POST', url: '/api/staff/login', payload: { passcode: 'nope' } });
    for (let i = 0; i < 10; i++) expect((await attempt()).statusCode).toBe(401);
    expect((await attempt()).statusCode).toBe(429);
  });

  it('locks login shop-wide after many failures from different IPs', async () => {
    for (let i = 0; i < 21; i++) {
      await app.inject({ method: 'POST', url: '/api/staff/login', remoteAddress: `10.0.0.${i + 1}`, payload: { passcode: 'nope' } });
    }
    const res = await app.inject({ method: 'POST', url: '/api/staff/login', remoteAddress: '10.0.1.1', payload: { passcode: PASSCODE } });
    expect(res.statusCode).toBe(429);
  });
});

describe('staff sessions', () => {
  it('reject an expired session', async () => {
    const cookie = await staffCookie();
    db.prepare("UPDATE staff_session SET expires_at = '2000-01-01T00:00:00.000Z'").run();
    expect((await app.inject({ url: '/api/staff/me', headers: { cookie } })).statusCode).toBe(401);
  });
});

/** Open a real connection and collect SSE events until `count` arrive or the server ends the stream. */
async function readEvents(path: string, count: number, headers: Record<string, string> = {}) {
  const base = await app.listen({ port: 0, host: '127.0.0.1' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  const res = await fetch(base + path, { headers, signal: controller.signal });
  if (!res.body) throw new Error('No response body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const events: { event: string; data: unknown }[] = [];
  let buffer = '';
  let ended = false;
  try {
    while (events.length < count) {
      const { done, value } = await reader.read();
      if (done) {
        ended = true;
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const event = /^event: (.*)$/m.exec(chunk)?.[1];
        const data = /^data: (.*)$/m.exec(chunk)?.[1];
        if (event && data) events.push({ event, data: JSON.parse(data) });
      }
    }
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  return { events, ended };
}

describe('server-sent events', () => {
  it('404s for an unknown order', async () => {
    expect((await app.inject('/api/orders/00000000-0000-4000-8000-000000000000/events')).statusCode).toBe(404);
  });

  it('sends the current order first', async () => {
    const order = (await placeOrder(latteOrder())).json<Order>();
    const { events } = await readEvents(`/api/orders/${order.id}/events`, 1);
    expect(events[0]).toMatchObject({ event: 'order', data: { id: order.id, status: 'placed' } });
  });

  it('ends the customer stream once the order is finished', async () => {
    const cookie = await staffCookie();
    const order = (await placeOrder(latteOrder())).json<Order>();
    await app.inject({ method: 'POST', url: `/api/staff/orders/${order.id}/transition`, headers: { cookie }, payload: { to: 'cancelled' } });
    const { events, ended } = await readEvents(`/api/orders/${order.id}/events`, 10);
    expect(events).toHaveLength(1);
    expect(ended).toBe(true);
  });

  it('sends staff a snapshot of active orders', async () => {
    const cookie = await staffCookie();
    await placeOrder(latteOrder());
    const { events } = await readEvents('/api/staff/events', 1, { cookie });
    expect(events[0]?.event).toBe('snapshot');
    expect(events[0]?.data).toHaveLength(1);
  });
});
