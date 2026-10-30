import { randomUUID } from 'node:crypto';
import {
  canTransition,
  lineTotalCentavos,
  modifierSelectionProblems,
  orderTotalCentavos,
  type CreateOrderBody,
  type Order,
  type OrderLine,
  type OrderStatus,
} from '@ordering/shared';
import type { DB } from '../db/connection.ts';
import { HttpError } from '../http/errors.ts';
import type { MenuRepo } from '../menu/menu-repo.ts';

interface OrderRow {
  id: string;
  number: number;
  status: OrderStatus;
  table_or_name: string;
  total_centavos: number;
  created_at: string;
  updated_at: string;
}

interface LineRow {
  id: number;
  order_id: string;
  item_id: number;
  name_snapshot: string;
  unit_price_snapshot: number;
  qty: number;
  notes: string | null;
}

interface LineModifierRow {
  line_id: number;
  modifier_id: number;
  name_snapshot: string;
  price_delta_snapshot: number;
}

export type Actor = 'customer' | 'staff';

export interface OrderRepo {
  /** Idempotent: a repeated key returns the original order with `created: false`. */
  create(body: CreateOrderBody, idempotencyKey: string): { order: Order; created: boolean };
  get(id: string): Order | undefined;
  listActive(): Order[];
  transition(id: string, to: OrderStatus, actor: Actor, expectedFrom?: OrderStatus): Order;
}

const ACTIVE_STATUSES: OrderStatus[] = ['placed', 'accepted', 'preparing', 'ready'];

/** Orders are numbered per calendar day in the shop's time zone. */
export function businessDay(now: Date, timeZone: string): string {
  return now.toLocaleDateString('en-CA', { timeZone }); // YYYY-MM-DD
}

