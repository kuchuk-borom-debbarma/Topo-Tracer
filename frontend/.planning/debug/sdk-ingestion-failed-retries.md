---
status: resolved
trigger: "Investigate why SDK integration tests are failing with 'Ingestion failed after retries'."
created: 2025-02-18T12:00:00Z
updated: 2025-02-18T12:05:00Z
---

## Current Focus

hypothesis: Extra `IngestTraceStart` parameters in `ingestWithRetry` and `ingest` caused argument shift, making `retries` undefined in `ingestWithRetry`, leading to the loop not executing.
test: Removed the extra parameters and ran tests.
expecting: Tests should pass.
next_action: None, debugging complete.

## Symptoms

expected: SDK integration tests pass, meaning ingestion succeeds (mocked fetch returns 200)
actual: `bun test sdks/node-js/tests/integration.test.ts` fails with `Ingestion failed after retries`
errors: Ingestion failed after retries
reproduction: bun test sdks/node-js/tests/integration.test.ts
started: Recently, after updating to globalThis.fetch

## Eliminated

## Evidence

- 2025-02-18: Observed `ingestWithRetry` and `ingest` method signatures in `Tracer.ts` have an extra `IngestTraceStart` parameter.
- 2025-02-18: `ingestWithRetry` is called with 2 arguments in `flush`, but it has 3 parameters: `data`, `IngestTraceStart`, `retries`.
- 2025-02-18: This makes `retries` undefined in `ingestWithRetry`, so the `for (let i = 0; i < retries; i++)` loop never runs.
- 2025-02-18: Since the loop never runs, it falls through to `throw lastError || new Error("Ingestion failed after retries")`, and since `lastError` is null, it throws the generic error.
- 2025-02-18: Fixed signatures in `Tracer.ts` using `sed`.
- 2025-02-18: Verified that all tests in `sdks/node-js/tests/integration.test.ts` pass.

## Resolution

root_cause: Method signature mismatch in `Tracer.ts`. The `ingestWithRetry` and `ingest` methods had an extra `IngestTraceStart` parameter which shifted subsequent arguments. This caused `retries` to be `undefined` when called from `flush`, resulting in the ingestion loop never executing and throwing an error immediately.
fix: Removed the extra `IngestTraceStart` parameters from `ingestWithRetry` and `ingest` method signatures in `Tracer.ts`.
verification: Ran `bun test tests/integration.test.ts` in `sdks/node-js` directory. All 6 tests passed.
files_changed: [sdks/node-js/src/Tracer.ts]
