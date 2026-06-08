# Roadmap: Durable Graph Window Paging (V2 Windowing)

## Phase 1: API & Repository Foundation
- [ ] **Task 1.1: Update API Types**: Modify `api/types.ts` to include paging metadata and updated `ProjectedGraphResult`.
- [ ] **Task 1.2: Update Repo Contract**: Add `offset` and `limit` to `ILogReadRepo` methods (`loadBoundedProjectionNodes`, etc.).
- [ ] **Task 1.3: Implement ClickHouse Paging**: Update `LogReadRepoClickHouse.ts` to use `flow_order >= {offset}` and `LIMIT {limit + 1}`.
- [ ] **Task 1.4: Unit Tests for Repo**: Verify paging logic in `LogReadRepoClickHouse.test.ts`.

**Plans:** 1 plan
- [ ] 01-01-PLAN.md — Define paging types, CursorCodec utility, and update ClickHouse repo implementation with limit+1 probing.

## Phase 2: Service-Level Projection
- [ ] **Task 2.1: Update LogServiceImpl**: Pass `cursor` and `limit` from API through to the repository.
- [ ] **Task 2.2: Paging Metadata Calculation**: Implement logic to calculate `hasBefore`, `hasAfter`, `previousCursor`, and `nextCursor`.
- [ ] **Task 2.3: Integrate with Projector**: Ensure `LogGraphProjector` handles the windowed data correctly (it should, as it's window-agnostic).
- [ ] **Task 2.4: Integration Tests**: Verify end-to-end paging through `LogServiceImpl.test.ts`.

## Phase 3: Frontend Alignment (Optional/Verification)
- [ ] **Task 3.1: Verify Frontend Paging**: Check if Hono routes need updates to expose the new parameters.
- [ ] **Task 3.2: API Documentation**: Ensure the new `cursor` and `limit` query params are documented or at least functional.
