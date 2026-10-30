import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../db/connection.ts';
import { migrate } from '../db/migrate.ts';
import { seedMenu } from '../db/seed.ts';
import { createMenuRepo } from '../menu/menu-repo.ts';
import { businessDay, createOrderRepo } from './order-repo.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('businessDay', () => {
  it('uses the shop time zone, not UTC', () => {
    // 01:00 on 31 Oct in Manila is still 30 Oct in UTC.
    const instant = new Date('2026-10-30T17:00:00Z');
    expect(businessDay(instant, 'Asia/Manila')).toBe('2026-10-31');
    expect(businessDay(instant, 'UTC')).toBe('2026-10-30');
  });
});

describe('order numbers', () => {
  it('reset at midnight in the shop time zone', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    seedMenu(db);
    const menu = createMenuRepo(db);
    const orders = createOrderRepo(db, menu, 'Asia/Manila');
    const item = menu.getMenu().items.find((i) => i.name === 'Ensaymada');
    if (!item) throw new Error('missing seed item');
    const body = { tableOrName: 'Ana', lines: [{ itemId: item.id, qty: 1, modifierIds: [] }] };

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-30T15:50:00Z')); // 23:50 Manila
    expect(orders.create(body, 'key-day1-a').order.number).toBe(1);
    expect(orders.create(body, 'key-day1-b').order.number).toBe(2);
    vi.setSystemTime(new Date('2026-10-30T16:10:00Z')); // 00:10 next day, Manila
    expect(orders.create(body, 'key-day2-a').order.number).toBe(1);
    db.close();
  });
});
