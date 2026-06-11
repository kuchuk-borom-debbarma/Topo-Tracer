---
status: complete
---

# Fix Trace List ClickHouse Query

Fixed the Hono trace list query that failed with ClickHouse `ILLEGAL_AGGREGATION`.

## Completed

- Qualified trace summary table references with alias `s`.
- Changed tenant filter from ambiguous `WHERE user_id = ...` to `WHERE s.user_id = ...`.
- Updated focused repository test assertion for the corrected query.

## Verification

- `bun test hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.test.ts` passed.
- `bun test hono-server/src/services/log/internal/service-impl/LogServiceImpl.test.ts` passed.
- `git diff --check` passed.
- Live authenticated `GET /api/v1/traces?page=1&limit=15` returned `200 OK` with `totalCount: 19`.
