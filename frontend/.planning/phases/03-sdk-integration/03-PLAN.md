---
phase: 03-sdk-integration
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [
  "sdks/node-js/src/types.ts",
  "sdks/node-js/src/Tracer.ts",
  "sdks/node-js/tests/integration.test.ts"
]
autonomous: true
requirements: ["SDK-INTERFACE", "SDK-ROOT-ENFORCEMENT"]

must_haves:
  truths:
    - "Tracer.trace accepts an optional traceName via options object (D-11)"
    - "Trace names are ONLY attached to root nodes in the ingestion payload (D-14)"
    - "Existing trace(name, fn) calls remain valid and functional"
  artifacts:
    - path: "sdks/node-js/src/types.ts"
      provides: "Updated IngestNodeStart DTO"
    - path: "sdks/node-js/src/Tracer.ts"
      provides: "Updated fluent API and root-enforcement logic"
  key_links:
    - from: "sdks/node-js/src/Tracer.ts"
      to: "sdks/node-js/src/types.ts"
      via: "IngestNodeStart payload construction"
---

<objective>
Update the Node.js SDK to support optional trace names while enforcing that they are only attached to root nodes.

Purpose: Enable users to name traces from the SDK (D-11) and ensure data integrity by only allowing names on root spans (D-14).
Output: Updated SDK with trace name support and accompanying integration tests.
</objective>

<execution_context>
@$HOME/.gemini/get-shit-done/workflows/execute-plan.md
@$HOME/.gemini/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/03-sdk-integration/03-CONTEXT.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update SDK Type Definitions</name>
  <files>sdks/node-js/src/types.ts</files>
  <action>
    Update the ingestion DTOs in `sdks/node-js/src/types.ts`:
    - Add `traceName?: string` to the `IngestNodeStart` interface to match the backend API updated in Phase 1 (D-04).
    - Ensure any internal options types for `Tracer.trace` or `startNode` are updated to include `traceName`.
  </action>
  <verify>
    <automated>npm --prefix sdks/node-js run build</automated>
  </verify>
  <done>SDK types include the traceName field and the project compiles.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Update Tracer implementation and root enforcement</name>
  <files>sdks/node-js/src/Tracer.ts</files>
  <behavior>
    - Tracer.trace(name, fn, { traceName: "..." }) should pass traceName to startNode.
    - startNode should only include traceName in the payload if parentSpanId is undefined/null (D-13, D-14).
    - Tracer.trace(name, fn) (no options) should continue to work.
  </behavior>
  <action>
    Update `sdks/node-js/src/Tracer.ts`:
    - Modify the `trace<T>` method signature to: `trace<T>(name: string, fn: (span: Span) => Promise<T> | T, options?: { traceName?: string }): Promise<T>` (per D-11).
    - Update `startNode` (or internal helper) to accept `traceName` in its options.
    - Implement root enforcement logic (D-14): check for the absence of `parentSpanId` (D-13). If it is a root node and `traceName` is provided, add it to the `IngestNodeStart` payload.
  </action>
  <verify>
    <automated>npm --prefix sdks/node-js run build</automated>
  </verify>
  <done>Tracer API is updated and correctly implements root-only trace name attachment.</done>
</task>

<task type="auto">
  <name>Task 3: Add integration tests for trace names</name>
  <files>sdks/node-js/tests/integration.test.ts</files>
  <action>
    Add test cases to `sdks/node-js/tests/integration.test.ts` to verify the new functionality:
    - **Test 1 (Root Name):** Start a trace with a `traceName` and verify the emitted `IngestNodeStart` event contains the name.
    - **Test 2 (Child Name Blocked):** Start a child span with a `traceName` and verify the emitted `IngestNodeStart` event for the child does NOT contain the name (D-14).
    - **Test 3 (Backward Compatibility):** Call `trace(name, fn)` without the third argument and verify it still works and emits events correctly.
  </action>
  <verify>
    <automated>npm --prefix sdks/node-js test</automated>
  </verify>
  <done>Integration tests confirm correct trace name behavior and root enforcement.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| User App → SDK | Untrusted trace name input enters here |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-01 | Tampering | IngestNodeStart | mitigate | The SDK only passes the string to the API; root enforcement (D-14) prevents name pollution on non-root nodes. |
| T-03-SC | Tampering | npm installs | mitigate | slopcheck + blocking human checkpoint if any new packages added. |
</threat_model>

<verification>
Run `npm test` in `sdks/node-js` to ensure all tests pass and root enforcement is working as expected.
</verification>

<success_criteria>
The Node.js SDK supports optional trace names on the root span, ignores them on child spans, and maintains backward compatibility.
</success_criteria>

<output>
Create `.planning/phases/03-sdk-integration/03-01-SUMMARY.md` when done
</output>
