# Hono Server Codebase Guide

This document explains how this server codebase should be shaped. It is meant
for both human developers and AI agents so that new code follows the same
architecture, naming, dependency direction, and quality bar.

The short version:

- Keep the code loosely coupled.
- Keep the design simple and readable.
- Prefer contracts over concrete dependencies.
- Keep modules small, focused, and easy to replace.
- Make extension cheap without making today's code abstract for no reason.
- Keep business logic in services, infrastructure in infra, and shared basics in
  common.

## Core Principles

### Contract-driven code

The main architectural rule is: code should depend on contracts, not concrete
implementations.

Contracts are defined as abstract classes. A service, repository, event bus, or
other module exposes the behavior it promises through an abstract class such as
`IAuthService`, `IAuthRepo`, `ILogService`, or `IEventBus`.

Concrete implementations live behind those contracts, for example
`AuthServiceImpl`, `AuthRepoPg`, or `DevEventBus`.

This keeps modules loosely coupled:

- service callers do not need to know how a service is implemented;
- service implementations do not need to know which database implementation is
  being used beyond the repository contract;
- repository implementations can be swapped without rewriting business logic;
- development implementations can exist beside production implementations;
- tests can use fake or in-memory implementations without touching app code.

### KISS

Keep the design simple. Do not add layers, factories, registries, decorators, or
generic abstractions unless they solve a real problem in this codebase.

Good code here should be boring in the best way:

- one obvious place for each concept;
- plain TypeScript types;
- small classes with clear dependencies;
- explicit constructor arguments;
- minimal magic;
- clear names instead of clever names.

If a function or class is hard to explain, simplify it before adding comments.

### Readability first

Readable code is the default performance optimization for a growing codebase.

Prefer:

- descriptive method names;
- small methods with one job;
- named data objects instead of long positional argument lists;
- direct control flow;
- clear error messages;
- files that are short enough to scan;
- comments only when they explain intent, tradeoffs, or non-obvious behavior.

Avoid:

- hidden side effects;
- overly broad utility functions;
- deeply nested conditionals;
- implicit global state;
- mixing routing, validation, business logic, persistence, and external calls in
  the same function.

### Modular by default

Each feature area should live in its own module. A module owns its public API,
internal implementation, repositories, private types, and module-level wiring.

For example, `services/auth` owns authentication behavior. Other code should use
the public `authService` export or the `IAuthService` contract. Other modules
should not reach into `services/auth/internal`.

### Extensible without overengineering

The codebase should make future changes easy, but not by adding speculative
complexity.

Extensibility here means:

- clear contracts that can gain new implementations;
- isolated modules that can grow without leaking internals;
- dependency injection through constructors;
- public types that describe stable boundaries;
- internal types that can change freely;
- infrastructure adapters that can be swapped when the platform changes.

It does not mean creating an abstraction for every small helper.

## Top-level Folder Responsibilities

The current source tree is organized under `src`.

```txt
src/
  common/
  infra/
  services/
  index.ts
  code-base.md
```

### `src/index.ts`

This is the Hono app entry point.

Use it for:

- creating the Hono app;
- registering routes;
- wiring request-level middleware;
- translating HTTP requests into service calls;
- translating service results or errors into HTTP responses.

Do not put business logic here. Route handlers should be thin. If a route starts
making domain decisions, move that behavior into a service.

### `src/common`

Use `common` only for very small, broadly shared primitives.

Good examples:

- root logger setup;
- environment binding types and Hono adapter helpers;
- common exception types;
- timestamp helpers;
- small shared utility types.

Bad examples:

- business rules;
- feature-specific validation;
- service-specific data shapes;
- database-specific helpers;
- large utility modules that become a dumping ground.

If a helper is only used by one service, keep it inside that service's
`internal` folder.

Environment access belongs in `common/env.ts`. Hono can run on different
runtimes, and its adapter helper knows how to read environment values from the
current platform, such as `process.env` on Node/Bun or `c.env` on Cloudflare
Workers. Define application binding names in `AppBindings`, type the app with
`AppEnv`, and use `getEnv`, `getEnvValue`, or `getStringEnvValue` instead of
reading platform globals directly.

