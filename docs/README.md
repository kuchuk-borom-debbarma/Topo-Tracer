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

- [1. Trace Design](./1.trace_design.md): model, write path, graph projection, UI.
- [2. Trace Flow At Code Level](./2.trace_flow_code_level.md): end-to-end write, materialize, read, importance projection, and frontend layout with example state snapshots.
- [3. Backend Schema And Queries](./3.backend_schema_and_queries.md): tables, contracts, event bus, materializer, query shapes.
- [4. Milestone v1 Technical Deep-Dive](./4.milestone_v1_technical_deep_dive.md): deep-dive into read model aggregation, checkpoint strategy, and contiguous ghost grouping.
- [5. Development And Verification](./5.development_and_verification.md): local commands, setup, checks.

### 6. Hono Server
- [6.1. Codebase Architecture & Conventions](./6.hono_server/6.1.codebase.md): Hono server structure, layer dependencies, AI agent rules.

### 7. Node.js SDK
- [7.1. Distributed Tracing](./7.node_js_sdk/7.1.distributed_tracing.md): Propagating context across microservices.
- [7.2. Example Traces](./7.node_js_sdk/7.2.example_traces.md): How to read payload formats.
- [7.3. Performance Tuning](./7.node_js_sdk/7.3.performance_tuning.md): Options for optimizing the SDK batching overhead.
