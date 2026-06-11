# Roadmap - Trace Names Support

## Phase 1: Shared API & Database Schema (Backend)
**Goal:** Update the system's shared API and database schema to support optional trace names.
**Plans:** 3 plans

Plans:
- [ ] 01-01-PLAN.md — Shared Type Definitions (API, Repo, Frontend)
- [ ] 01-02-PLAN.md — ClickHouse Schema Migration (Tables & MV)
- [ ] 01-03-PLAN.md — Repository Implementation (Read/Write & Fallback)

## Phase 2: Materialization Logic (Backend)
- [ ] Update `TraceReadModelMaterializer.ts` to extract and store trace names.

## Phase 3: SDK Integration
- [ ] Update `sdks/node-js/src/types.ts`
- [ ] Update `sdks/node-js/src/Tracer.ts` to allow passing trace names.

## Phase 4: Frontend Visualization
- [ ] Update `frontend/src/types.ts`
- [ ] Update `frontend/src/ui/TraceListPage.tsx`
- [ ] Update `frontend/src/ui/TraceDetailPage.tsx`

## Phase 5: Verification
- [ ] End-to-end test: SDK sends trace with name -> Backend materializes -> Frontend displays.
