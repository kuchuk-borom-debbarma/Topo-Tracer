# Backend System

Current backend is write-only and primitive. It stores graph facts. It does not calculate layout yet.

## Big Picture

```txt
SDK / client
  -> POST /telemetry/containers
  -> POST /telemetry/blocks
  -> POST /telemetry/nodes
  -> POST /telemetry/edges
Backend
  -> stores rows in ClickHouse
```

No GET endpoints in this stage.
No read-optimized tables.
No parent fields.
No layout derivation.

On app boot, backend drops old Topo-Tracer tables and recreates current schema. This is intentional while model is still changing.

## Data Model

### Container

Large runtime boundary.

```txt
traceId + container id + name + type
```

Stored table: `toco_tracer.containers`

### Block

Scope inside container.

```txt
traceId + block id + containerId + name + type
```

Stored table: `toco_tracer.blocks`

Blocks have no local timestamp fields in this stage. Future read logic can derive block timing from nodes.

### Node

Primitive point inside block. Stored as append-only lifecycle events.

```txt
traceId + node id + blockId + name + type
```

Stored table: `toco_tracer.nodes`

### Edge

Primitive flow connection between nodes. Stored as append-only lifecycle events.

```txt
traceId + fromNodeId + toNodeId + type
```

Stored table: `toco_tracer.edges`

## Why Edges

Edges are lowest-level truth. They can represent:

- sequential flow
- branch flow
- function call
- async jump
- cross-container jump

Later read model can interpret edge `type` and node/block/container grouping.

## Code Shape

```txt
src/index.ts
  app boot + dependency registration

src/infra/ClickHouseService.ts
  ClickHouse client + dev schema reset + table creation

src/routes/LogController.ts
  HTTP write endpoints

src/services/log/types.ts
  domain types

src/services/log/LogService.ts
  service contract

src/services/log/internal/LogServiceImpl.ts
  tiny enrichment layer

src/services/log/internal/LogRepo.ts
  repo contract

src/services/log/internal/repo-impls/LogRepoClickHouseImpl.ts
  ClickHouse insert implementation
```

## Write Flow

### Container Write

```txt
POST /telemetry/containers
  -> LogController.logContainers
  -> LogServiceImpl.logContainers
     adds createdAtRemote
     metadata defaults to null
  -> LogRepoClickHouseImpl.saveContainers
     Date -> epoch ms
     metadata -> JSON string
     insert to toco_tracer.containers
```

### Block Write

```txt
POST /telemetry/blocks
  -> LogController.logBlocks
  -> LogServiceImpl.logBlocks
     metadata defaults to null
  -> LogRepoClickHouseImpl.saveBlocks
     traceId -> trace_id
     Date -> epoch ms
     insert to toco_tracer.blocks
```

### Node Write

```txt
POST /telemetry/nodes
  -> LogController.logNodes
  -> LogServiceImpl.logNodes
     metadata defaults to null
  -> LogRepoClickHouseImpl.saveNodes
     traceId -> trace_id
     Date -> epoch ms
     insert to toco_tracer.nodes
```

### Edge Write

```txt
POST /telemetry/edges
  -> LogController.logEdges
  -> LogServiceImpl.logEdges
     metadata defaults to null
  -> LogRepoClickHouseImpl.saveEdges
     traceId -> trace_id
     Date -> epoch ms
     insert to toco_tracer.edges
```

## Table Schemas

### `containers`

```txt
id String
trace_id String
name String
type String
metadata String
createdAtLocal Int64
createdAtRemote Int64
```

### `blocks`

```txt
id String
trace_id String
containerId String
name String
type String
metadata String
```

### `nodes`

```txt
id String
trace_id String
blockId String
name String
type String
metadata String
eventType Enum8('started' = 1, 'ended' = 2)
eventAtLocal Int64
ingestedAtRemote Int64
```

### `edges`

```txt
id String
trace_id String
fromNodeId String
toNodeId String
type String
metadata String
eventType Enum8('requested' = 1, 'responded' = 2)
eventAtLocal Int64
ingestedAtRemote Int64
```

## Next Step

Best next step: create one sample trace JSON with containers, blocks, nodes, edges. Use it to verify model before adding reads.

Future read collapse for nodes:

```sql
SELECT
  id,
  minIf(eventAtLocal, eventType = 'started') AS startedAtLocal,
  maxIf(eventAtLocal, eventType = 'ended') AS endedAtLocal
FROM toco_tracer.nodes
WHERE trace_id = {traceId: String}
GROUP BY id
```

Future read collapse for edges:

```sql
SELECT
  id,
  minIf(eventAtLocal, eventType = 'requested') AS requestedAtLocal,
  maxIf(eventAtLocal, eventType = 'responded') AS respondedAtLocal
FROM toco_tracer.edges
WHERE trace_id = {traceId: String}
GROUP BY id
```
