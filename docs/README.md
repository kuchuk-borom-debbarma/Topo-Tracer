# Topo Tracer Docs

Start here:

- [Trace Design](./TRACE_DESIGN.md): product/model overview.
- [Backend Schema And Queries](./BACKEND_SCHEMA_AND_QUERIES.md): ClickHouse
  tables, query shapes, materializer, projection, pagination, and safety notes.
- [Development And Verification](./DEVELOPMENT_AND_VERIFICATION.md): local
  ports, seed commands, SDK examples, and smoke checks.

Current design is primitive node-to-node tracing. There is no span/group/container
compatibility layer.
