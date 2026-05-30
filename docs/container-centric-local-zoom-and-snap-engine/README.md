# Master Specification: Container-Centric Local Zooming & Snap Engine

This document defines the complete technical architecture, mathematical models, layout calculation algorithms, and re-linking mechanisms for the **Container-Centric Local Zooming and Snap Engine** in Topo-Tracer.

---

## 1. Executive Summary & Design Philosophy

distributed trace visualization traditionally maps execution paths either globally (a flat, dense, or hard-to-read block timeline) or strictly linearly. Topo-Tracer introduces a **swimlane accordion paradigm** where:
1.  **Vertical Separation (Service Swimlanes):** Physical or logical services (containers) are isolated vertically as horizontal swimlane bands.
2.  **Horizontal Chronology (Logical Column Grid):** Within each container, operations (blocks) flow horizontally based on their chronological order and internal container nesting.
3.  **Local Container Scope Zooming:** Instead of a single global zoom slider that filters nodes across all services uniformly, **each container has its own local zoom depth** controlled independently by `[ - ] Zoom: N [ + ]` button interfaces inside the swimlane headers.
4.  **Durable Endpoint Border Snapping ("Dynamic Link Tunneling"):** When a service container is collapsed (Zoom Depth 0), all connecting incoming and outgoing wires automatically snap to the **left or right boundaries of the collapsed container card itself**, representing a clean, high-level macro view of microservice boundaries. As the container expands (Zoom Depth > 0), the wires dynamically re-link and snap to specific visible row nodes inside the container.

```mermaid
flowchart LR
    subgraph Collapsed [Collapsed Service (Depth 0)]
        C1["⬡ Order API Gateway"]
    end

    subgraph Expanded [Expanded Service (Depth 1)]
        C2["⬡ Order API Gateway"]
        B1["1. POST /checkout"] --> B2["1.1 validateOrder()"]
    end

    E1((Caller)) -->|Snaps to left boundary| C1
    E2((Caller)) -->|Snaps to specific row| B1
```

---

## 2. Terminology & Vocabulary

*   **Container Swimlane:** The horizontal band representing a microservice execution context (e.g. `container-order-api`). It can be **collapsed** (Zoom Depth 0) or **expanded** (Zoom Depth > 0).
*   **Block:** An execution scope or function call trace context inside a container (e.g., a function call, class method execution, database query block).
*   **Node:** A single chronological event or row inside a Block (e.g. a specific query execution checkpoint, standard log print, HTTP ingress point).
*   **Local Block Depth:** The relative horizontal nesting depth of a Block *within its own container*, starting at `0` for the container's entry points.
*   **Snap Target:** The visual element that a connection wire (edge) anchors to. If the target node or its parent block is hidden, the engine traverses the ancestry path to anchor either to the closest visible parent block's row, or falls back to the **container boundary itself** (`container:${id}`).

---

## 3. Mathematical Model & Layout Coordinate Engine

The layout coordinate engine operates deterministically inside the frontend's layout pipeline (`utils/layout.ts`).

### 3.1 Local Block Depth Calculation
For every block $B$ inside a container $C$, we recursively calculate its `localDepth` within that container:
1.  Let the block's `parentBlockId` be $P$.
2.  If $P$ is empty, OR if the block matching $P$ belongs to a *different* container $C' \neq C$, then $B$ is a **Root Block** of container $C$:
    $$\text{localDepth}(B) = 0$$
3.  Otherwise, if $P$ is a block in the same container $C$, $B$ is a **Nested Block**:
    $$\text{localDepth}(B) = \text{localDepth}(P) + 1$$

---

### 3.2 Visual Filtering and Visibility Logic
Let $Z_C \ge 0$ be the active local Zoom Depth of service container $C$. The visibility of blocks and nodes is determined dynamically:

*   **Block Visibility:** A block $B$ in container $C$ is visible if and only if:
    $$Z_C > 0 \quad \text{AND} \quad \text{localDepth}(B) \le Z_C - 1$$
*   **Node Visibility:** A node $N$ belonging to block $B$ is visible if and only if block $B$ is visible:
    $$\text{isVisible}(N) = \text{isVisible}(B)$$

---

### 3.3 Dynamic Space Contracting & Coordinates
The layout manager maps absolute $(X, Y)$ coordinates for visible elements starting from $(0, 0)$:

