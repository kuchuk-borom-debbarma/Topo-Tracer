---
phase: 05-verification
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [verify-trace-names.ts]
autonomous: true
requirements: ["E2E-VERIFICATION"]

must_haves:
  truths:
    - "Standalone script correctly identifies named traces in the backend API"
    - "Standalone script correctly identifies fallback IDs for unnamed traces"
  artifacts:
    - path: "verify-trace-names.ts"
      provides: "E2E verification script"
---

<objective>
Create a standalone E2E verification script to confirm trace name support across the full Topo-Tracer stack.

Purpose: Final validation (Phase 5) of the milestone.
Output: `verify-trace-names.ts` script.
</objective>

<execution_context>
@/Users/kuchukboromdebbarma/.gemini/get-shit-done/workflows/execute-plan.md
@/Users/kuchukboromdebbarma/.gemini/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/05-verification/05-CONTEXT.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implement E2E verification script</name>
  <files>verify-trace-names.ts</files>
  <action>
    Create `verify-trace-names.ts` in the project root:
    - Use the SDK from `sdks/node-js/dist/index.js` (ensure it is built).
    - Send one trace WITH a name.
    - Send one trace WITHOUT a name.
    - Poll the Hono-server API to verify both.
  </action>
  <verify>
    <automated>bun run verify-trace-names.ts --dry-run</automated>
  </verify>
  <done>Verification script is implemented and ready for final check.</done>
</task>

</tasks>

<verification>
Run the script against a live local backend if available.
</verification>

<success_criteria>
The verification script passes, confirming trace names and fallback logic are functional end-to-end.
</success_criteria>

<output>
Create `.planning/phases/05-verification/05-01-SUMMARY.md` when done
</output>
