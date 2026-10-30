---
name: sqlite-local-first
description: SQLite and local-first patterns for the ordering server: WAL setup, transactions, migrations, backups, and optional async sync to Supabase. Use when touching the database layer, migrations, backups, or cloud sync.
---

# SQLite, local-first

## Connection setup (run once at startup)
```ts
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');
```
- One process owns the database. Do not open it from multiple services.
- Use prepared statements; wrap multi-row writes in `db.transaction(...)`.
- Keep transactions short. Never await network calls inside one.

## Migrations
- Numbered SQL files in `apps/server/migrations/` (`0001_init.sql`, ...). Applied in order, tracked in a `schema_migrations` table.
- Never edit an applied migration. Add a new one.
- Every migration must be safe to run on a populated database.

## Backups
- Nightly: `sqlite3 shop.db ".backup '/backups/shop-$(date +%F).db'"` (safe while running). Never `cp` a live WAL database.
- Keep the last 14 backups; verify with `PRAGMA integrity_check` on the copy.

## Optional cloud sync (Supabase)
- Sync is a background job reading an `outbox` table; it never blocks order requests.
- Each outbox row has an id, entity, payload, and `synced_at`. Mark synced only after Supabase confirms.
- Make remote upserts idempotent (use the local UUID as the primary key).
- If the internet is down, the outbox just grows; the shop keeps working.
