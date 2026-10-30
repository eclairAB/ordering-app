import type { Category, Menu, MenuItem, Modifier, ModifierGroup } from '@ordering/shared';
import type { DB } from '../db/connection.ts';

interface ItemRow {
  id: number;
  name: string;
  description: string;
  price_centavos: number;
  category_id: number;
  image_path: string | null;
  available: number;
  sort: number;
}

interface GroupRow {
  id: number;
  item_id: number;
  name: string;
  min: number;
  max: number;
}

interface ModifierRow {
  id: number;
  group_id: number;
  name: string;
  price_delta_centavos: number;
}

export interface MenuRepo {
  getMenu(): Menu;
  getItem(id: number): MenuItem | undefined;
  setAvailability(id: number, available: boolean): MenuItem | undefined;
}

export function imageUrlFor(imagePath: string | null): string | null {
  return imagePath ? `/images/${imagePath}` : null;
}

export function createMenuRepo(db: DB): MenuRepo {
  const categories = db.prepare<[], Category>('SELECT id, name, sort FROM category ORDER BY sort, id');
  const allItems = db.prepare<[], ItemRow>('SELECT * FROM menu_item ORDER BY sort, id');
  const oneItem = db.prepare<[number], ItemRow>('SELECT * FROM menu_item WHERE id = ?');
  const allGroups = db.prepare<[], GroupRow>(
    'SELECT id, item_id, name, min, max FROM modifier_group ORDER BY sort, id',
  );
  const groupsForItem = db.prepare<[number], GroupRow>(
    'SELECT id, item_id, name, min, max FROM modifier_group WHERE item_id = ? ORDER BY sort, id',
  );
  const allModifiers = db.prepare<[], ModifierRow>(
    'SELECT id, group_id, name, price_delta_centavos FROM modifier ORDER BY sort, id',
  );
  const modifiersForItem = db.prepare<[number], ModifierRow>(
    `SELECT m.id, m.group_id, m.name, m.price_delta_centavos
       FROM modifier m JOIN modifier_group g ON g.id = m.group_id
      WHERE g.item_id = ? ORDER BY m.sort, m.id`,
  );
  const updateAvailability = db.prepare<[number, number]>(
    'UPDATE menu_item SET available = ? WHERE id = ?',
  );

  function assemble(items: ItemRow[], groups: GroupRow[], modifiers: ModifierRow[]): MenuItem[] {
    const modifiersByGroup = new Map<number, Modifier[]>();
    for (const m of modifiers) {
      const list = modifiersByGroup.get(m.group_id) ?? [];
      list.push({ id: m.id, groupId: m.group_id, name: m.name, priceDeltaCentavos: m.price_delta_centavos });
      modifiersByGroup.set(m.group_id, list);
    }
    const groupsByItem = new Map<number, ModifierGroup[]>();
    for (const g of groups) {
      const list = groupsByItem.get(g.item_id) ?? [];
      list.push({
        id: g.id,
        itemId: g.item_id,
        name: g.name,
        min: g.min,
        max: g.max,
        modifiers: modifiersByGroup.get(g.id) ?? [],
      });
      groupsByItem.set(g.item_id, list);
    }
    return items.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      priceCentavos: row.price_centavos,
      categoryId: row.category_id,
      imageUrl: imageUrlFor(row.image_path),
      available: row.available === 1,
      sort: row.sort,
      modifierGroups: groupsByItem.get(row.id) ?? [],
    }));
  }

  function getItem(id: number): MenuItem | undefined {
    const row = oneItem.get(id);
    if (!row) return undefined;
    return assemble([row], groupsForItem.all(id), modifiersForItem.all(id))[0];
  }

  return {
    getMenu: () => ({
      categories: categories.all(),
      items: assemble(allItems.all(), allGroups.all(), allModifiers.all()),
    }),
    getItem,
    setAvailability(id, available) {
      const { changes } = updateAvailability.run(available ? 1 : 0, id);
      return changes === 0 ? undefined : getItem(id);
    },
  };
}
