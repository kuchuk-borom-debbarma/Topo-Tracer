# Hono Server Codebase Guide

This guide explains how the Hono server should be shaped. It is for humans and
AI agents working in this repo, so the rules should stay practical, explicit,
and easy to follow.

## Principles

- Keep business logic in services.
- Keep persistence behind repository contracts.
- Keep infrastructure in `infra`.
- Keep shared primitives in `common`.
- Depend on contracts instead of concrete implementations.
- Prefer boring, readable TypeScript over clever abstractions.
- Add comments for intent and tradeoffs, not for obvious code.

## Source Layout

```txt
src/
  common/
  infra/
  services/
  index.ts
  code-base.md
```

### `src/index.ts`

`index.ts` is the Hono app entry point. It should create the app, register
routes, wire middleware, call services, and translate service results or errors
into HTTP responses.

Route handlers should stay thin. Do not put business workflows, repository
calls, database clients, or platform-specific environment access in routes.

### `src/common`

Use `common` for small shared primitives only:

- root logger setup;
- environment helpers and binding types;
- common exception types;
- timestamp helpers;
- tiny shared utility types.

Do not put business rules, service-specific types, database helpers, or large
utility dumping grounds in `common`.

Environment access belongs in `common/env.ts`. Hono can run on Node, Bun,
Cloudflare Workers, and other runtimes. Use the Hono adapter helpers through
`getEnv`, `getEnvValue`, or `getStringEnvValue` instead of reading
`process.env`, `Deno.env`, or Cloudflare globals directly. Define runtime
binding names in `AppBindings` and type the app with `AppEnv`.

### `src/infra`

Use `infra` for capabilities that are not owned by one business service:

- database client setup;
- event bus implementations;
- queue adapters;
- external platform clients;
- Cloudflare Worker bindings;
- durable infrastructure services.

Infrastructure may expose contracts, such as `IEventBus`, and implementations,
such as `DevEventBus`. Infrastructure code should not contain feature-specific
business rules.

ClickHouse setup lives in `infra/db/clickhouse`. Repositories use the
initialized ClickHouse singleton helper instead of constructing clients
directly. The singleton should stay simple: create the client from Hono
environment bindings on first use, then reuse it while the runtime keeps the
module alive. This works for long-lived Node/Bun servers and reused Worker
isolates, while cold Worker starts naturally create a fresh client.

### `src/services`

Use `services` for business modules such as auth, logging, billing, or tracing.

A service module should expose its public contract and public types through
`api`, keep implementation details under `internal`, keep persistence behind
repository contracts, and export the ready-to-use service from module
`index.ts`.

## Service Module Shape

Use this structure when a service needs all parts:

```txt
services/example/
  index.ts
  api/
    IExampleService.ts
    types.ts
  internal/
    service-impl/
      ExampleServiceImpl.ts
    repo/
      index.ts
      IExampleRepo.ts
      types.ts
      impl/
        ExampleRepoPg.ts
```

Add folders when they are needed. A service with no persistence does not need a
repository folder yet.

### Module `index.ts`

The module `index.ts` is the public wiring point. It should import the service
contract, import the implementation, pass dependencies into the implementation,
and export the service as the contract type.

```ts
import { rootLogger } from "../../common/logger";
import { IAuthService } from "./api/IAuthService";
import { AuthServiceImpl } from "./internal/service-impl/AuthServiceImpl";

export const authService: IAuthService = new AuthServiceImpl(rootLogger);
```

Consumers should import ready-to-use services from the module root. Consumers
should import contracts only when declaring dependencies or types. Consumers
should not import from another module's `internal` folder.

### `api`

The `api` folder is the public surface of a module. It contains the abstract
service contract and public request/response types.

Keep `api` stable and intentional. Anything placed here becomes part of the
module contract.

Use object parameters for public methods:

```ts
export abstract class IAuthService {
  abstract startSignUp(data: {
    username: string;
    email: string;
    password: string;
  }): Promise<string>;
}
```

### `internal`

The `internal` folder contains private implementation details:

- service implementations;
- repository contracts and implementations;
- private module types;
- module-specific helpers;
- mappers between public types and persistence types.

Internal code can change freely as long as the public `api` contract remains
compatible.

### `internal/service-impl`

Service implementations own business orchestration:

- validate business preconditions;
- call repositories;
- call other services through contracts;
- publish events;
- handle domain-level errors;
- log useful trace points.

Service implementations should not contain SQL, direct database client calls,
Cloudflare-specific code, or HTTP response formatting.

### `internal/repo`

Repositories represent persistence behavior needed by a service, not raw tables
or database clients.

