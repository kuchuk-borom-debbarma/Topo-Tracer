# Roadmap - Trace Start Events

## Phase 1: Shared API & Database Schema (Trace Events)
**Goal:** Update the ClickHouse schema and Hono API types.
**Plans:** 1 plan
**Requirements:** [SCHEMA-01, API-01, REPO-01]

Plans:
- [x] 01-01-PLAN.md — Update ClickHouse schema and Hono API types (D-22 to D-27).

## Phase 2: Repository & Ingestion Implementation
**Goal:** Update the repositories to handle the new trace start events and importance labels.
**Plans:** 2 plans
**Requirements:** [REPO-01]

Plans:
- [x] 02-01-PLAN.md — Implement write persistence and ingestion consumer fix.
- [x] 02-02-PLAN.md — Implement read retrieval for importance labels.

## Phase 3: Materialization Logic Refactor
**Goal:** Update the materializer to consume from the new trace_events table.
**Plans:** 2 plans
**Requirements:** [REPO-01, MAT-01]

Plans:
- [x] 03-01-PLAN.md — Update Repository Contract & ClickHouse Implementation (REPO-01, MAT-01)
- [x] 03-02-PLAN.md — Refactor Materialization Logic (MAT-01)

## Phase 4: SDK Refactor
**Goal:** Update the Node.js SDK to emit TraceStart events and support importance labels.
**Plans:** 1 plan
**Requirements:** [SDK-01, SDK-02]

Plans:
- [x] 04-01-PLAN.md — Update SDK to emit TraceStart events and handle importance labels.

## Phase 5: UI Integration
**Goal:** Update the UI to display human-readable importance labels.
**Plans:** 1 plan
**Requirements:** [UI-01, UI-02]

Plans:
- [x] 05-01-PLAN.md — Update TraceListPage and TraceDetailPage to display importance labels.
