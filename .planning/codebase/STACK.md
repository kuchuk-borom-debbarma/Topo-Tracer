# Technology Stack

**Analysis Date:** 2026-06-04

## Languages

**Primary:**
- TypeScript 5.x/6.x - All application packages use TypeScript source files: `carno.js/src/index.ts`, `frontend/src/main.tsx`, `hono-server/src/index.ts`, `sdk/nodejs/src/index.ts`.

**Secondary:**
- TSX/React JSX - Frontend UI components use React TSX in `frontend/src/ui/App.tsx`; Hono config enables JSX support through `hono/jsx` in `hono-server/tsconfig.json`.
- JSON/JSONC - Package and runtime configuration lives in `carno.js/package.json`, `frontend/package.json`, `sdk/nodejs/package.json`, `hono-server/package.json`, and `hono-server/wrangler.jsonc`.
- Markdown - Product and implementation docs live under `docs/`, including `docs/DEVELOPMENT_AND_VERIFICATION.md`, `docs/TRACE_DESIGN.md`, and `docs/BACKEND_SCHEMA_AND_QUERIES.md`.

## Runtime

**Environment:**
- Bun - Primary local backend runtime for `carno.js`; run with `bun run --watch src/index.ts` from `carno.js/package.json`.
- Browser - Frontend runtime served by Vite from `frontend/vite.config.ts`; default dev server port is `5173`.
- Node.js - SDK package targets Node-style CommonJS output in `sdk/nodejs/tsconfig.json`; SDK uses `NodeJS.Timeout`, `setImmediate`, and global `fetch` in `sdk/nodejs/src/BatchExporter.ts`.
- Cloudflare Workers - `hono-server` is configured for Wrangler with `main: "src/index.ts"` and `compatibility_date: "2026-06-03"` in `hono-server/wrangler.jsonc`.

**Package Manager:**
- npm - Lockfiles are present for `frontend/package-lock.json`, `sdk/nodejs/package-lock.json`, and `carno.js/package-lock.json`.
- Bun - Bun lockfiles are present for `carno.js/bun.lock` and `hono-server/bun.lock`; `carno.js/package.json` scripts use `bun run`.
- Lockfile: present in each package directory except there is no root package lock or root workspace manifest.

## Frameworks

**Core:**
- `@carno.js/core` ^1.5.0 - Decorator-based backend framework used by the active local backend in `carno.js/src/index.ts` and `carno.js/src/routes/LogController.ts`.
- Hono ^4.12.23 - Cloudflare/edge-oriented HTTP framework used by `hono-server/src/index.ts`.
- React ^19.1.0 and React DOM ^19.1.0 - Frontend UI framework used by `frontend/src/main.tsx` and `frontend/src/ui/App.tsx`.
- Vite ^6.3.5 - Frontend dev/build tool configured in `frontend/vite.config.ts`.

**Testing:**
- Not detected - No Jest, Vitest, Playwright, Cypress, or test script exists in the package manifests. `sdk/nodejs/package.json` has a placeholder `test` script that exits with an error.

**Build/Dev:**
- TypeScript - `frontend/package.json` builds with `tsc -b && vite build`; `sdk/nodejs/package.json` builds with `tsc`; `carno.js/package.json` declares TypeScript as a peer dependency.
- Wrangler ^4.4.0 - Hono server dev/deploy CLI in `hono-server/package.json`; `wrangler dev` and `wrangler deploy --minify` are the package scripts.
- `@vitejs/plugin-react` ^4.5.2 - React plugin configured in `frontend/vite.config.ts`.
- Fallow ^2.88.1 - Static audit/repair tooling exposed through `hono-server/package.json` scripts.

## Key Dependencies

