# Roadmap - Trace Names Support

## Phase 1: Shared API & Database Schema (Backend)
**Goal:** Update the system's shared API and database schema to support optional trace names.
**Plans:** 3 plans

Plans:
- [x] 01-01-PLAN.md — Shared Type Definitions (API, Repo, Frontend)
- [x] 01-02-PLAN.md — ClickHouse Schema Migration (Tables & MV)
- [x] 01-03-PLAN.md — Repository Implementation (Read/Write & Fallback)

## Phase 2: Materialization Logic (Backend)
**Goal:** Update the materializer to extract the trace name from the root node and include it in the summary.
**Plans:** 1 plan

Plans:
- [x] 02-01-PLAN.md — Trace Name Extraction Logic & Tests

## Phase 3: SDK Integration
**Goal:** Update the Node.js SDK to support trace names via the fluent API and enforce root-only attachment.
**Plans:** 1 plan

Plans:
- [ ] 03-01-PLAN.md — SDK Trace Name Support & Root Enforcement

## Phase 4: Frontend Visualization
- [ ] Update `frontend/src/types.ts`
- [ ] Update `frontend/src/ui/TraceListPage.tsx`
- [ ] Update `frontend/src/ui/TraceDetailPage.tsx`

## Phase 5: Verification
- [ ] End-to-end test: SDK sends trace with name -> Backend materializes -> Frontend displays.
