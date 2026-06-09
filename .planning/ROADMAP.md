# Roadmap: Causal Clock-Skew Auto-Correction

## Phase 1: Engine Implementation

**Goal:** Implement the causal clock-skew auto-correction engine in the trace materializer.
**Requirements:** [FR1, FR2, FR3, FR4, FR5, TR1, TR2, TR3, TR4]
**Plans:** 2/3 plans executed

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Schema and Type Updates (Explicit tracking fields)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Engine Implementation (correctClockSkew logic)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 01-03-PLAN.md — Verification (Integration and unit tests)

## Phase 2: Verification & Hardening

- [ ] **Task 2.1: Unit Tests**: Add edge-case tests (deep nesting, cycles, async edges).
- [ ] **Task 2.2: Persistence Check**: Verify ClickHouse `read_nodes` and `read_edges` receive corrected timestamps.
- [ ] **Task 2.3: Performance Audit**: Ensure topological fold remains efficient for large traces.