**Critical:**
- `@clickhouse/client` ^1.18.5 - Node/Bun ClickHouse client used by the active backend in `carno.js/src/infra/ClickHouseService.ts`.
- `@clickhouse/client-web` ^1.19.0 - Web/Workers-compatible ClickHouse client used by the Hono package in `hono-server/src/infra/db/clickhouse/clickhouse.ts`.
- `@tanstack/react-query` ^5.80.6 - Frontend server-state cache configured in `frontend/src/main.tsx` and used by `frontend/src/ui/App.tsx`.
- `@xyflow/react` ^12.11.0 - Graph/canvas dependency declared in `frontend/package.json`; use for graph visualization work when present in frontend code.
- `uuid` ^14.0.0 - SDK trace/event id generation in `sdk/nodejs/src/Span.ts` and `sdk/nodejs/src/Tracer.ts`.

**Infrastructure:**
- `tslog` ^4.10.2 - Structured logger for the Hono package in `hono-server/src/common/logger.ts` and service implementations under `hono-server/src/services/`.
- `@tanstack/react-router` ^1.120.15 - Declared in `frontend/package.json`; no router setup is detected in `frontend/src/main.tsx`.
- `@types/node` ^25.9.1 and `ts-node` ^10.9.2 - SDK development/build dependencies in `sdk/nodejs/package.json`.
- `@types/bun` latest - Bun backend type support in `carno.js/package.json`.

## Configuration

**Environment:**
- Active backend `carno.js` reads configuration directly from `process.env` in `carno.js/src/index.ts`, `carno.js/src/infra/ClickHouseService.ts`, `carno.js/src/infra/events/InMemoryEventBus.ts`, and `carno.js/src/services/log/worker/TraceReadModelWorker.ts`.
- Frontend reads `VITE_API_BASE_URL` from `import.meta.env` in `frontend/src/api.ts`, defaulting to `http://localhost:3999`.
- SDK examples and mock seed script read `TOPO_TRACER_URL` from `process.env` in `sdk/nodejs/example/_helpers.ts` and `carno.js/scripts/generate-mock.ts`.
- Hono package centralizes runtime env access through `hono/adapter` in `hono-server/src/common/env.ts`; use this helper instead of direct `process.env` in Hono code.
- No `.env` files detected in the repository scan.

**Build:**
- `carno.js/tsconfig.json` targets `ESNext`, preserves modules, uses bundler resolution, enables decorators, and sets `noEmit: true`.
- `frontend/tsconfig.json`, `frontend/tsconfig.app.json`, `frontend/tsconfig.node.json`, and `frontend/vite.config.ts` control the Vite/React frontend build.
- `sdk/nodejs/tsconfig.json` emits CommonJS to `sdk/nodejs/dist` with declarations and source maps.
- `hono-server/tsconfig.json` targets `ESNext`, uses bundler resolution, and configures `jsxImportSource: "hono/jsx"`.
- `hono-server/wrangler.jsonc` configures Cloudflare Workers entrypoint and compatibility date.

## Platform Requirements

**Development:**
- Run ClickHouse locally at `http://localhost:8123`; documented in `docs/DEVELOPMENT_AND_VERIFICATION.md`.
- Run active backend from `carno.js` with `bun run dev`; default port is `3999` in `carno.js/src/index.ts`.
- Run frontend from `frontend` with `npm run dev`; default port is `5173` in `frontend/vite.config.ts`.
- Run SDK examples with Bun from `sdk/nodejs/example`; examples call the backend via `TOPO_TRACER_URL` in `sdk/nodejs/example/_helpers.ts`.
- Use `npm run build` in `frontend`, `npm run build` in `sdk/nodejs`, and `bun run check` in `carno.js` for build checks documented in `docs/DEVELOPMENT_AND_VERIFICATION.md`.

**Production:**
- `hono-server` is the package configured for Cloudflare Workers deployment through Wrangler in `hono-server/package.json` and `hono-server/wrangler.jsonc`.
- `carno.js` is the active local telemetry backend with ClickHouse migrations and routes in `carno.js/src/infra/ClickHouseService.ts` and `carno.js/src/routes/LogController.ts`.
- No root deployment manifest, CI workflow, container runtime config, or production frontend hosting config is detected.

---

*Stack analysis: 2026-06-04*
