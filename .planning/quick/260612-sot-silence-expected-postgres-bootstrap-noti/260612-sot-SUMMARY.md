# Quick Task 260612-sot: Silence expected Postgres bootstrap notices

Status: complete

## What changed

- Kept direct development Postgres table bootstrap.
- Added narrow `onnotice` filtering for expected idempotent bootstrap notices:
  - `42P07`: relation already exists
  - `42701`: column already exists
- Left all other Postgres notices visible.

## Verification

- `bunx tsc --noEmit` in `hono-server` passed.
