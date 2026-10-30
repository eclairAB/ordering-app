import { describe, expect, it } from 'vitest';
import { CreateOrderBody, IdempotencyKey, MenuItem, ModifierGroup } from './schemas.ts';
import { canTransition, isTerminalStatus } from './order-status.ts';

describe('CreateOrderBody', () => {
  const valid = { tableOrName: 'Table 4', lines: [{ itemId: 1, qty: 2 }] };

  it('accepts a minimal order and defaults modifierIds', () => {
    const parsed = CreateOrderBody.parse(valid);
    expect(parsed.lines[0]?.modifierIds).toEqual([]);
  });

  it('rejects client-sent prices', () => {
    const result = CreateOrderBody.safeParse({ ...valid, totalCentavos: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects client-sent prices on lines', () => {
    const result = CreateOrderBody.safeParse({
      ...valid,
      lines: [{ itemId: 1, qty: 1, unitPriceCentavos: 1 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate modifier ids', () => {
    const result = CreateOrderBody.safeParse({
      ...valid,
      lines: [{ itemId: 1, qty: 1, modifierIds: [3, 3] }],
    });
    expect(result.success).toBe(false);
  });

  it.each([
    { ...valid, lines: [] },
    { ...valid, lines: [{ itemId: 1, qty: 0 }] },
    { ...valid, lines: [{ itemId: 1, qty: 1.5 }] },
    { ...valid, tableOrName: '   ' },
  ])('rejects invalid body %#', (body) => {
    expect(CreateOrderBody.safeParse(body).success).toBe(false);
  });
});

describe('IdempotencyKey', () => {
  it('accepts UUIDs and rejects short or odd keys', () => {
    expect(IdempotencyKey.safeParse('3f1c2a9e-7b4d-4c1e-9a8f-0d2b6e5c4a71').success).toBe(true);
    expect(IdempotencyKey.safeParse('short').success).toBe(false);
    expect(IdempotencyKey.safeParse('has spaces in it').success).toBe(false);
  });
});

describe('MenuItem', () => {
  it('rejects negative prices', () => {
    const item = {
      id: 1,
      name: 'Latte',
      priceCentavos: -100,
      categoryId: 1,
      available: true,
      sort: 0,
      modifierGroups: [],
    };
    expect(MenuItem.safeParse(item).success).toBe(false);
    expect(MenuItem.safeParse({ ...item, priceCentavos: 15_000 }).success).toBe(true);
  });
});

describe('ModifierGroup', () => {
  it('rejects min > max', () => {
    const group = { id: 1, itemId: 1, name: 'Milk', min: 2, max: 1, modifiers: [] };
    expect(ModifierGroup.safeParse(group).success).toBe(false);
  });
});

describe('order status transitions', () => {
  it('allows the happy path', () => {
    expect(canTransition('placed', 'accepted')).toBe(true);
    expect(canTransition('accepted', 'preparing')).toBe(true);
    expect(canTransition('preparing', 'ready')).toBe(true);
    expect(canTransition('ready', 'completed')).toBe(true);
  });

  it('allows cancelling only before preparation', () => {
    expect(canTransition('placed', 'cancelled')).toBe(true);
    expect(canTransition('accepted', 'cancelled')).toBe(true);
    expect(canTransition('preparing', 'cancelled')).toBe(false);
  });

  it('rejects skips and moves out of terminal states', () => {
    expect(canTransition('placed', 'ready')).toBe(false);
    expect(canTransition('completed', 'placed')).toBe(false);
    expect(isTerminalStatus('completed')).toBe(true);
    expect(isTerminalStatus('cancelled')).toBe(true);
  });
});
