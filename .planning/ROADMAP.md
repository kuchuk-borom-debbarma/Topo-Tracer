# Roadmap: Dynamic Grouping Overhaul

## Phase 1: Core Schema & Grouping Logic (Backend)
- [ ] **Task 1.1:** Update ClickHouse schema to support container metadata/group tags.
- [ ] **Task 1.2:** Implement a "Dynamic Rule Processor" that maps containers to groups based on user-defined patterns.
- [ ] **Task 1.3:** Enhance `TraceClosureBuilder` to support group-aware snapping.

## Phase 2: Tunneling & Layout Engine (Frontend/Graph)
- [ ] **Task 2.1:** Implement "Link Tunneling" logic in `TraceGraph.tsx` to bridge links across hidden containers.
- [ ] **Task 2.2:** Update SVG wire drawing to handle "bridged" paths gracefully.
- [ ] **Task 2.3:** Add support for rendering nested group boundaries in the canvas.

## Phase 3: UI Controls & Group Manager (UX)
- [ ] **Task 3.1:** Create the `GroupManager` UI in `TraceControls.tsx` with regex input and hierarchical toggles.
- [ ] **Task 3.2:** Implement "Opt-out" default state management.
- [ ] **Task 3.3:** Add "Importance" presets (e.g., "Show Only Domain Logic").

## Phase 4: Validation & Optimization
- [ ] **Task 4.1:** Verify performance with 10k+ node "Function-as-Container" traces.
- [ ] **Task 4.2:** Integration testing for non-distributed monolithic traces.
