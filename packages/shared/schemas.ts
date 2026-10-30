import { z } from 'zod';
import { isCentavos } from './money.ts';
import { ORDER_STATUSES } from './order-status.ts';

export const CentavosSchema = z.number().refine(isCentavos, 'Must be an integer amount in centavos');
/** Prices and totals. Negative amounts are only allowed for modifier deltas (e.g. "no milk"). */
export const NonNegativeCentavosSchema = CentavosSchema.refine((v) => v >= 0, 'Must not be negative');
export const Id = z.number().int().positive();

// ---- Menu ----

export const Category = z.object({
  id: Id,
  name: z.string().min(1),
  sort: z.number().int(),
});
export type Category = z.infer<typeof Category>;

export const Modifier = z.object({
  id: Id,
  groupId: Id,
  name: z.string().min(1),
  priceDeltaCentavos: CentavosSchema,
});
export type Modifier = z.infer<typeof Modifier>;

export const ModifierGroup = z
  .object({
    id: Id,
    itemId: Id,
    name: z.string().min(1),
    min: z.number().int().nonnegative(),
    max: z.number().int().positive(),
    modifiers: z.array(Modifier),
  })
  .refine((g) => g.min <= g.max, { message: 'min must be <= max', path: ['min'] });
export type ModifierGroup = z.infer<typeof ModifierGroup>;

export const MenuItem = z.object({
  id: Id,
  name: z.string().min(1),
  priceCentavos: NonNegativeCentavosSchema,
  categoryId: Id,
  available: z.boolean(),
  sort: z.number().int(),
  modifierGroups: z.array(ModifierGroup),
});
export type MenuItem = z.infer<typeof MenuItem>;

export const Menu = z.object({
  categories: z.array(Category),
  items: z.array(MenuItem),
});
export type Menu = z.infer<typeof Menu>;

// ---- Orders ----

export const OrderStatusSchema = z.enum(ORDER_STATUSES);

/** Sent by the customer as the `Idempotency-Key` header on order creation. */
export const IdempotencyKey = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, 'Only letters, digits, "-" and "_"');

/**
 * Body for POST /api/orders. Deliberately carries no prices:
 * the server recomputes every total from the menu table.
 */
export const CreateOrderLine = z.strictObject({
  itemId: Id,
  qty: z.number().int().min(1).max(50),
  modifierIds: z
    .array(Id)
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length, 'Duplicate modifier')
    .default([]),
  notes: z.string().trim().max(200).optional(),
});
export type CreateOrderLine = z.infer<typeof CreateOrderLine>;

export const CreateOrderBody = z.strictObject({
  tableOrName: z.string().trim().min(1).max(40),
  lines: z.array(CreateOrderLine).min(1).max(50),
});
export type CreateOrderBody = z.infer<typeof CreateOrderBody>;

export const OrderLineModifier = z.object({
  modifierId: Id,
  nameSnapshot: z.string(),
  priceDeltaSnapshot: CentavosSchema,
});

export const OrderLine = z.object({
  id: Id,
  itemId: Id,
  nameSnapshot: z.string(),
  unitPriceSnapshot: NonNegativeCentavosSchema,
  qty: z.number().int().positive(),
  notes: z.string().nullable(),
  modifiers: z.array(OrderLineModifier),
});
export type OrderLine = z.infer<typeof OrderLine>;

export const Order = z.object({
  id: z.uuid(),
  number: z.number().int().positive(),
  status: OrderStatusSchema,
  tableOrName: z.string(),
  totalCentavos: NonNegativeCentavosSchema,
  // ISO-8601 with "Z"; the server converts SQLite's "YYYY-MM-DD HH:MM:SS" before returning.
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  lines: z.array(OrderLine),
});
export type Order = z.infer<typeof Order>;

/** Body for the staff-only status change endpoint. */
export const TransitionOrderBody = z.strictObject({ to: OrderStatusSchema });
export type TransitionOrderBody = z.infer<typeof TransitionOrderBody>;

// ---- Errors ----

export const ErrorCode = z.enum([
  'validation_failed',
  'not_found',
  'item_unavailable',
  'invalid_modifiers',
  'illegal_transition',
  'unauthorized',
  'rate_limited',
  'internal',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ApiError = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;