```txt
repo/
  index.ts
  IExampleRepo.ts
  types.ts
  impl/
    ExampleRepoPg.ts
```

Repository contracts define what the service needs. Repository implementations
define how a database provides it. Services depend on repository contracts;
repository implementations may depend on infrastructure database clients.

Repository implementation details and row types belong in repo-local `types.ts`,
not in service public API types.

## Dependency Direction

Allowed:

- routes call service public exports;
- service implementations depend on contracts, repository contracts, event bus
  contracts, and `common` primitives;
- repository implementations depend on infrastructure database clients;
- infrastructure implementations depend on external libraries or platform
  clients;
- shared `common` code can be imported by any layer.

Avoid:

- routes importing repositories directly;
- services importing database clients directly;
- repositories importing route code;
- one module importing another module's `internal` files;
- `common` importing from services or infra;
- circular dependencies between modules.

Dependencies should point toward contracts and lower-level capabilities, not
sideways into private internals.

## Types

Use TypeScript types to make boundaries obvious.

- Public types belong in `api/types.ts`.
- Private implementation types belong in `internal/.../types.ts`.
- Use object parameters for public methods.
- Prefer explicit return types on contracts and public methods.
- Avoid `any`; use `unknown` when a shape is intentionally not known yet.
- Keep public types stable and minimal.
- Do not leak database-only shapes through public APIs.

Prefer plain, readable types over clever composed types. If a type is part of a
contract, write its fields directly instead of making readers chase intersections
or utility types.

Good:

```ts
export type EventBusPublishedEvent = {
  topic: string;
  idempotencyId: string;
  key?: string;
  data: unknown;
  publishedAt: number;
};
```

Avoid for public contracts:

```ts
export type EventBusPublishedEvent = EventBusPublishEvent & {
  publishedAt: number;
};
```

For timestamps, be consistent. The log service uses UTC milliseconds for trace
timing. If a module needs another representation, document it in the type or
helper.

## Logging

Use `tslog` and pass logger instances through the dependency chain.

The root logger lives in `common/logger.ts`:

```ts
export const rootLogger = new Logger({ name: "ROOT" });
```

Implementations should create child loggers:

```ts
this.logger = parentLogger.getSubLogger({
  name: "AuthServiceImpl",
});
```

When a service creates lower-level dependencies, those dependencies should
receive the service logger and create their own child logger. This gives logs a
clear path from root, to service, to repository or infrastructure adapter.

Logging rules:

- log method entry at `trace` when useful;
- include safe context such as IDs and counts;
- do not log passwords, tokens, OTPs, secrets, raw credentials, or raw payloads
  that may contain sensitive data;
- log caught errors before rethrowing when useful;
- keep logger names aligned with class names.

## Errors

Use explicit error types for expected application errors.

`TopoTraceException` exists for errors that should carry an HTTP-style status
code:

```ts
throw new TopoTraceException("OTP Mismatch", 403);
```

Services should throw domain errors when business rules fail. Repositories
should throw persistence errors when storage fails. Routes should translate
expected errors into HTTP responses.

Do not return `null`, `undefined`, or magic strings to represent failures.

## Route Rules

Hono route handlers are adapters between HTTP and services.

A good route handler:

- reads request input;
- reads runtime configuration through `common/env.ts` helpers when needed;
- validates request shape when needed;
- calls one service method;
- maps the result to a response;
- maps expected errors to status codes.

A route handler should not:

- run database queries;
- publish events directly unless the route itself is an infrastructure endpoint;
- contain long business workflows;
- know about repository implementations;
- construct service internals inline;
- read directly from platform environment globals.

Authenticated routes should pass the resolved `userId` into service contracts
that operate on user-owned data. The log service stores user ownership with
trace events, but it should not import auth internals or decide how
authentication works.

## Event Bus

The event bus is an infrastructure capability. Its contract lives in
`infra/event-bus/api/IEventBus.ts`.

The event bus contract is batch-native:

- `publish(events, options)` accepts one or more events;
- `subscribe(options, handler)` delivers arrays to the handler;
- `batchSize` is a requested maximum or hint, not a guarantee;
- handlers must work for any non-empty batch size;
- implementations should avoid invoking handlers with empty batches.

The event bus should handle or emulate:

- routing by `topic`;
- idempotency through `idempotencyId`;
- batch correlation through optional `batchId`;
- durable delivery where the backend supports it;
- ordered delivery per event `key`;
- coalescing or dedupe windows where needed;
- subscription and handler registration by `consumerName`.

Services publish through the `IEventBus` contract, not through a specific
implementation. Services provide stable event metadata; the implementation
translates that metadata into the selected broker's real primitives. If a broker
does not support idempotency, ordering, durability, or coalescing natively, the
implementation should add the needed storage, lock, TTL, or dedupe layer.

