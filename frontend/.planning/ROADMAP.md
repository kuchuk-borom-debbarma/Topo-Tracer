# Roadmap - Trace Start Events

## Phase 1: Shared API & Database Schema (Trace Events)
**Goal:** Update the ClickHouse schema and Hono API types.
**Plans:** 1 plan
**Requirements:** [SCHEMA-01, API-01, REPO-01]

Plans:
- [ ] 01-01-PLAN.md — Update ClickHouse schema and Hono API types (D-22 to D-27).

## Phase 2: Repository & Ingestion Implementation
**Goal:** Update the repositories to handle the new trace start events and importance labels.
**Plans:** 2 plans
**Requirements:** [REPO-01]

Plans:
- [ ] 02-01-PLAN.md — Implement write persistence and ingestion consumer fix.
- [ ] 02-02-PLAN.md — Implement read retrieval for importance labels.

## Phase 3: Materialization Logic Refactor
**Goal:** Update the materializer to consume from the new trace_events table.
**Plans:** 2 plans
**Requirements:** [REPO-01, MAT-01]
- [ ] 03-01-PLAN.md — Update Repository Contract & ClickHouse Implementation (REPO-01, MAT-01)
- [ ] 03-02-PLAN.md — Refactor Materialization Logic (MAT-01)

## Phase 4: SDK Refactor
- [ ] Update `Tracer` to emit `TraceStart` events.
- [ ] Support importance level label configuration in the fluent API.

## Phase 5: UI Integration
- [ ] Update `TraceListPage` and `TraceDetailPage` to display importance labels.
