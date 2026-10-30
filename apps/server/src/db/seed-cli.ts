import { loadConfig } from '../config.ts';
import { openDatabase } from './connection.ts';
import { migrate } from './migrate.ts';
import { isMenuEmpty, resetData, seedMenu, writePlaceholderImages } from './seed.ts';

const reset = process.argv.includes('--reset');
const config = loadConfig();
const db = openDatabase(config.dbPath);
migrate(db);

if (!isMenuEmpty(db) && !reset) {
  console.log('Menu already has items; nothing to do. Use `pnpm db:seed --reset` to wipe menu AND orders.');
} else {
  if (reset) resetData(db);
  seedMenu(db);
  const images = writePlaceholderImages(config.imagesDir);
  console.log(`Seeded demo menu and wrote ${images} placeholder images to ${config.imagesDir}/menu`);
}
db.close();