Use event fields this way:

- `topic`: stable event name, such as `log.trace.ingested`;
- `idempotencyId`: stable identity for the same logical work;
- `key`: ordering lane, such as a `traceId`;
- `data`: intentionally small payload;
- `batchId`: observability correlation for one publish call, not a dedupe key.

For trace read-model rebuild requests, use `traceId` as the event `key` so work
inside one trace can stay ordered. The listener should still coalesce repeated
events for the same trace within a received batch.

Listeners should be idempotent because real brokers may retry full batches or
redeliver individual events.

Prefer clear event names:

```txt
auth.signup.started
auth.signup.completed
log.trace.ingested
```

## Repository Rules

Repositories should represent persistence behavior needed by a service.

Good repository method names:

- `insertPendingSignUpUser`
- `getPendingUserById`
- `upsertUserTokenOTP`
- `getUserByFilter`

Avoid repository methods that expose database implementation details:

- `runSql`
- `queryUsersTable`
- `selectFromAuthSchema`

Repository implementations should map database rows to module types, keep SQL
or client-specific query code out of services, throw useful errors when records
are missing or invalid, and avoid returning raw database client responses.

## Naming

Use consistent names:

- service contract: `IAuthService`;
- service implementation: `AuthServiceImpl`;
- repository contract: `IAuthRepo`;
- postgres repository implementation: `AuthRepoPg`;
- ClickHouse repository implementation: `LogWriteRepoClickHouse`;
- development implementation: `DevEventBus`;
- module public export: `authService`.

The `I` prefix is used because contracts are abstract classes and the codebase
already follows that convention.

## Adding Code

When adding a new service:

1. Create `services/<name>/api/I<Name>Service.ts`.
2. Add public request and response types in `services/<name>/api/types.ts` when
   needed.
3. Create `services/<name>/internal/service-impl/<Name>ServiceImpl.ts`.
4. Add a repository contract under `internal/repo` if persistence is needed.
5. Add a concrete repository implementation under `internal/repo/impl` when
   persistence is ready.
6. Wire the implementation in `services/<name>/index.ts`.
7. Use the service from routes through the module-level export.

When adding a repository implementation:

1. Keep the repository contract stable if possible.
2. Add the implementation under `internal/repo/impl`.
3. Inject infrastructure dependencies through the constructor.
4. Map database shapes to module types inside the repository.
5. Update `internal/repo/index.ts` to choose the default implementation.
6. Do not change service logic unless business behavior changed.

Before adding a cross-service dependency, consider whether it should be a direct
service contract dependency, an event published through the event bus, a shared
primitive in `common`, or a separate infrastructure capability.

## AI Agent Rules

When an AI agent works in this codebase:

- read this guide before architectural changes;
- inspect the existing module before adding files;
- prefer existing structure over inventing a new one;
- keep changes scoped to the requested behavior;
- do not import from another module's `internal` folder;
- do not put business logic in routes;
- do not bypass service or repository contracts;
- do not add global state unless it is a deliberate infrastructure singleton;
- do not make broad refactors while implementing focused behavior;
- extend incomplete code in the intended direction instead of patching around
  the architecture.

After every code change, run Fallow before finishing:

```txt
bun run fallow
```

The default script runs `fallow audit --base HEAD`, which checks the current
uncommitted change set for dead code, duplication, complexity, and architecture
drift. Use `bun run fallow:full` for a full-repo advisory scan and
`bun run fallow:health` for report-only health output. Use `bun run fallow:fix`
only to preview automatic cleanup; do not apply fixes without reviewing the
diff.

## Quality Checklist

Before finishing a change, check:

- Does code depend on contracts where it matters?
- Is business logic inside a service?
- Are infrastructure details isolated in `infra` or repositories?
- Are public types in `api` and private types in `internal`?
- Are imports avoiding another module's `internal` folder?
- Is logging safe and useful?
- Are errors explicit?
- Has `bun run fallow` been run?
- Is the code simple enough to explain quickly?
- Would a new developer know where to extend this feature?

## Current State

The server is a Hono app intended to run on Cloudflare Workers through Wrangler.

Current major areas:

- `src/index.ts` creates the Hono app.
- `src/common` contains shared primitives.
- `src/infra/event-bus` defines the event bus contract and development bus.
- `src/infra/db` contains shared database setup, including ClickHouse.
- `src/services/auth` owns authentication.
- `src/services/log` owns trace/log ingestion and read-model aggregation.

The codebase is still early. Some implementations are placeholders. New work
should complete those placeholders while preserving the contract-driven,
modular structure.
