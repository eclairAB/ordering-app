import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { placeholderSvg } from '../menu/placeholder-image.ts';
import type { DB } from './connection.ts';

/** Demo menu for development. Prices are integer centavos (₱1.00 = 100). */

interface SeedModifierGroup {
  name: string;
  min: number;
  max: number;
  options: [name: string, priceDeltaCentavos: number][];
}

interface SeedItem {
  slug: string;
  name: string;
  description: string;
  priceCentavos: number;
  emoji: string;
  available?: boolean;
  groups?: SeedModifierGroup[];
}

interface SeedCategory {
  name: string;
  colors: [string, string];
  items: SeedItem[];
}

const SIZE: SeedModifierGroup = { name: 'Size', min: 1, max: 1, options: [['Regular (12oz)', 0], ['Large (16oz)', 2_500]] };
const MILK: SeedModifierGroup = {
  name: 'Milk',
  min: 0,
  max: 1,
  options: [['Oat milk', 3_000], ['Soy milk', 2_000], ['No milk', -1_000]],
};
const EXTRAS: SeedModifierGroup = {
  name: 'Extras',
  min: 0,
  max: 3,
  options: [['Extra shot', 4_000], ['Vanilla syrup', 2_000], ['Whipped cream', 1_500]],
};
const SUGAR: SeedModifierGroup = {
  name: 'Sweetness',
  min: 1,
  max: 1,
  options: [['Regular', 0], ['Less sweet', 0], ['No sugar', 0]],
};

export const DEMO_MENU: SeedCategory[] = [
  {
    name: 'Coffee',
    colors: ['#6f4e37', '#3b2a1e'],
    items: [
      { slug: 'americano', name: 'Americano', description: 'Double espresso topped with hot water.', priceCentavos: 12_000, emoji: '☕', groups: [SIZE, EXTRAS] },
      { slug: 'cafe-latte', name: 'Café Latte', description: 'Espresso with steamed milk and light foam.', priceCentavos: 15_000, emoji: '🥛', groups: [SIZE, MILK, EXTRAS] },
      { slug: 'cappuccino', name: 'Cappuccino', description: 'Equal parts espresso, milk and foam.', priceCentavos: 15_000, emoji: '☕', groups: [SIZE, MILK, EXTRAS] },
      { slug: 'spanish-latte', name: 'Spanish Latte', description: 'Latte sweetened with condensed milk.', priceCentavos: 17_000, emoji: '🍮', groups: [SIZE, MILK, SUGAR] },
      { slug: 'iced-caramel-macchiato', name: 'Iced Caramel Macchiato', description: 'Vanilla, milk, espresso and caramel drizzle over ice.', priceCentavos: 18_500, emoji: '🧋', groups: [SIZE, MILK, EXTRAS] },
    ],
  },
  {
    name: 'Non-Coffee',
    colors: ['#2e8b57', '#1d5c3a'],
    items: [
      { slug: 'matcha-latte', name: 'Matcha Latte', description: 'Ceremonial-grade matcha with milk.', priceCentavos: 17_500, emoji: '🍵', groups: [SIZE, MILK, SUGAR] },
      { slug: 'hot-chocolate', name: 'Tablea Hot Chocolate', description: 'Rich Batangas tablea, served hot.', priceCentavos: 14_000, emoji: '🍫', groups: [SIZE, SUGAR] },
      { slug: 'calamansi-juice', name: 'Calamansi Juice', description: 'Freshly squeezed, served cold.', priceCentavos: 9_500, emoji: '🍋', groups: [SUGAR] },
    ],
  },
  {
    name: 'Pastries',
    colors: ['#d98e04', '#a35d00'],
    items: [
      { slug: 'ensaymada', name: 'Ensaymada', description: 'Soft brioche with butter, sugar and cheese.', priceCentavos: 8_500, emoji: '🥐' },
      { slug: 'banana-bread', name: 'Banana Bread', description: 'Moist loaf slice with walnuts.', priceCentavos: 9_500, emoji: '🍌' },
      { slug: 'ube-cheesecake', name: 'Ube Cheesecake', description: 'Purple yam cheesecake slice.', priceCentavos: 16_500, emoji: '🍰', available: false },
    ],
  },
  {
    name: 'Meals',
    colors: ['#b33a3a', '#7a2020'],
    items: [
      { slug: 'tapsilog', name: 'Tapsilog', description: 'Beef tapa, garlic rice and fried egg.', priceCentavos: 22_000, emoji: '🍳', groups: [{ name: 'Egg', min: 1, max: 1, options: [['Sunny side up', 0], ['Scrambled', 0]] }] },
      { slug: 'chicken-pesto', name: 'Chicken Pesto Pasta', description: 'Grilled chicken, basil pesto, parmesan.', priceCentavos: 24_500, emoji: '🍝' },
      { slug: 'clubhouse', name: 'Clubhouse Sandwich', description: 'Triple-decker with fries on the side.', priceCentavos: 21_000, emoji: '🥪', groups: [{ name: 'Add-ons', min: 0, max: 2, options: [['Extra cheese', 2_500], ['Bacon', 4_500]] }] },
    ],
  },
];

