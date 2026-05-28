# Project: Multi-Resolution Zoom - Dynamic Grouping Overhaul

## Overview
This project overhauls the existing Multi-Resolution Zoom system in Topo-Tracer to replace static "Container Depth" with a dynamic, UI-driven **Semantic Grouping** system. This allows developers to manage "The Wall of Spaghetti" by dynamically categorizing containers (including function-level containers) into nested hierarchies and filtering them out while maintaining graph connectivity via link tunneling.

## Core Objectives
- **Dynamic Grouping:** Implement a UI-based rule engine (regex/name-based) to group containers.
- **Nested Hierarchies:** Support parent-child relationships between logical groups.
- **Link Tunneling:** Ensure that if a container is filtered out, the visual wires "tunnel" through it to the next visible target.
- **High-Resolution Support:** Ensure the system works seamlessly for "function-as-container" models in non-distributed systems.

## Strategic Direction
- **Backend:** Update the materialization engine to support dynamic group resolution or efficient query-time filtering.
- **Frontend:** Introduce a "Grouping Manager" in the UI to define and toggle semantic layers.
- **UX:** Default to "Full Fidelity" (Opt-out) but provide instant semantic cleanup.

## Context
- **Existing System:** Uses a 3-stage materialization pipeline (Nodes -> Edges -> Closures).
- **Database:** ClickHouse (`read_edges`, `nodes`, `edges`).
- **Stack:** Carno.js (Backend), React (Frontend).
