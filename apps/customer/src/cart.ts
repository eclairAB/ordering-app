import type { Menu, MenuItem, Modifier } from '@ordering/shared';
import { lineTotalCentavos, type Centavos } from '@ordering/shared/money';

export interface CartLine {
  /** Local id so the same item with different options can sit in the cart twice. */
  id: string;
  itemId: number;
  qty: number;
  modifierIds: number[];
  notes: string;
}

export interface ResolvedLine {
  line: CartLine;
  item: MenuItem;
  modifiers: Modifier[];
  /** Display estimate only; the server computes the real total. */
  totalCentavos: Centavos;
}

export function resolveCart(cart: CartLine[], menu: Menu): ResolvedLine[] {
  return cart.flatMap((line) => {
    const item = menu.items.find((i) => i.id === line.itemId);
    if (!item) return [];
    const modifiers = item.modifierGroups.flatMap((g) => g.modifiers).filter((m) => line.modifierIds.includes(m.id));
    const totalCentavos = lineTotalCentavos({
      unitPriceCentavos: item.priceCentavos,
      modifierDeltasCentavos: modifiers.map((m) => m.priceDeltaCentavos),
      qty: line.qty,
    });
    return [{ line, item, modifiers, totalCentavos }];
  });
}
