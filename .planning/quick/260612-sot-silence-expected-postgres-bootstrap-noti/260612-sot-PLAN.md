# Quick Task 260612-sot: Silence expected Postgres bootstrap notices

Status: in-progress

## Goal

Keep direct development table bootstrap, but stop expected `CREATE IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS` notices from polluting server logs.

## Tasks

1. Filter only known idempotent Postgres bootstrap notices.
2. Keep unexpected Postgres notices visible.
3. Run Hono typecheck.