#### 3.3.1 Collapsed Container Dimensions (Zoom Depth 0)
When $Z_C = 0$, container $C$ is fully collapsed:
*   It contains **no visible blocks**.
*   It is rendered as a clean, single-column horizontal card of fixed dimensions:
    $$\text{width}(C) = \text{COL\_W}$$
    $$\text{height}(C) = \text{CONTAINER\_HEADER\_H}$$
*   The container's left coordinate is aligned to its minimum raw block depth column to preserve grid integrity:
    $$\text{left}(C) = \text{colX}(\text{minDepth}_C) - \text{CONTAINER\_PAD}$$

#### 3.3.2 Expanded Container Dimensions (Zoom Depth $D > 0$)
When $Z_C > 0$, the container expands to fit all visible blocks:
*   Find the minimum and maximum horizontal depths of all *visible* blocks inside container $C$:
    $$\text{minVisibleDepth}_C = \min_{B \in \text{visibleBlocks}_C} \text{absoluteDepth}(B)$$
    $$\text{maxVisibleDepth}_C = \max_{B \in \text{visibleBlocks}_C} \text{absoluteDepth}(B)$$
*   Calculate coordinates and bounds dynamically:
    $$\text{left}(C) = (\text{minVisibleDepth}_C \times (\text{COL\_W} + \text{colGap})) - \text{CONTAINER\_PAD}$$
    $$\text{width}(C) = (\text{maxVisibleDepth}_C \times (\text{COL\_W} + \text{colGap})) + \text{COL\_W} - \text{left}(C) + \text{CONTAINER\_PAD}$$
    $$\text{height}(C) = \text{CONTAINER\_HEADER\_H} + \text{CONTAINER\_PAD} + \text{maxColHeight}_C + \text{CONTAINER\_PAD}$$

---

## 4. Wires & Ancestry Snapping ("Link Tunneling")

When drawing a visual edge wire between source node $S$ and target node $T$:

### 4.1 Snapping Target Resolution
We resolve the visual anchor points `resolveNodeId(S)` and `resolveNodeId(T)`:

1.  Create a set of all currently visible node IDs `visibleNodeIds`.
2.  To resolve a node ID $N$:
    *   If $N$ is in `visibleNodeIds`, return $N$.
    *   If $N$ is a helper ID (e.g. ends with `_caller`), strip the suffix and check if the bare ID is visible. If so, return it.
    *   Otherwise, look up $N$ in the full-trace node map `allNodesMap`:
        *   Traverse the node's `ancestryPath` backwards (from child to parent block).
        *   If a visible ancestor node ID is found, return it.
        *   If **no visible ancestor node** is found (because the parent block is hidden or the container is collapsed at Zoom Depth 0), return:
            $$\text{snapTarget} = \text{"container:"} + \text{containerId}_N$$

---

### 4.2 Anchor Coordinates Calculation
When drawing path lines, coordinates are calculated based on the snapped target:

*   **If the snapped target is a Node ID ($N$):**
    *   Look up the node's center $Y$ coordinate `centerY` and the parent card's left/right boundaries.
    *   **Source Endpoint:** $X = \text{blockRight}_N + \text{PAD} + 4$, $Y = \text{centerY}_N + \text{PAD}$
    *   **Target Endpoint:** $X = \text{blockLeft}_N + \text{PAD} - 6$, $Y = \text{centerY}_N + \text{PAD}$
*   **If the snapped target is a Container boundary (`container:C`):**
    *   Look up the container's layout bounds (`left`, `top`, `width`, `height`).
    *   **Source Endpoint:** $X = \text{left}_C + \text{width}_C + \text{PAD} + 4$, $Y = \text{top}_C + \text{PAD} + (\text{CONTAINER\_HEADER\_H} / 2)$
    *   **Target Endpoint:** $X = \text{left}_C + \text{PAD} - 6$, $Y = \text{top}_C + \text{PAD} + (\text{CONTAINER\_HEADER\_H} / 2)$

This mathematically ensures that lines originate cleanly from expanded rows or collapsed container borders, preserving logical connectivity at any zoom scope.

---

## 5. Directory Mapping & System Architecture

```text
frontend/src/
├── api/
│   └── client.ts           # Unified API layout payload client
├── utils/
│   └── layout.ts           # Dynamic local-depth resolver and snapped wire calculator
├── components/
│   ├── TraceFlowCanvas.tsx # SVG wire drawer and timeline container layout mapper
│   ├── BlockCard.tsx       # Glassmorphic execution card renderer
│   └── NodeRow.tsx         # Chronological event row renderer
└── pages/
    └── TraceDetailPage.tsx # React containerZoomDepths state manager & control buttons
```
