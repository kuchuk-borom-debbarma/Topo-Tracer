# Requirements: Causal Clock-Skew Auto-Correction

## 1. Functional Requirements
- **FR1: Detect Causal Violation**: Identify edges where `toNode.startedAt < fromNode.startedAt`.
- **FR2: Auto-Correct Timestamps**: Adjust `toNode.startedAt` to be `fromNode.startedAt + 1ms` if a violation is detected.
- **FR3: Cascading Correction**: Ensure that if a child is corrected, its own children are also checked and corrected against the new timestamp.
- **FR4: Preserve Durations**: If `startedAt` is adjusted, `endedAt` must also be adjusted by the same delta to preserve the node's original duration.
- **FR5: Diagnostic Increment**: Increment `diagClockSkew` in the trace summary for every node that required correction.

## 2. Technical Requirements
- **TR1: Topological Processing**: Correction must happen in `flowOrder` sequence to ensure parent corrections propagate to children correctly in a single pass.
- **TR2: Materializer Integration**: Logic must reside within `TraceReadModelMaterializer` or a dedicated collaborator invoked by it.
- **TR3: Read-Model Focus**: Only objects destined for `saveReadModel` should be modified.
- **TR4: Memory Efficiency**: Use existing maps (`nodeMap`, `edgeMap`) to avoid unnecessary data cloning.

## 3. Scope & Boundaries
- **In-Scope**:
    - `TraceReadModelMaterializer.ts` updates.
    - Unit tests for clock-skew scenarios.
    - Summary diagnostic updates.
- **Out-of-Scope**:
    - Real-time correction during ingestion (only at materialization time).
    - Updating raw ClickHouse event tables.
    - Changing SDK logic.
