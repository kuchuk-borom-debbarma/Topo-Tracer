# Roadmap: Causal Clock-Skew Auto-Correction

## Phase 1: Engine Implementation
**Goal:** Engine Implementation for Causal Clock-Skew Auto-Correction.
**Plans:** 3 plans

Plans:
- [ ] 01-01-PLAN.md — Schema and Type Updates (Explicit tracking fields)
- [ ] 01-02-PLAN.md — Engine Implementation (correctClockSkew logic)
- [ ] 01-03-PLAN.md — Verification (Integration and unit tests)

## Phase 2: Verification & Hardening
- [ ] **Task 2.1: Unit Tests**: Add edge-case tests (deep nesting, cycles, async edges).
- [ ] **Task 2.2: Persistence Check**: Verify ClickHouse `read_nodes` and `read_edges` receive corrected timestamps.
- [ ] **Task 2.3: Performance Audit**: Ensure topological fold remains efficient for large traces.
