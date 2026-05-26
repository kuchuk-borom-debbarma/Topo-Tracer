# Anti-patterns & How to Fix Them

Avoid these common architectural mistakes in Kotlin backend projects.

## ❌ Importing a concrete impl from another service

```kotlin
// WRONG — ServiceB now depends on how ServiceA is implemented
import com.example.serviceA.internal.ServiceAImpl

class ServiceBImpl(private val serviceA: ServiceAImpl)
```

**Fix:** Depend on the interface.
```kotlin
import com.example.serviceA.ServiceA

class ServiceBImpl(private val serviceA: ServiceA)
```

## ❌ Leaking internal models across service boundaries

```kotlin
// WRONG — ServiceB reaches into serviceA's internal model
import com.example.serviceA.internal.model.FooEntity

fun doThing(entity: FooEntity): String = entity.name
```

**Fix:** Use only `serviceA.model.*` (public models).
```kotlin
import com.example.serviceA.model.FooResult

fun doThing(result: FooResult): String = result.name
```

## ❌ Calling another service's repository directly

```kotlin
// WRONG — bypasses ServiceA's business rules entirely
class ServiceBImpl(
    private val serviceARepository: ServiceARepository,  // internal to serviceA!
)
```

**Fix:** Go through the service interface, always.

## ❌ Business logic in a listener

```kotlin
// WRONG — listener has grown business logic that belongs in the impl
class FooCreatedEventListener {
    fun onFooCreated(event: FooCreatedEvent) {
        val enriched = externalApiClient.enrich(event.fooId)   // business logic!
        val entity = FooEntity(...)
        repository.save(entity)
        notificationService.notify(...)                         // orchestration!
    }
}
```

**Fix:** Listener calls `ServiceAImpl.handleFooCreated(event)`. The impl owns the orchestration.

## ❌ Utils importing from a service

```kotlin
// WRONG — utils now depends on a bounded context
import com.example.serviceA.model.FooResult

object FooStringUtils {
    fun format(foo: FooResult): String = ...
}
```

**Fix:** Either move the helper into `serviceA/` (if it's about Foo) or make it generic (accept `String`, not `FooResult`).

## ❌ Missing comments on non-obvious decisions

```kotlin
if (repository.findById(event.fooId) != null) return
```

Without a comment, the next developer wonders: "Is this a bug? Why are we silently skipping?"

**Fix:**
```kotlin
// Idempotency guard: Kafka delivers at-least-once, so the event may arrive
// multiple times. If we already persisted this Foo, do nothing.
if (repository.findById(event.fooId) != null) return
```