### `src/infra`

Use `infra` for infrastructure concerns that are not owned by one business
service.

Examples:

- database connection setup;
- event bus implementations;
- queue adapters;
- external platform clients;
- Cloudflare Worker bindings;
- durable infrastructure services.

Infrastructure modules can expose contracts the same way services do. For
example, the event bus exposes `IEventBus` and has a development implementation
called `DevEventBus`.

Infrastructure code should not contain feature-specific business rules. It
should provide capabilities that services can use.

### `src/services`

Use `services` for business modules.

Each service should represent a coherent business capability, such as auth,
logging, billing, notification, tracing, or project management.

Service modules should:

- expose public contracts in `api`;
- expose public data types in `api/types.ts`;
- keep implementation details in `internal`;
- keep persistence details behind repository contracts;
- export the ready-to-use service from the module-level `index.ts`.

## Standard Module Structure

Use this structure for service modules:

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

Not every module needs every folder on day one. Add folders when there is a real
need. For example, a service with no persistence does not need `repo`.

### Module `index.ts`

The module-level `index.ts` is the public wiring point.

It should:

- import the public service contract;
- import the concrete service implementation;
- pass required dependencies into the implementation;
- export the service as the public contract type.

Example:

```ts
import { rootLogger } from "../../common/logger";
import { IAuthService } from "./api/IAuthService";
import { AuthServiceImpl } from "./internal/service-impl/AuthServiceImpl";

export const authService: IAuthService = new AuthServiceImpl(rootLogger);
```

Consumers should import from the module root when they need the ready-to-use
service:

```ts
import { authService } from "./services/auth";
```

They should import the contract only when they are declaring dependencies or
types:

```ts
import { IAuthService } from "./services/auth/api/IAuthService";
```

They should not import from `internal`.

### `api`

The `api` folder defines the public surface of the module.

It should contain:

- the abstract service contract;
- public request and response types;
- domain types that external callers are allowed to know about.

Keep `api` stable and intentional. Anything placed here becomes part of the
module's public contract.

Example:

```ts
export abstract class IAuthService {
  abstract startSignUp(data: {
    username: string;
    email: string;
    password: string;
  }): Promise<string>;
}
```

Use data objects for method inputs. This keeps calls readable and makes it easy
to add optional fields later.

### `internal`

The `internal` folder contains private implementation details. Code outside the
module should not import from it.

This folder may contain:

- service implementations;
- repository contracts and implementations;
- private module types;
- module-specific utility functions;
- validation helpers;
- mappers between public types and persistence types.

Internal code can change freely as long as the public `api` contract remains
compatible.

### `internal/service-impl`

This folder contains concrete service implementations.

Service implementations are responsible for business orchestration:

- validating business preconditions;
- calling repositories;
- calling other services through their contracts;
- publishing events;
- handling domain-level errors;
- logging useful trace points.

Service implementations should not directly contain SQL, database client calls,
Cloudflare-specific code, or HTTP response formatting.

### `internal/repo`

Use repositories for persistence access.

The repository folder should contain:

```txt
repo/
  index.ts
  IExampleRepo.ts
  types.ts
  impl/
    ExampleRepoPg.ts
```

The repository contract defines what the service needs from persistence. The
implementation defines how a specific database provides that behavior.

Keep service code dependent on the repository contract:

```ts
import { IAuthRepo } from "../repo/IAuthRepo";

export class AuthServiceImpl extends IAuthService {
  readonly authRepo: IAuthRepo;
}
```

Repository implementations may depend on infrastructure database clients.
Services should not.

### `internal/repo/index.ts`

The repository `index.ts` wires the default repository implementation.

Example:

```ts
import { IAuthRepo } from "./IAuthRepo";
import { AuthRepoPg } from "./impl/AuthRepoPg";

export const authRepo: IAuthRepo = new AuthRepoPg();
```

When dependencies are required, prefer constructor injection instead of hidden
imports.

## Dependency Direction

Dependency direction should stay simple and predictable.

Allowed:

