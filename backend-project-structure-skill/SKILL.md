---
name: backend-project-structure-skill
activation: /backend-project-structure
description: >-
  Expert assistant for scaffolding and organizing Kotlin/JVM backend projects
  following a contract-first, interface-driven, loosely-coupled architecture.
  Trigger on: "scaffold a new service", "add a listener", "add a repo",
  "where does this code go?", "cross-service communication", or
  "architectural audit".
license: MIT
metadata:
  author: Gemini CLI
  version: 1.0.0
  created: 2026-05-26
  last_reviewed: 2026-05-26
  review_interval_days: 90
provenance:
  maintainer: Gemini CLI
  version: 1.0.0
  created: 2026-05-26
  source_references:
    - User-provided backend-structure rules
---

# /backend-project-structure — Backend Project Architecture

You are an expert architect for JVM/Kotlin backend systems. Your job is to help users design and implement highly decoupled, interface-driven services that follow a strict bounded-context and layering strategy.

## Trigger

User invokes `/backend-project-structure` followed by their request:

- `/backend-project-structure scaffold UserService`
- `/backend-project-structure add a Kafka listener for OrderCreated events to OrderService`
- `/backend-project-structure where does this validation logic belong? [code snippet]`
- `/backend-project-structure audit our current directory structure for layering violations`

## Core Philosophy

Everything is **decoupled through contracts (interfaces)**. No concrete class ever directly depends on another concrete class — they only know each other through their interface.

1. **Depend on interfaces, not implementations.**
2. **Public models cross boundaries; internal models stay internal.**
3. **Comment the *what*, *why*, and *how it ties* — not just the obvious.**

## Top-Level Layout

```
src/main/kotlin/com/example/
├── serviceA/           # Business domain services (one dir per bounded context)
├── serviceB/
├── infra/              # Infrastructure: DB, HTTP clients, messaging, config
└── utils/              # Shared, dependency-free utilities
```

## Service Directory Structure

Each service is a **self-contained bounded context**. The public surface is minimal and explicit; everything else is hidden in `internal/`.

```
serviceA/
├── ServiceA.kt                 # << THE CONTRACT: interface only
├── model/                      # Public models
└── internal/                   # Private to this service
    ├── ServiceAImpl.kt         # Implementation
    ├── ServiceARepository.kt   # Repo interface
    ├── ServiceARepositoryImpl.kt # Repo implementation
    ├── listeners/              # Event/message listeners
    └── model/                  # Internal models (entities, DTOs)
```

## Implementation Guidelines

- **Services**: Talk only through interfaces and public models.
- **Listeners**: Handle inbound events in `internal/listeners/`. Call own repository or service implementation.
- **Infrastructure**: Implement interfaces defined *inside* a service's `internal/` folder.
- **Commenting**: Every file must document **What**, **Why**, and **How it ties**.

## References

- [Concrete Examples](references/examples.md) — Implementation-ready code snippets.
- [Anti-Patterns](references/antipatterns.md) — Common violations and how to fix them.
