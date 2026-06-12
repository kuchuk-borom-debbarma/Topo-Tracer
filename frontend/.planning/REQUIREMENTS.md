# Requirements - Trace Start Events

## Functional Requirements
- SDK allows setting a trace name.
- SDK allows mapping importance levels to human-readable labels (e.g. 0 -> "Database").
- UI displays the trace name.
- UI displays the labels for importance levels in the trace detail and list views.

## Technical Requirements
### SDK
- New method/option to emit a `TraceStart` event.
- `trace()` API updated to handle importance labels.

### Backend
- **ClickHouse**: New table `trace_events` (user_id, trace_id, name, importance_labels Map(Int32, String)).
- **Ingestion**: Update `ILogService` and `LogWriteRepo` to handle `IngestTraceStart`.
- **Materializer**: Update `TraceReadModelMaterializer` to fetch from `trace_events` and merge into the summary.
- **Read Model**: Update `ReadTraceSummary` to include `importanceLabels`.

### Frontend
- Update `TraceSummary` type.
- Update UI components to use the labels instead of just "I0", "I1", etc.