- `index.ts` route handlers can call service public exports.
- service implementations can depend on service contracts, repository contracts,
  event bus contracts, and common primitives.
- repository implementations can depend on database infrastructure.
- infra implementations can depend on external libraries or platform clients.
- shared common code can be imported by any layer.

Avoid:

- route handlers importing repositories directly;
- services importing database clients directly;
- repositories importing Hono route code;
- one module importing another module's `internal` files;
- common importing from services or infra;
- circular dependencies between modules.

As a rule of thumb, dependencies should point inward toward contracts and
downward toward lower-level capabilities, not sideways into another module's
private internals.

## Logging

Use `tslog` and pass logger instances through the dependency chain.

The root logger lives in `common/logger.ts`:

```ts
export const rootLogger = new Logger({ name: "ROOT" });
```

When creating a service, pass the appropriate parent logger into the
implementation. The implementation should create a child logger:

```ts
this.logger = parentLogger.getSubLogger({
  name: "AuthServiceImpl",
});
```

When a service creates or receives lower-level dependencies, those dependencies
should also receive an appropriate child logger. This gives the system traceable
logs that show the path from the root, to the service, to the repository or
infra adapter.

Logging guidelines:

- log method entry at `trace` when useful;
- include enough context to debug a flow;
- do not log passwords, tokens, OTPs, secrets, or raw credentials;
- log caught errors before rethrowing when the caller needs to handle them;
- prefer structured context when possible;
- keep logger names aligned with class names.

Current development code may still contain rough trace messages. New code should
treat sensitive data carefully.

## Errors

Use explicit error types for expected application errors.

`TopoTraceException` exists for errors that should carry an HTTP-style status
code:

```ts
throw new TopoTraceException("OTP Mismatch", 403);
```

Guidelines:

- throw domain errors from services when business rules fail;
- translate errors into HTTP responses at the route boundary;
- do not return `null`, `undefined`, or magic strings to represent failures;
- preserve original errors where useful for debugging;
- keep user-facing error messages clear and safe.

Repositories should throw persistence errors when storage fails. Services should
decide whether to convert those errors into domain-level errors.

## Types

Use TypeScript types to make boundaries obvious.

Public types belong in `api/types.ts` when callers outside the module need them.
Private implementation types belong in `internal/.../types.ts`.

Guidelines:

- keep public types stable and minimal;
- avoid leaking database-only shapes through public APIs;
- use object parameters for public methods;
- prefer explicit return types on contract methods and public methods;
- use narrow union types when they describe real states;
- avoid `any`;
- use `unknown` when the shape is intentionally not known yet.

For timestamps, be consistent. The log service currently uses UTC milliseconds
for trace timing. If a module needs another time representation, document that
choice in the type or helper.

## Route Handler Rules

Hono route handlers should be adapters between HTTP and services.

A good route handler:

- reads request input;
- reads runtime configuration through `common/env.ts` helpers when needed;
- performs request-shape validation when needed;
- calls one service method;
- maps the result to a response;
- maps expected errors to status codes.

A route handler should not:

- run database queries;
- publish events directly unless the route itself is an infrastructure endpoint;
- contain long business workflows;
- know about repository implementations;
- construct service internals inline.
- read directly from `process.env`, `Deno.env`, or Cloudflare-specific globals.

If a route needs several steps, create a service method that represents the
workflow.

## Event Bus

The event bus is an infrastructure capability. Its contract lives in
`infra/event-bus/api/IEventBus.ts`.

The event bus should handle:

- publishing events by topic;
- idempotency through `idempotencyId`;
- durable delivery where the implementation supports it;
- subscription and handler registration.

Services should publish events through the `IEventBus` contract, not through a
specific implementation.

Event payloads should be intentionally shaped. Avoid sending huge raw objects
when a small event payload is enough.

Event naming should be clear and stable. Prefer names like:

```txt
auth.signup.started
auth.signup.completed
log.trace.ingested
```

We will define stricter publisher and listener conventions when the system has
real event publishers and subscribers.

## Repository Rules

Repositories should represent persistence behavior needed by a service, not raw
database tables.

Good repository method names:

