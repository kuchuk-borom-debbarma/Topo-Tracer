# Topo-Tracer Write API

Base path: `/telemetry`

Only write endpoints exist in this stage.

## Write Containers

`POST /telemetry/containers`

```json
[
  {
    "id": "api",
    "traceId": "trace_1",
    "name": "API Service",
    "type": "service",
    "metadata": { "region": "local" },
    "createdAtLocal": "2026-05-29T10:00:00.000Z"
  }
]
```

## Write Blocks

`POST /telemetry/blocks`

```json
[
  {
    "id": "block_foo",
    "traceId": "trace_1",
    "containerId": "api",
    "name": "foo()",
    "type": "function",
    "metadata": { "file": "checkout.ts" },
    "startedAtLocal": "2026-05-29T10:00:00.000Z",
    "endedAtLocal": "2026-05-29T10:00:01.000Z"
  }
]
```

## Write Nodes

`POST /telemetry/nodes`

```json
[
  {
    "id": "node_validate",
    "traceId": "trace_1",
    "blockId": "block_foo",
    "name": "validate request",
    "type": "step",
    "metadata": { "valid": true },
    "occurredAtLocal": "2026-05-29T10:00:00.100Z"
  }
]
```

## Write Edges

`POST /telemetry/edges`

```json
[
  {
    "id": "edge_validate_to_call",
    "traceId": "trace_1",
    "fromNodeId": "node_validate",
    "toNodeId": "node_call_bar",
    "type": "flow",
    "metadata": { "branch": "success" },
    "occurredAtLocal": "2026-05-29T10:00:00.200Z"
  }
]
```
