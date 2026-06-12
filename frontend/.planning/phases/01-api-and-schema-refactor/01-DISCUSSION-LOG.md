# Discussion Log: Phase 1 (Refactor)

## Areas Discussed

### Real-time Labels
- **Options**: Include in Real-time vs Materialized Only.
- **Decision**: Materialized Only.
- **Rationale**: Keeps the Materialized View logic simpler and more performant. Importance labels are typically set once at the start and don't need real-time aggregation complexity.

### Column Cleanup
- **Options**: Hard Delete vs Soft Deprecate.
- **Decision**: Hard Delete.
- **Rationale**: Project is in development phase; a clean schema is preferred over preserving experimental data.
