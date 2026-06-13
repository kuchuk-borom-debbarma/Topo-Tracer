# @topo-tracer/java-sdk (Pure Java Core SDK)

A lightweight, zero-dependency (excluding JSON serialization and logging) Java SDK for Topo-Tracer, supporting graph-based telemetry and distributed tracing.

## Features

- **Fluent API:** Simple lambda-based programmatic tracing scope control.
- **Thread-safe Context Propagation:** Manages tracing context in multithreaded environments.
- **Thread Switch wrappers:** Custom wrappers for executors and tasks to automatically propagate tracing context.
- **Slf4j MDC Sync:** Automatically injects the active `traceId` and `spanId` into your logs.
- **Robust Ingestion:** Batch buffer system, exponential backoff retries, and background execution using standard Java libraries.

## Installation

Run `mvn clean install` inside this directory to build and publish this artifact to your local Maven repository (`~/.m2`). Then add the following dependency:

```xml
<dependency>
    <groupId>dev.kuku</groupId>
    <artifactId>topo-tracer-java-sdk</artifactId>
    <version>0.0.1-SNAPSHOT</version>
</dependency>
```

## Quick Start

### 1. Initialize Tracer
Use the builder to set endpoint, apiKey, and service details:

```java
import dev.kuku.topotracer.sdk.Tracer;

Tracer tracer = new Tracer.Builder()
    .endpoint("http://localhost:3999")
    .apiKey("your-api-key")
    .serviceName("my-java-service")
    .batchSize(100)
    .flushIntervalMs(5000)
    .build();
```

### 2. Basic Programmatic Tracing
Execute functions inside a tracing context using the fluent API:

```java
import dev.kuku.topotracer.sdk.TraceContext;
import dev.kuku.topotracer.sdk.TraceOptions;

// Start a root trace with custom options
TraceOptions rootOptions = TraceOptions.builder()
    .traceName("Place Order Flow")
    .importanceLabel(0, "api")
    .importanceLabel(1, "logic")
    .importanceLevel(0);

tracer.trace("place-order", () -> {
    // Current span is active in TraceContext
    TraceContext.getActive().setAttribute("order.id", "12345");

    // Nest tracing call (inherits traceId and creates child link automatically)
    tracer.trace("validate-inventory", () -> {
        // inner logic...
    });
    
}, rootOptions);

// Ensure all buffered spans are exported before application exit
tracer.shutdown();
```

### 3. Dynamic Importance Level Nesting
By default, nested child spans inherit the same importance level as their parent. If you enable `dynamicImportance(true)`, the child importance level automatically scales to `parent.importanceLevel + 1`:

```java
TraceOptions childOptions = TraceOptions.builder().dynamicImportance(true);

tracer.trace("parent-task", () -> {
    // level: 0
    tracer.trace("child-task", () -> {
        // level: 1
    }, childOptions);
});
```

### 4. Multithreading / Thread Switch Context Propagation
Since `TraceContext` is backed by `ThreadLocal`, trace context does not automatically propagate to child threads or worker pools. The SDK provides wrapping utilities:

#### Wrapping Runnable/Callable
```java
Runnable task = () -> {
    // Active span context is automatically restored here
    System.out.println("Trace ID: " + TraceContext.getActive().getTraceId());
};

// Wrap task
Runnable wrappedTask = tracer.wrap(task);
new Thread(wrappedTask).start();
```

#### Wrapping Executors
```java
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

Executor threadPool = Executors.newFixedThreadPool(4);
// Wrap executor to auto-propagate context to all submitted tasks
Executor wrappedPool = tracer.wrap(threadPool);

wrappedPool.execute(() -> {
    // Context is active here
});
```
