# Topo Tracer Docs

Topo Tracer is a primitive node-to-node trace graph. Current product shape:

- SDK emits node/edge lifecycle events with stable event ids.
- Backend appends raw events, publishes `trace.events.ingested`, and materializes
  read models from that event stream.
- Dev event bus is in-memory. Production bus contract is ready for Kafka later.
- Frontend shows one clean graph workspace: trace rail, free-form graph canvas,
  inspector.
- Graph layout is importance-based. Lower importance number is more important.

Start here:

- [Trace Design](./TRACE_DESIGN.md): model, write path, graph projection, UI.
- [Trace Flow At Code Level](./TRACE_FLOW_CODE_LEVEL.md): end-to-end write,
  materialize, read, importance projection, and frontend layout with example
  state snapshots.
- [Backend Schema And Queries](./BACKEND_SCHEMA_AND_QUERIES.md): tables,
  contracts, event bus, materializer, query shapes.
- [Development And Verification](./DEVELOPMENT_AND_VERIFICATION.md): local
  commands, seed, examples, smoke checks.
