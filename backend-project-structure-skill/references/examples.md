# Concrete Kotlin Examples

Use these examples as templates when generating code for the user.

## ServiceA.kt (The Contract)

```kotlin
package com.example.serviceA

import com.example.serviceA.model.FooRequest
import com.example.serviceA.model.FooResult

/**
 * Contract for all Foo operations in the ServiceA bounded context.
 *
 * WHY: Isolates callers from implementation details. Swap [ServiceAImpl] for a
 * stub, a feature-flagged variant, or a remote client without touching any caller.
 *
 * HOW IT TIES: Implemented by [internal.ServiceAImpl].
 * Consumed by [serviceB.internal.ServiceBImpl] and HTTP controllers.
 */
interface ServiceA {
    /**
     * Retrieve a Foo by its identifier.
     * Returns null when no matching Foo exists — callers decide how to handle absence.
     */
    fun getFoo(request: FooRequest): FooResult?

    /** Create a new Foo. Returns the created result including the assigned ID. */
    fun createFoo(request: FooRequest): FooResult
}
```

## model/FooRequest.kt (Public Model)

```kotlin
package com.example.serviceA.model

/**
 * Input for Foo operations exposed by [ServiceA].
 *
 * WHY: Keeps the public API stable — internal representation can change
 * without breaking callers as long as this class stays compatible.
 *
 * HOW IT TIES: Used by callers of [ServiceA]. Mapped to [internal.model.FooEntity]
 * inside [internal.ServiceAImpl] — never exposed outside serviceA.
 */
data class FooRequest(
    val id: String?,           // null on create, required on lookup/update
    val name: String,
    val metadata: Map<String, String> = emptyMap(),
)
```

## internal/ServiceAImpl.kt (Business Logic)

```kotlin
package com.example.serviceA.internal

import com.example.serviceA.ServiceA
import com.example.serviceA.model.FooRequest
import com.example.serviceA.model.FooResult
import com.example.serviceA.internal.model.FooEntity
import com.example.serviceB.ServiceB          // ✅ interface only, never ServiceBImpl

/**
 * Implements the [ServiceA] contract.
 *
 * WHY: Separates business orchestration from the interface definition, allowing
 * the contract to remain stable while logic evolves independently.
 *
 * HOW IT TIES: Depends on [ServiceARepository] for persistence (injected as interface)
 * and on [ServiceB] for cross-domain enrichment (also injected as interface).
 */
@Service
class ServiceAImpl(
    private val repository: ServiceARepository,
    private val serviceB: ServiceB,            // cross-service: interface only
) : ServiceA {

    override fun getFoo(request: FooRequest): FooResult? {
        val id = requireNotNull(request.id) { "id required for getFoo" }

        // Fetch raw entity from persistence layer
        val entity = repository.findById(id) ?: return null

        // Enrich with data from ServiceB — using ServiceB's public interface only
        val enrichment = serviceB.getEnrichmentForFoo(entity.name)

        return entity.toResult(enrichment)
    }

    override fun createFoo(request: FooRequest): FooResult {
        val entity = FooEntity(
            id = generateId(),   // utils or UUID
            name = request.name,
            metadata = request.metadata,
        )
        val saved = repository.save(entity)
        return saved.toResult(enrichment = null)
    }

    private fun FooEntity.toResult(enrichment: String?): FooResult =
        FooResult(id = this.id, name = this.name, extra = enrichment)

    private fun generateId(): String = java.util.UUID.randomUUID().toString()
}
```

## internal/ServiceARepository.kt (Persistence Contract)

```kotlin
package com.example.serviceA.internal

import com.example.serviceA.internal.model.FooEntity

/**
 * Persistence contract for ServiceA's Foo aggregate.
 *
 * WHY: Decouples ServiceAImpl from the database technology. The impl
 * only knows this interface; the actual SQL/NoSQL/in-memory logic lives
 * in [ServiceARepositoryImpl] and can be replaced without touching business logic.
 *
 * HOW IT TIES: Used exclusively by [ServiceAImpl] and [listeners.FooCreatedEventListener].
 * Implemented by [ServiceARepositoryImpl] (or an infra-layer class).
 */
internal interface ServiceARepository {
    fun findById(id: String): FooEntity?
    fun save(entity: FooEntity): FooEntity
    fun deleteById(id: String): Boolean
}
```

## internal/listeners/FooCreatedEventListener.kt

```kotlin
package com.example.serviceA.internal.listeners

import com.example.serviceA.internal.ServiceARepository
import com.example.serviceA.internal.model.FooEntity

/**
 * Handles FooCreated events arriving from the messaging layer (e.g. Kafka).
 *
 * WHY: Keeps event consumption as an internal detail of ServiceA. External
 * publishers don't know ServiceA exists — they just publish events. This listener
 * bridges the messaging world into ServiceA's domain without leaking internals.
 *
 * HOW IT TIES:
 * - Receives [FooCreatedEvent] from infra/messaging/
 * - Calls [ServiceARepository] directly for persistence.
 */
@Component
class FooCreatedEventListener(
    private val repository: ServiceARepository,
) {
    @KafkaListener(topics = ["foo.created"])
    fun onFooCreated(event: FooCreatedEvent) {
        // Idempotency check: skip if we already have this Foo
        if (repository.findById(event.fooId) != null) return

        repository.save(
            FooEntity(id = event.fooId, name = event.name)
        )
    }
}
```