export function createOrderRepo(db: DB, menu: MenuRepo, timeZone: string): OrderRepo {
  const byKey = db.prepare<[string], { id: string }>(
    'SELECT id FROM "order" WHERE idempotency_key = ?',
  );
  const byId = db.prepare<[string], OrderRow>('SELECT * FROM "order" WHERE id = ?');
  const active = db.prepare<string[], OrderRow>(
    `SELECT * FROM "order" WHERE status IN (${ACTIVE_STATUSES.map(() => '?').join(', ')})
      ORDER BY created_at`,
  );
  const linesFor = db.prepare<[string], LineRow>(
    'SELECT * FROM order_line WHERE order_id = ? ORDER BY id',
  );
  const lineModifiersFor = db.prepare<[string], LineModifierRow>(
    `SELECT lm.* FROM order_line_modifier lm JOIN order_line l ON l.id = lm.line_id
      WHERE l.order_id = ? ORDER BY lm.line_id, lm.modifier_id`,
  );
  const nextNumber = db.prepare<[string], { last_number: number }>(
    `INSERT INTO daily_counter (business_day, last_number) VALUES (?, 1)
     ON CONFLICT (business_day) DO UPDATE SET last_number = last_number + 1
     RETURNING last_number`,
  );
  const insertOrder = db.prepare(
    `INSERT INTO "order" (id, number, business_day, status, table_or_name, total_centavos,
                          idempotency_key, created_at, updated_at)
     VALUES (@id, @number, @businessDay, 'placed', @tableOrName, @total, @key, @now, @now)`,
  );
  const insertLine = db.prepare(
    `INSERT INTO order_line (order_id, item_id, name_snapshot, unit_price_snapshot, qty, notes)
     VALUES (@orderId, @itemId, @name, @unitPrice, @qty, @notes)`,
  );
  const insertLineModifier = db.prepare(
    `INSERT INTO order_line_modifier (line_id, modifier_id, name_snapshot, price_delta_snapshot)
     VALUES (@lineId, @modifierId, @name, @delta)`,
  );
  const insertEvent = db.prepare(
    `INSERT INTO order_event (order_id, "from", "to", at, actor) VALUES (?, ?, ?, ?, ?)`,
  );
  const updateStatus = db.prepare<[OrderStatus, string, string, OrderStatus]>(
    'UPDATE "order" SET status = ?, updated_at = ? WHERE id = ? AND status = ?',
  );

  function toOrder(row: OrderRow): Order {
    const modifiersByLine = new Map<number, OrderLine['modifiers']>();
    for (const m of lineModifiersFor.all(row.id)) {
      const list = modifiersByLine.get(m.line_id) ?? [];
      list.push({
        modifierId: m.modifier_id,
        nameSnapshot: m.name_snapshot,
        priceDeltaSnapshot: m.price_delta_snapshot,
      });
      modifiersByLine.set(m.line_id, list);
    }
    return {
      id: row.id,
      number: row.number,
      status: row.status,
      tableOrName: row.table_or_name,
      totalCentavos: row.total_centavos,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lines: linesFor.all(row.id).map((line) => ({
        id: line.id,
        itemId: line.item_id,
        nameSnapshot: line.name_snapshot,
        unitPriceSnapshot: line.unit_price_snapshot,
        qty: line.qty,
        notes: line.notes,
        modifiers: modifiersByLine.get(line.id) ?? [],
      })),
    };
  }

  function get(id: string): Order | undefined {
    const row = byId.get(id);
    return row ? toOrder(row) : undefined;
  }

  const create = db.transaction(
    (body: CreateOrderBody, key: string): { order: Order; created: boolean } => {
      const existing = byKey.get(key);
      if (existing) {
        const order = get(existing.id);
        if (order) return { order, created: false };
      }

      // Look up every item from the DB; client prices are never trusted.
      const unavailable: string[] = [];
      const modifierProblems: string[] = [];
      const priced = body.lines.map((line) => {
        const item = menu.getItem(line.itemId);
        if (!item || !item.available) {
          unavailable.push(item ? item.name : `item #${line.itemId}`);
          return undefined;
        }
        for (const problem of modifierSelectionProblems(item.modifierGroups, line.modifierIds)) {
          modifierProblems.push(`${item.name}: ${problem}`);
        }
        const allModifiers = item.modifierGroups.flatMap((g) => g.modifiers);
        const chosen = allModifiers.filter((m) => line.modifierIds.includes(m.id));
        return { line, item, chosen };
      });

      if (unavailable.length > 0) {
        throw new HttpError(422, 'item_unavailable', `Sorry, not available right now: ${unavailable.join(', ')}`, {
          items: unavailable,
        });
      }
      if (modifierProblems.length > 0) {
        throw new HttpError(422, 'invalid_modifiers', modifierProblems.join('; '), {
          problems: modifierProblems,
        });
      }

      const lines = priced.flatMap((p) => (p ? [p] : []));
      const pricedLines = lines.map(({ line, item, chosen }) => ({
        unitPriceCentavos: item.priceCentavos,
        modifierDeltasCentavos: chosen.map((m) => m.priceDeltaCentavos),
        qty: line.qty,
      }));
      // Negative modifier deltas (discounts) must never push a line below zero.
      pricedLines.forEach((p, i) => {
        if (lineTotalCentavos({ ...p, qty: 1 }) < 0) {
          throw new HttpError(422, 'invalid_modifiers', `${lines[i]?.item.name}: price cannot be negative`);
        }
      });
      const total = orderTotalCentavos(pricedLines);

      const now = new Date();
      const nowIso = now.toISOString();
      const day = businessDay(now, timeZone);
      const numberRow = nextNumber.get(day);
      if (!numberRow) throw new Error('Failed to allocate an order number');
      const id = randomUUID();

      insertOrder.run({
        id,
        number: numberRow.last_number,
        businessDay: day,
        tableOrName: body.tableOrName,
        total,
        key,
        now: nowIso,
      });
      for (const { line, item, chosen } of lines) {
        const { lastInsertRowid } = insertLine.run({
          orderId: id,
          itemId: item.id,
          name: item.name,
          unitPrice: item.priceCentavos,
          qty: line.qty,
          notes: line.notes ?? null,
        });
        for (const m of chosen) {
          insertLineModifier.run({
            lineId: lastInsertRowid,
            modifierId: m.id,
            name: m.name,
            delta: m.priceDeltaCentavos,
          });
        }
      }
      insertEvent.run(id, null, 'placed', nowIso, 'customer');

      const order = get(id);
      if (!order) throw new Error('Order vanished after insert');
      return { order, created: true };
    },
  );

  /** The single place where order status changes are enforced. */
  const transition = db.transaction(
    (id: string, to: OrderStatus, actor: Actor, expectedFrom?: OrderStatus): Order => {
      const row = byId.get(id);
      if (!row) throw new HttpError(404, 'not_found', 'Order not found');
      if (expectedFrom !== undefined && row.status !== expectedFrom) {
        throw new HttpError(
          409,
          'illegal_transition',
          `Order #${row.number} is already ${row.status}`,
          { current: row.status },
        );
      }
      if (!canTransition(row.status, to)) {
        throw new HttpError(409, 'illegal_transition', `Cannot move order from ${row.status} to ${to}`, {
          current: row.status,
        });
      }
      const nowIso = new Date().toISOString();
      updateStatus.run(to, nowIso, id, row.status);
      insertEvent.run(id, row.status, to, nowIso, actor);
      return toOrder({ ...row, status: to, updated_at: nowIso });
    },
  );

  return {
    create: (body, key) => create(body, key),
    get,
    listActive: () => active.all(...ACTIVE_STATUSES).map(toOrder),
    transition: (id, to, actor, expectedFrom) => transition(id, to, actor, expectedFrom),
  };
}
