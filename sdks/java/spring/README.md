# @topo-tracer/spring-sdk (Spring Boot Starter)

A lightweight Spring Boot starter that integrates the Topo-Tracer SDK into a Spring Boot application. Provides automatic HTTP request tracing, RestTemplate/RestClient context propagation, AOP method tracing via `@Traced`, and thread-safe `@Async` context propagation.

Trace names are flow-specific. Incoming requests use names such as
`HTTP POST /api/orders`; root `@Traced` methods use their annotation value or
derived class/method name. No application-wide trace name is required.

## Installation

Add the following dependency to your `pom.xml` (requires compiling and installing both `topo-tracer-java-sdk` and `topo-tracer-spring-sdk` first via `mvn clean install`):

```xml
<dependency>
    <groupId>dev.kuku</groupId>
    <artifactId>topo-tracer-spring-sdk</artifactId>
    <version>0.0.1-SNAPSHOT</version>
</dependency>
```

## Configuration

Configure the SDK properties in your `application.properties` or `application.yml` using the `topotracer` prefix:

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `topotracer.endpoint` | `String` | **Required** | The Topo-Tracer server endpoint |
| `topotracer.apiKey` | `String` | **Required** | Your API Key for authentication |
| `topotracer.userId` | `String` | `null` | Optional tenant/user context |
| `topotracer.serviceName` | `String` | `null` | Name of the current service |
| `topotracer.batchSize` | `int` | `100` | Maximum span items per batch |
| `topotracer.flushIntervalMs` | `int` | `5000` | Background buffer flush interval |
| `topotracer.maxRetries` | `int` | `5` | Ingestion retry budget |
| `topotracer.retryDelayMs` | `int` | `1000` | Retry backoff base delay |

```properties
topotracer.endpoint=http://localhost:3999
topotracer.apiKey=dev-key
topotracer.serviceName=my-spring-app
topotracer.batchSize=10
topotracer.flushIntervalMs=1000
```

## Usage

### 1. Annotation-Driven Method Tracing
Annotate any Spring bean method with `@Traced` to trace its execution automatically. Nested calls will link back to parent nodes.

```java
import dev.kuku.topotracer.spring.Traced;
import dev.kuku.topotracer.sdk.TraceContext;
import org.springframework.stereotype.Service;

@Service
public class OrderService {

    @Traced(value = "create-order", nodeType = "service")
    public void createOrder(String orderId) {
        // TraceContext is active, logs decorated automatically with traceId/spanId
        TraceContext.getActive().setAttribute("order.id", orderId);
        
        // Nested method call with dynamic nested importance scaling (level = parentLevel + 1)
        dbWrite(orderId);
    }

    @Traced(value = "db-write", dynamicImportance = true, nodeType = "database")
    public void dbWrite(String orderId) {
        // Database query operations...
    }
}
```

### 2. Automatic Incoming Servlet HTTP Request Tracing
The SDK automatically registers a high-priority Servlet Filter (`TracingFilter`) that creates a root span for all incoming HTTP requests. It automatically extracts `X-Trace-Id` and `X-Span-Id` headers to continue incoming distributed traces.

### 3. Outgoing REST Call Context Propagation
Add the `TracingClientHttpRequestInterceptor` to your Spring `RestTemplate` (or `RestClient`) to automatically propagate the current active tracing headers to outbound HTTP calls:

```java
import dev.kuku.topotracer.spring.TracingClientHttpRequestInterceptor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

@Configuration
public class AppConfig {

    @Bean
    public RestTemplate restTemplate(TracingClientHttpRequestInterceptor interceptor) {
        RestTemplate restTemplate = new RestTemplate();
        restTemplate.getInterceptors().add(interceptor);
        return restTemplate;
    }
}
```

### 4. Async Task context propagation (`@Async`)
The SDK automatically registers a `BeanPostProcessor` that decorates Spring's `ThreadPoolTaskExecutor` beans with `TracingTaskDecorator`. This ensures any async operations scheduled via `@Async` inherit the parent thread's tracing context transparently!
