# Topo-Tracer Core Concept

Current backend stores primitive trace graph data only.

```txt
container = large runtime boundary
block     = scope inside a container
node      = smallest visual/event point inside a block
edge      = connection from one node to another node
```

## Container

Container represents something big:

- service
- worker
- process
- module

Fields:

- `id`
- `traceId`
- `name`
- `type`
- `metadata`
- `createdAtLocal`
- `createdAtRemote`

## Block

Block represents function/scope region inside container.

Fields:

- `id`
- `traceId`
- `containerId`
- `name`
- `type`
- `metadata`

Block has no parent field and no timestamp fields. Later reads can calculate block timing from child nodes.

## Node

Node represents primitive point inside block. Node writes are append-only lifecycle events.

Examples:

- function entry point
- operation step
- important event
- branch marker
- call site

Fields:

- `id`
- `traceId`
- `blockId`
- `name`
- `type`
- `metadata`
- `eventType`: `started` or `ended`
- `eventAtLocal`
- `ingestedAtRemote`

Node has no parent field.

## Edge

Edge connects nodes. Edge writes are append-only lifecycle events.

```txt
fromNodeId -> toNodeId
```

Fields:

- `id`
- `traceId`
- `fromNodeId`
- `toNodeId`
- `type`
- `metadata`
- `eventType`: `requested` or `responded`
- `eventAtLocal`
- `ingestedAtRemote`

Edge is source of flow truth.
Later read logic can collapse node events into `startedAtLocal` / `endedAtLocal` and edge events into `requestedAtLocal` / `respondedAtLocal`.

## Why This Stage Is Primitive

No read-optimized tables yet.
No derived layout yet.
No GET endpoints yet.

Reason: build storage model first. Then inspect/write sample traces. Then add reads/layout once model feels right.