export function isMenuEmpty(db: DB): boolean {
  return db.prepare('SELECT COUNT(*) FROM menu_item').pluck().get() === 0;
}

/** Remove all menu and order data. Development only. */
export function resetData(db: DB): void {
  db.transaction(() => {
    for (const table of [
      'order_line_modifier',
      'order_line',
      'order_event',
      '"order"',
      'daily_counter',
      'modifier',
      'modifier_group',
      'menu_item',
      'category',
    ]) {
      db.exec(`DELETE FROM ${table}`);
    }
  })();
}

/** Insert the demo menu. Image paths are relative to the images dir (e.g. "menu/latte.svg"). */
export function seedMenu(db: DB, menu: SeedCategory[] = DEMO_MENU): void {
  const insertCategory = db.prepare('INSERT INTO category (name, sort) VALUES (?, ?)');
  const insertItem = db.prepare(
    `INSERT INTO menu_item (name, description, price_centavos, category_id, image_path, available, sort)
     VALUES (@name, @description, @price, @categoryId, @imagePath, @available, @sort)`,
  );
  const insertGroup = db.prepare('INSERT INTO modifier_group (item_id, name, min, max, sort) VALUES (?, ?, ?, ?, ?)');
  const insertModifier = db.prepare(
    'INSERT INTO modifier (group_id, name, price_delta_centavos, sort) VALUES (?, ?, ?, ?)',
  );

  db.transaction(() => {
    menu.forEach((category, ci) => {
      const categoryId = insertCategory.run(category.name, ci).lastInsertRowid;
      category.items.forEach((item, ii) => {
        const itemId = insertItem.run({
          name: item.name,
          description: item.description,
          price: item.priceCentavos,
          categoryId,
          imagePath: `menu/${item.slug}.svg`,
          available: item.available === false ? 0 : 1,
          sort: ii,
        }).lastInsertRowid;
        (item.groups ?? []).forEach((group, gi) => {
          const groupId = insertGroup.run(itemId, group.name, group.min, group.max, gi).lastInsertRowid;
          group.options.forEach(([name, delta], mi) => insertModifier.run(groupId, name, delta, mi));
        });
      });
    });
  })();
}

/** Write one SVG placeholder per item into `<imagesDir>/menu/`. */
export function writePlaceholderImages(imagesDir: string, menu: SeedCategory[] = DEMO_MENU): number {
  const dir = join(imagesDir, 'menu');
  mkdirSync(dir, { recursive: true });
  let count = 0;
  for (const category of menu) {
    for (const item of category.items) {
      const svg = placeholderSvg({ title: item.name, subtitle: category.name, emoji: item.emoji, colors: category.colors });
      writeFileSync(join(dir, `${item.slug}.svg`), svg);
      count += 1;
    }
  }
  return count;
}
