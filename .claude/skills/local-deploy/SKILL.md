---
name: local-deploy
description: Building and running the ordering system on a small local host (Raspberry Pi or mini PC): multi-arch Docker, compose, auto-restart, kiosk screens, health checks, updates. Use when working on deploy/, Dockerfile, compose, systemd, or release steps.
---

# Local deploy

## Build
- Multi-arch image: `docker buildx build --platform linux/arm64,linux/amd64 ...`
- Multi-stage Dockerfile: build apps, copy only the production output and `node_modules --prod`.
- `better-sqlite3` ships arm64 prebuilds; if a native build is needed, do it in the build stage.

## Run
- `docker compose` with `restart: unless-stopped`; DB and backups on bind-mounted volumes outside the container.
- Server listens on `0.0.0.0:3000` (configurable via `PORT`). Serve built customer/staff apps as static files from the server so there is a single process.
- `GET /healthz` returns 200 when the DB is reachable; compose healthcheck uses it.
- Fixed local address: advise a DHCP reservation, and optionally `ordering.local` via mDNS (avahi).

## Staff screens
- Kitchen display: Chromium in kiosk mode, pointed at `/staff/kitchen`, auto-start on boot.
- Disable screen blanking on the kiosk device.

## Updates and rollback
- Tag every release; keep the previous image. Rollback = redeploy the previous tag.
- Run `pnpm db:migrate` as part of startup, after taking a backup.

## Reliability checklist
- DB on SSD, not SD card, where possible
- Nightly backup job verified by a restore test
- Time sync (NTP) enabled; order timestamps depend on it
