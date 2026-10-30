---
name: order-domain
description: Domain rules for the ordering system: menu schema, order lifecycle and status transitions, pricing and modifiers, idempotent order creation. Use when writing or changing order, menu, cart, pricing, or kitchen-display code.
---

# Order domain

## Entities
- `menu_item(id, name, price_centavos, category_id, available, sort)`
- `modifier_group(id, item_id, name, min, max)` and `modifier(id, group_id, name, price_delta_centavos)`
- `order(id, number, status, table_or_name, total_centavos, idempotency_key UNIQUE, created_at, updated_at)`
- `order_line(id, order_id, item_id, name_snapshot, unit_price_snapshot, qty, notes)`
- `order_line_modifier(line_id, modifier_id, name_snapshot, price_delta_snapshot)`

Always **snapshot** names and prices onto order lines so later menu edits never change past orders.

## Status lifecycle
`placed -> accepted -> preparing -> ready -> completed`
Side exits: `placed|accepted -> cancelled`, `ready -> completed` only by staff.
- Transitions are enforced server-side in one function (`transitionOrder`); reject illegal jumps with 409.
- Every transition writes a row to `order_event(order_id, from, to, at, actor)`.
- Publish each change over SSE so the customer and kitchen screens update live.

## Creating an order
1. Validate body with the shared Zod schema.
2. Look up each item and modifier from the DB; reject unavailable or unknown ones (422).
3. Recompute the total on the server from DB prices. Ignore any client-sent price.
4. Check `Idempotency-Key`: if an order with that key exists, return it with 200 instead of creating another.
5. Insert order + lines + modifiers in one transaction; assign a short, human-friendly order number that resets daily.

## Gotchas
- Order numbers: daily counter, generated inside the same transaction to avoid duplicates.
- Items marked unavailable after being added to a cart must fail at submit, with a clear message listing which items.
- Modifier min/max rules are validated on the server, not just in the UI.