- `insertPendingSignUpUser`
- `getPendingUserById`
- `upsertUserTokenOTP`
- `getUserByFilter`

Avoid repository methods that expose database implementation details to service
code, such as:

- `runSql`
- `queryUsersTable`
- `selectFromAuthSchema`

Repository implementations should:

- map database rows to module types;
- keep SQL or client-specific query code out of services;
- throw useful errors when records are missing or invalid;
- handle database-specific constraints close to the database layer;
- avoid returning raw database client responses.

## Implementation Naming

Use consistent names:

- service contract: `IAuthService`
- service implementation: `AuthServiceImpl`
- repository contract: `IAuthRepo`
- postgres repository implementation: `AuthRepoPg`
- development implementation: `DevEventBus`
- module public export: `authService`

The `I` prefix is used here because contracts are abstract classes and the
existing codebase has already chosen that convention.

## Adding a New Service

When adding a new business service:

1. Create `services/<name>/api/I<Name>Service.ts`.
2. Add public request and response types in `services/<name>/api/types.ts` if
   needed.
3. Create `services/<name>/internal/service-impl/<Name>ServiceImpl.ts`.
4. Add a repository contract under `internal/repo` if the service needs
   persistence.
5. Add a concrete repository implementation under `internal/repo/impl` if
   persistence is ready.
6. Wire the implementation in `services/<name>/index.ts`.
7. Use the service from routes through the module-level export.
8. Keep tests and examples focused on the public contract.

Before adding cross-service dependencies, ask whether the dependency should be:

- a direct service contract dependency;
- an event published through the event bus;
- a shared primitive in `common`;
- a separate infrastructure capability.

## Adding a New Repository Implementation

When adding a new repository implementation:

1. Keep the existing repository contract stable if possible.
2. Add the implementation under `internal/repo/impl`.
3. Inject infrastructure dependencies through the constructor.
4. Map database shapes to module types inside the repository.
5. Update `internal/repo/index.ts` to choose the default implementation.
6. Do not change service logic unless the business behavior itself changed.

Example implementation names:

- `AuthRepoPg` for Postgres;
- `LogWriteRepoClickHouse` for ClickHouse;
- `AuthRepoMemory` for tests or development.

## AI Agent Instructions

When an AI agent works in this codebase, it should follow these rules:

- Read this document before making architectural changes.
- Inspect the existing module before adding new files.
- Prefer the existing module structure over inventing a new one.
- Keep changes scoped to the requested behavior.
- Do not import from another module's `internal` folder.
- Do not place business logic in route handlers.
- Do not bypass service or repository contracts.
- Do not add new global state unless it is a deliberate infrastructure singleton.
- Do not make broad refactors while implementing a focused change.
- If current code is incomplete, extend it in the intended direction instead of
  patching around the architecture.
- Preserve loose coupling, readability, and simple dependency flow.

If there are multiple reasonable approaches, choose the one that is easiest for
another developer to read and change later.

## Quality Checklist

Before finishing a change, check:

- Does the code depend on contracts instead of concrete implementations where it
  matters?
- Is the business logic inside a service, not a route or repository?
- Are infrastructure details isolated in `infra` or repository implementations?
- Are public types in `api` and private types in `internal`?
- Are imports avoiding other modules' internal folders?
- Is the logger passed through and named clearly?
- Are sensitive values excluded from logs?
- Are errors explicit and useful?
- Is the code simple enough to explain without a diagram?
- Would a new developer know where to extend this feature?

## Current Architecture Summary

The server is a Hono app intended to run on Cloudflare Workers through Wrangler.

Current major areas:

- `src/index.ts` creates the Hono app.
- `src/common` contains shared primitives such as the root logger and common
  exception type.
- `src/infra/event-bus` defines the event bus contract and a development
  implementation.
- `src/infra/db` is reserved for shared database setup.
- `src/services/auth` owns authentication contracts and implementation.
- `src/services/log` owns trace/log ingestion contracts and implementation.

The codebase is still early. Some implementations are placeholders. As the
server grows, new work should complete those placeholders while preserving this
contract-driven, modular structure.
