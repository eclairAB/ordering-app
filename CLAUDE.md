# Local Ordering System (coffee shop / restaurant)

Locally hosted ordering system. Customers order from their phones over the shop LAN; staff see orders on a kitchen/counter screen. It must keep working with the internet down. Target: ~50 concurrent customers on a single small host (Raspberry Pi 4/5 or a mini PC).

## Stack (change here if you pick differently)
- Language: TypeScript everywhere (strict mode)
- Server: Node 22.18+ with Fastify (runs `.ts` directly via built-in type stripping), SQLite via `better-sqlite3` (WAL mode)
- Realtime: Server-Sent Events for order status; WebSocket only if SSE is insufficient
- Customer app: React + Vite (mobile-first PWA)
- Staff app: React + Vite (kitchen display + counter/admin)
- Optional cloud sync: Supabase, async and best-effort, never on the request path
- Packaging: Docker (multi-arch: linux/arm64 and linux/amd64)

## Layout
```
apps/server/     Fastify API, SQLite, migrations, SSE
apps/customer/   Customer ordering PWA
apps/staff/      Kitchen display + counter/admin
packages/shared/ Zod schemas, types, money helpers (shared by all apps)
deploy/          Dockerfile, compose, systemd units, backup scripts
```

## Commands
- `pnpm install` install all workspaces
- `pnpm dev` run server + both apps
- `pnpm test` unit + integration tests (Vitest)
- `pnpm lint` and `pnpm typecheck` must pass before any commit
- `pnpm db:migrate` apply migrations
- `pnpm loadtest` simulate 50 concurrent customers (k6 script in `deploy/loadtest/`)

## Hard rules
1. **Money is integer centavos.** Never floats. Use helpers in `packages/shared/money.ts`.
2. **Validate every request body with the Zod schema from `packages/shared`.** Never trust client prices; the server recomputes totals from the menu table.
3. **Order creation must be idempotent.** The client sends an `Idempotency-Key`; a retry returns the original order, never a duplicate.
4. **Migrations only.** Never edit the schema by hand or modify an applied migration; add a new one.
5. **No internet dependency on the request path.** No CDN fonts/scripts at runtime, no calls to cloud APIs while serving an order.
6. **SQLite discipline:** WAL mode, `busy_timeout` set, prepared statements, writes in short transactions. One server process owns the DB.
7. **Staff and customer routes are separate.** Staff routes require auth; customer routes are rate limited. Never expose staff endpoints on the customer path.
8. **Never commit secrets** or the `.db` file. Config comes from env vars; see `.env.example`.
9. Don't add a dependency without saying why. This runs on a small device; prefer small, boring libraries.

## Conventions
- Small, typed functions; no `any`. Errors are returned as `{ error: { code, message } }` with correct HTTP status.
- Tests live beside the code (`*.test.ts`). Every bug fix gets a regression test.
- Commit messages: imperative, one logical change each.

## Skills and agents available
- Skills (auto-loaded when relevant): `order-domain`, `sqlite-local-first`, `local-deploy`
- Subagents: `code-reviewer` (read-only review), `test-writer`, `load-tester`
- Use `code-reviewer` before finishing any change that touches orders, money, or the DB.

## Out of scope for now
Hardware selection, Wi-Fi/captive portal/voucher handling. Keep the app network-agnostic: it just listens on a port.
