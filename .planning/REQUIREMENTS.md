# Requirements: Dynamic Grouping Overhaul

## 1. Functional Requirements

### 1.1 Dynamic Grouping Engine
- Users MUST be able to define groups via the UI using name-based regex or prefix matching.
- Groups MUST support nesting (e.g., `Infrastructure -> Storage -> Postgres`).
- The system MUST apply these groups to all containers in the trace view dynamically.

### 1.2 Filtering & Tunneling
- Users MUST be able to toggle the visibility of individual groups or entire branches of the group hierarchy.
- When a group/container is hidden, any visual wires originating from or targeting it MUST "tunnel" to the nearest visible ancestor or descendant to maintain a continuous graph.
- The system MUST support "Opt-out" behavior: show everything by default, filter as needed.

### 1.3 Multi-Resolution Integration
- Filtering MUST work in tandem with the existing Node Depth zoom slider.
- Grouping MUST support both `global` and `local` depth modes.

## 2. Technical Requirements

### 2.1 Backend / Schema
- Update `toco_tracer.read_edges` (or create a new specialized view) to support dynamic group-based coordinate snapping.
- Enhance the Materialization Engine to compute "Potential Tunneling Points" if pre-computation is required for performance.

### 2.2 Frontend / UI
- Add a `GroupManager` component to `TraceControls.tsx`.
- Implement hierarchical toggle chips for group selection.
- Update `TraceGraph.tsx` layout engine to handle "bridged" wires for hidden containers.

## 3. Performance Requirements
- Filtering a group MUST reflect in the UI in < 200ms for traces up to 10,000 nodes.
- Tunneling calculations MUST NOT block the main UI thread (use Web Workers or optimized spatial indexing).
