# Roadmap: Causal Clock-Skew Auto-Correction

## Phase 1: Engine Implementation

**Goal:** Implement the causal clock-skew auto-correction engine in the trace materializer.
**Requirements:** [FR1, FR2, FR3, FR4, FR5, TR1, TR2, TR3, TR4]
**Plans:** 3/3 plans complete

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Schema and Type Updates (Explicit tracking fields)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Engine Implementation (correctClockSkew logic)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — Verification (Integration and unit tests)

## Phase 2: Verification & Hardening

**Goal:** Verify and harden the clock-skew correction engine.
**Requirements:** [D-12, D-13, D-14, D-15, D-16, D-17, FR2, FR3, FR4, FR5, TR1, TR4]
**Plans:** 2/3 plans executed

Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Performance Optimization (tinyqueue/Min-Heap)

**Wave 2** *(blocked on 02-01)*

- [x] 02-02-PLAN.md — Stress and Edge Case Testing (D-14, D-16, D-17)

**Wave 3** *(blocked on 02-02)*

- [ ] 02-03-PLAN.md — Persistence Hardening (D-15)
