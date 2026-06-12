# Discussion Log: Phase 3

## Areas Discussed

### SDK API
- **Options**: Options-based vs Fluent-based vs Both.
- **Decision**: Fluent-based.
- **Rationale**: User prefers the fluent `trace()` API for setting trace-level metadata.

### Root Enforcement
- **Options**: Enforce Root Only vs Allow Any.
- **Decision**: Enforce Root Only.
- **Rationale**: Aligns with the backend's "Root Node Only" extraction strategy and prevents confusing client-side behavior where non-root names are ignored.
