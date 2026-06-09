# Phase 2: Verification & Hardening - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase focuses on the rigorous verification and performance hardening of the causal clock-skew auto-correction engine implemented in Phase 1. It ensures the system is production-ready by stress-testing edge cases, validating persistence mapping without a live DB, and establishing performance benchmarks for large traces.

</domain>

<decisions>
## Hardening Decisions

### Performance & Tracking
- **D-12: Capacity:** Support traces up to **50,000 nodes** without memory exhaustion.
- **D-13: Latency:** The `correctClockSkew` pass must execute in **< 5ms per 1,000 nodes**.
- **D-14: Depth:** Support causal nesting (parent-child chains) up to **5,000 levels deep** without stack overflow.
- **D-18: Performance Logging:** Maintain a persistent `performance.json` log to track materialization latency and memory usage trends across runs (enabling regression detection).
- **D-19: Optimization Dependency:** Use `tinyqueue` as a production dependency to achieve $O(\log N)$ topological sort candidate management.

### Persistence Hardening
- **D-15: Strategy:** Use **Mock-based Integration** (Option A). Verify that corrected timestamps, `originalStartedAt`, and `clockSkewMs` are correctly mapped to SQL `INSERT` values using the existing `FakeClickHouseClient`.

### Edge Case & Async Handling
- **D-16: Stress Scenarios:** Specifically test:
    - **Massive Fan-out/Fan-in:** One parent to 10k children; one child to 100 parents.
    - **Extreme Skew:** A child starting 1 hour before its parent (testing "Slow Clock" robustness).
    - **Out-of-Order Events:** Ensure `flowOrder` sorting correctly handles events arriving in reverse causal order before correction.
- **D-17: Cross-Trace Edges:** Edges pointing to `fromNodeId` values not present in the current `nodesArray` must be **ignored** for skew correction purposes (as parent timing context is missing).
- **D-20: Ghost Consistency:** Clock-skew correction and diagnostic counting (`diagClockSkew`) must apply to **all** nodes in the trace, ensuring full causal consistency even for nodes that may be ghosted in the UI.
- **D-21: Graceful Degradation:** If a trace exceeds established limits (D-12, D-14), the materializer should **partial-materialize** (correcting what it can) and flag a `diagLimitExceeded` diagnostic in the summary rather than aborting.

</decisions>

<canonical_refs>
## Canonical References

### Core Logic
- `hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.ts` — The correction engine.
- `hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.clockSkew.test.ts` — Existing unit tests.

### Infrastructure
- `hono-server/src/services/log/internal/repo/impl/LogReadRepoClickHouse.ts` — Persistence mapping.
- `hono-server/src/services/log/internal/repo/impl/test-helpers.ts` — `FakeClickHouseClient` and repo mocks.

</canonical_refs>

<code_context>
## Reusable Assets
- **`FakeReadRepo`**: For materializer-level mocking.
- **`FakeClickHouseClient`**: For SQL mapping verification.
- **Topological Logic**: `computeFlowOrder` is the prerequisite for stable correction.

</code_context>

<specifics>
- Ignore cross-trace edges for skew correction (D-17).
- Preserve existing "Zero Tolerance" (D-02) and "Lazy Propagation" (D-06) behaviors from Phase 1.
</specifics>

<deferred>
- **Live Docker ClickHouse**: Deferred to a future integration milestone if mock-based verification proves insufficient.
</deferred>

---

*Phase: 2-Verification & Hardening*
*Context gathered: 2026-06-09*
