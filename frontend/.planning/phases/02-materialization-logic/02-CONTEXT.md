# Phase 2 Context: Materialization Logic

## Domain
Phase 2 implements the logic within the `TraceReadModelMaterializer` to extract the trace name from the incoming event stream and persist it in the `ReadTraceSummary`.

## Decisions
### Name Extraction
- **D-08: Source Node**: The trace name MUST be extracted from the node with no parent (Root Node).
- **D-09: Strategy**: If a `traceName` is present in the `IngestNodeStart` event of the root node, it becomes the name for the entire trace.

### Persistence
- **D-10: Scope**: The name will only be persisted in the `ReadTraceSummary`. It will NOT be propagated to individual nodes in the `read_nodes` table, despite the column existence.

## Canonical Refs
- `hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.ts` (Logic source)

## Code Context
- `handleNodeStart`: Needs to detect if the node is a root node and extract the `traceName`.
- `buildSummary`: Needs to include the extracted name.
