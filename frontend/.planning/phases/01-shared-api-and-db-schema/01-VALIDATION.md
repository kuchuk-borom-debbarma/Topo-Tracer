# Phase 1 Validation: Shared API & Database Schema

## Acceptance Criteria
- [ ] **AC-1: Schema Extensibility**: \`node_events\`, \`trace_summaries\`, and \`trace_summaries_realtime\` tables in ClickHouse have the new name columns.
- [ ] **AC-2: API Contract**: The \`IngestNodeStart\` type in the backend log service API includes an optional \`traceName\` field.
- [ ] **AC-3: Type Consistency**: The \`ReadTraceSummary\` (Backend) and \`TraceSummary\` (Frontend) types include a mandatory \`name\` field.
- [ ] **AC-4: Ingestion Propagation**: \`LogWriteRepoClickHouse\` correctly maps the \`traceName\` from the API to the \`trace_name\` column in the database.
- [ ] **AC-5: Fallback Integrity**: \`LogReadRepoClickHouse\` returns the \`trace_id\` as the \`name\` if the \`name\` column is NULL in the database.
- [ ] **AC-6: Compilation**: Both the Hono-server and Frontend projects compile successfully without type errors.

## Verification Tests
### Automated Tests
- **Backend Types**: Run \`tsc -p hono-server/tsconfig.json --noEmit\`
- **Frontend Types**: Run \`tsc -p frontend/tsconfig.json --noEmit\`
- **Schema Bootstrap**: Run integration tests for \`hono-server/src/infra/db/clickhouse/schema.ts\` (if available) or verify via ClickHouse CLI.
- **Repository Unit Tests**: Update and run \`LogWriteRepoClickHouse.test.ts\` and \`LogReadRepoClickHouse.test.ts\`.

### Manual Verification
- Inspect ClickHouse schema via CLI: \`DESCRIBE TABLE node_events\`, etc.
- Verify Materialized View definition includes the new mapping.
