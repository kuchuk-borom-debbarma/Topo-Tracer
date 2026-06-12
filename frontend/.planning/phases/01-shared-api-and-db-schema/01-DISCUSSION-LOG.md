# Discussion Log: Phase 1

## Areas Discussed

### Column Naming
- **Options**: Standardized Name (trace_name in events, name in summaries) vs Uniform 'name'.
- **Decision**: Standardized Name.
- **Rationale**: Keeps consistency with existing naming patterns in events vs summaries.

### API Structure
- **Options**: First-class Field vs Data Map (Dynamic).
- **Decision**: First-class Field.
- **Rationale**: Better performance and type safety for a core metadata field.

### Real-time Availability
- **Options**: Yes, Real-time Name vs Materialized Only.
- **Decision**: Yes, Real-time Name.
- **Rationale**: User wants the name to be visible in the list as soon as ingestion begins.

### DB Fallback
- **Options**: UI-side Fallback vs DB-side Fallback.
- **Decision**: DB-side Fallback.
- **Rationale**: Ensures consistency across all consumers of the data.

## Deferred Ideas
- None.
