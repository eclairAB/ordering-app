import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DB } from './connection.ts';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));
const MIGRATION_FILE = /^\d{4}_[a-z0-9_]+\.sql$/;

/** Apply pending numbered migrations in order. Returns the files that were applied. */
export function migrate(db: DB, dir: string = MIGRATIONS_DIR): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').pluck().all() as string[],
  );
  const record = db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)');
  const pending = readdirSync(dir)
    .filter((file) => MIGRATION_FILE.test(file) && !applied.has(file))
    .sort();

  for (const file of pending) {
    const sql = readFileSync(join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      record.run(file, new Date().toISOString());
    })();
  }
  return pending;
}
