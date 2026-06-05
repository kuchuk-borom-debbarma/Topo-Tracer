# Phase 6: Verification And Safe Observability - Patterns

**Mapped:** 2026-06-05T21:57:16Z

## Pattern Map

| Planned Area | Primary Files | Closest Existing Analog | Pattern To Reuse |
|--------------|---------------|-------------------------|------------------|
| Worker duplicate delivery tests | `hono-server/src/services/log/internal/worker/ReadOptimisedAggregator.test.ts` | Existing coalescing tests | Directly call `aggregator.run(events)` with fake materializer and assert call counts/order. |
| Materializer idempotency tests | `hono-server/src/services/log/internal/materialization/TraceReadModelMaterializer.test.ts` | Existing checkpoint retry test | Use `FakeRepo`, injected `now`, and inspect `saveReadModel`/`saveCheckpoint` mock calls. |
| Safe materializer logger tests | `TraceReadModelMaterializer.test.ts` | `LogServiceImpl.test.ts` captured `tslog` transport | Prefer a real hidden `Logger` with attached transport when asserting emitted metadata. |
| Projection safe log assertions | `LogServiceImpl.test.ts` | Existing projection orchestration log assertion | Extend metadata assertions rather than creating a separate logger harness. |
| Source safety assertions | Existing source assertions in `LogServiceImpl.test.ts` and `ILogReadRepo.test.ts` | Regex/readFileSync method-body checks | Use `readFileSync` and focused string/regex checks for forbidden keys and scope strings. |
| Projection coverage audit | `LogGraphProjector.test.ts`, `06-TECHNICAL.md` | Phase 5 technical documentation | Record the SAFE-07 matrix in docs; add tests only if a concrete missing case is found. |

## Reusable Test Helpers

- `FakeRepo` in `TraceReadModelMaterializer.test.ts` already extends
  `ILogReadRepo` with Bun mocks for checkpoint/latest/raw/save methods.
- `mockLogger` in `TraceReadModelMaterializer.test.ts` is sufficient for simple
  call-count checks, but safe-log metadata assertions should use the captured
  `tslog` transport pattern from `LogServiceImpl.test.ts`.
- `FakeEventBus` in `LogServiceImpl.test.ts` captures published events and can
  support any source assertions around event publish metadata if needed.
- `createNode` and `createEdge` helpers in `LogGraphProjector.test.ts` already
  provide compact projection fixtures; do not copy them unless an actual
  SAFE-07 gap is discovered.

## Concrete Code Excerpts To Follow

### Direct Worker Invocation

`ReadOptimisedAggregator.test.ts`:

```ts
const materializeTrace = mock(async () => {});
const materializer = { materializeTrace };
const aggregator = new ReadOptimisedAggregator({} as any, materializer);
await aggregator.run(events);
expect(materializeTrace).toHaveBeenCalledTimes(1);
```

### Captured Logger Transport

`LogServiceImpl.test.ts`:

```ts
const capturedLogs: { level: string; args: any[] }[] = [];
const logger = new Logger({ name: "LogServiceImplTest", type: "hidden" });
logger.attachTransport((logObj: any) => {
  const args: any[] = [];
  for (let i = 0; logObj[i] !== undefined; i++) {
    args.push(logObj[i]);
  }
  capturedLogs.push({ level: logObj._meta.logLevelName, args });
});
```

### Source Assertion Pattern

`LogServiceImpl.test.ts`:

```ts
const filePath = join(process.cwd(), "src/services/log/internal/service-impl/LogServiceImpl.ts");
const content = readFileSync(filePath, "utf-8");
const methodMatch = content.match(/async projectTraceGraph[\s\S]*?\{([\s\S]*?)\n  \}/);
expect(methodMatch).not.toBeNull();
expect(methodMatch![1]).not.toContain("loadLatestReadModel");
```

## Constraints For Plans

- Keep all source edits under `hono-server/src` except Phase 6 planning docs.
- Do not add production broker behavior to `DevEventBus` unless execution finds
  a testable gap that is truly in the dev adapter contract.
- Do not add HTTP routes, frontend files, SDK files, or `carno.js` files.
- Do not duplicate the Phase 5 projector suite if the audit confirms SAFE-07 is
  already covered.
