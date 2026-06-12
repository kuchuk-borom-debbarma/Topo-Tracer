# Discussion Log: Phase 2

## Areas Discussed

### Name Extraction
- **Options**: Root Node Only vs First Encountered vs Last Encountered.
- **Decision**: Root Node Only.
- **Rationale**: The root node represents the entry point and logical start of the trace, making it the most authoritative source for the name.

### Node Propagation
- **Options**: Propagate to All Nodes vs Summary Only.
- **Decision**: Summary Only.
- **Rationale**: Keeps the read model lean; trace-level metadata belongs in the summary.
