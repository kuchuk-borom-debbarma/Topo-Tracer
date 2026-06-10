# Project: Causal Clock-Skew Auto-Correction

## Context
In distributed microservices, separate servers often suffer from clock skew. If a parent node on Server A calls a child node on Server B, the telemetry may report the child node started before the parent call. This leads to negative durations, broken graph layouts, and failed diagnostic checks in Topo-Tracer.

## Goals
- Build an auto-correction engine in `TraceReadModelMaterializer`.
- Detect causal violations where `child.startedAt < parent.startedAt`.
- Adjust child timestamps to align causally (e.g., `parent.startedAt + 1ms`).
- Persist corrected timestamps to the read-optimized ClickHouse tables.
- Keep raw telemetry events unchanged for auditing.

## Technical Strategy
- **Topological Traversal**: Leverage the `flowOrder` computed during materialization to process nodes in causal sequence.
- **Timestamp Dampening**: When a causal violation is detected, shift the child's `startedAt` and `endedAt` to be >= parent's `startedAt`.
- **Diagnostic Reporting**: Update the `diagClockSkew` counter to reflect corrected violations.
- **Integration Point**: Add a `correctClockSkew` step in `TraceReadModelMaterializer.materializeTrace` after topological ordering but before persistence.

## Constraints
- Minimal correction: `child.startedAt = parent.startedAt + 1ms`.
- Zero tolerance: Correct even 1ms skew.
- Read Model Only: Corrected data lives in `read_nodes` and `read_edges`.
