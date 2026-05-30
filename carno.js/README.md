# carno.js

Backend for Topo-Tracer.

Current stage: primitive write model only.

## Model

```txt
container -> block -> node
edge connects node -> node
```

No logs.
No parent fields.
No GET endpoints yet.
No read-optimized tables.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/telemetry/containers` | Batch insert containers. |
| `POST` | `/telemetry/blocks` | Batch insert blocks. |
| `POST` | `/telemetry/nodes` | Batch insert nodes. |
| `POST` | `/telemetry/edges` | Batch insert node edges. |

More detail: [Backend System](../docs/v2/BACKEND-SYSTEM.md).
