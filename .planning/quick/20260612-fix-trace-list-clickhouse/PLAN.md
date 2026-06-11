---
status: in-progress
kind: quick
---

# Fix Trace List ClickHouse Query

Fix the Hono trace list read query that fails with ClickHouse `ILLEGAL_AGGREGATION` because aggregate aliases are referenced from `WHERE`.

## Steps

- Inspect `LogReadRepoClickHouse.loadTraceSummaries`.
- Rewrite tenant filtering so ClickHouse does not evaluate aggregate functions in `WHERE`.
- Run focused Hono tests or type/build check.
- Record summary.
