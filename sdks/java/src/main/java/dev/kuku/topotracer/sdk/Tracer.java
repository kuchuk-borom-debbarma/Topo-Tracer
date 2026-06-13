package dev.kuku.topotracer.sdk;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.kuku.topotracer.sdk.models.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Consumer;

/**
 * Main coordinator of the Topo-Tracer SDK.
 * Handles trace/span creation, event buffering, and background exporting.
 */
public class Tracer {
    private static final Logger log = LoggerFactory.getLogger(Tracer.class);

    private static final int HARD_BATCH_CAP = 1000;
    private static final int DEFAULT_BATCH_SIZE = 100;
    private static final int DEFAULT_FLUSH_INTERVAL = 5000;
    private static final int DEFAULT_MAX_RETRIES = 5;
    private static final int DEFAULT_RETRY_DELAY = 1000;

    private final String endpoint;
    private final String apiKey;
    private final String userId;
    private final String serviceName;
    private final int batchSize;
    private final int flushIntervalMs;
    private final int maxRetries;
    private final int retryDelayMs;
    private final Consumer<IngestBatch> onDrop;
    private final Map<String, Integer> nodeTypeImportanceMapping;

    private final List<IngestTraceStart> traceStartsBuffer = new ArrayList<>();
    private final List<IngestNodeStart> nodeStartsBuffer = new ArrayList<>();
    private final List<IngestEdgeStart> edgeStartsBuffer = new ArrayList<>();
    private final List<IngestNodeEnd> nodeEndsBuffer = new ArrayList<>();
    private final List<IngestEdgeEnd> edgeEndsBuffer = new ArrayList<>();

    private final Object bufferLock = new Object();
    private final ScheduledExecutorService flushScheduler;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public static class Builder {
        private String endpoint;
        private String apiKey;
        private String userId;
        private String serviceName;
        private int batchSize = DEFAULT_BATCH_SIZE;
        private int flushIntervalMs = DEFAULT_FLUSH_INTERVAL;
        private int maxRetries = DEFAULT_MAX_RETRIES;
        private int retryDelayMs = DEFAULT_RETRY_DELAY;
        private Consumer<IngestBatch> onDrop;

        public Builder endpoint(String endpoint) {
            this.endpoint = endpoint;
            return this;
        }

        public Builder apiKey(String apiKey) {
            this.apiKey = apiKey;
            return this;
        }

        public Builder userId(String userId) {
            this.userId = userId;
            return this;
        }

        public Builder serviceName(String serviceName) {
            this.serviceName = serviceName;
            return this;
        }

        public Builder batchSize(int batchSize) {
            this.batchSize = batchSize;
            return this;
        }

        public Builder flushIntervalMs(int flushIntervalMs) {
            this.flushIntervalMs = flushIntervalMs;
            return this;
        }

        public Builder maxRetries(int maxRetries) {
            this.maxRetries = maxRetries;
            return this;
        }

        public Builder retryDelayMs(int retryDelayMs) {
            this.retryDelayMs = retryDelayMs;
            return this;
        }

        public Builder onDrop(Consumer<IngestBatch> onDrop) {
            this.onDrop = onDrop;
            return this;
        }

        private final Map<String, Integer> nodeTypeImportanceMapping = new HashMap<>();

        public Builder nodeTypeImportanceMapping(Map<String, Integer> nodeTypeImportanceMapping) {
            if (nodeTypeImportanceMapping != null) {
                this.nodeTypeImportanceMapping.putAll(nodeTypeImportanceMapping);
            }
            return this;
        }

        public Builder nodeTypeImportance(String nodeType, int importance) {
            if (nodeType != null) {
                this.nodeTypeImportanceMapping.put(nodeType.trim().toLowerCase(), importance);
            }
            return this;
        }

        public Tracer build() {
            if (endpoint == null || endpoint.isBlank()) {
                throw new IllegalArgumentException("Endpoint is required");
            }
            if (apiKey == null || apiKey.isBlank()) {
                throw new IllegalArgumentException("API Key is required");
            }
            return new Tracer(this);
        }
    }

    private Tracer(Builder builder) {
        this.endpoint = builder.endpoint;
        this.apiKey = builder.apiKey;
        this.userId = builder.userId;
        this.serviceName = builder.serviceName;
        this.batchSize = builder.batchSize;
        this.flushIntervalMs = builder.flushIntervalMs;
        this.maxRetries = builder.maxRetries;
        this.retryDelayMs = builder.retryDelayMs;
        this.onDrop = builder.onDrop;

        Map<String, Integer> mappings = new ConcurrentHashMap<>();
        // Default mappings
        mappings.put("controller", 0);
        mappings.put("http-request", 0);
        mappings.put("request", 0);
        mappings.put("remote-call", 0);
        mappings.put("http-client", 0);
        mappings.put("outbound-http", 0);
        mappings.put("remote", 0);
        mappings.put("api-call", 0);
        mappings.put("client", 0);
        mappings.put("db-call", 0);
        mappings.put("db", 0);
        mappings.put("database", 0);
        mappings.put("db-query", 0);
        mappings.put("query", 0);
        mappings.put("repository", 0);
        mappings.put("io", 1);
        mappings.put("file", 1);
        mappings.put("network", 1);
        mappings.put("stream", 1);

        // Merge builder mappings (overrides defaults)
        for (Map.Entry<String, Integer> entry : builder.nodeTypeImportanceMapping.entrySet()) {
            if (entry.getKey() != null && entry.getValue() != null) {
                mappings.put(entry.getKey().trim().toLowerCase(), entry.getValue());
            }
        }
        this.nodeTypeImportanceMapping = mappings;

        this.httpClient = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(10))
            .build();
        this.objectMapper = new ObjectMapper();

        if (this.flushIntervalMs > 0) {
            this.flushScheduler = Executors.newSingleThreadScheduledExecutor(runnable -> {
                Thread thread = new Thread(runnable, "topo-tracer-flush-scheduler");
                thread.setDaemon(true);
                return thread;
            });
            this.flushScheduler.scheduleAtFixedRate(this::flush, this.flushIntervalMs, this.flushIntervalMs, TimeUnit.MILLISECONDS);
        } else {
            this.flushScheduler = null;
        }

        // JVM shutdown hook
        Runtime.getRuntime().addShutdownHook(new Thread(this::shutdown, "topo-tracer-shutdown-hook"));
    }

    /**
     * Programmatic context wrapper: execute task within span context.
     */
    public <T> T trace(String name, Callable<T> task) throws Exception {
        return trace(name, task, null);
    }

    /**
     * Programmatic context wrapper: execute task within span context.
     */
    public <T> T trace(String name, Callable<T> task, TraceOptions options) throws Exception {
        Span span = startNode(name, options);
        Span parent = TraceContext.getActive();
        TraceContext.setActive(span);
        try {
            return task.call();
        } catch (Exception e) {
            span.setAttribute("error", true);
            span.setAttribute("error.message", e.getMessage());
            throw e;
        } finally {
            span.end();
            TraceContext.setActive(parent);
        }
    }

    /**
     * Programmatic context wrapper: execute runnable task within span context.
     */
    public void trace(String name, Runnable task) {
        trace(name, task, null);
    }

    /**
     * Programmatic context wrapper: execute runnable task within span context.
     */
    public void trace(String name, Runnable task, TraceOptions options) {
        Span span = startNode(name, options);
        Span parent = TraceContext.getActive();
        TraceContext.setActive(span);
        try {
            task.run();
        } catch (RuntimeException e) {
            span.setAttribute("error", true);
            span.setAttribute("error.message", e.getMessage());
            throw e;
        } finally {
            span.end();
            TraceContext.setActive(parent);
        }
    }

    /**
     * Create a span manually. Requires manual ending with span.end().
     */
    public Span createSpan(String name, TraceOptions options) {
        return startNode(name, options);
    }

    /**
     * Internal method to build a span and emit node/edge starts.
     */
    public Span startNode(String name, TraceOptions options) {
        TraceOptions opts = options != null ? options : TraceOptions.builder();
        Span currentParent = TraceContext.getActive();

        String id = UUID.randomUUID().toString();
        String traceId = opts.getTraceId();
        if (traceId == null) {
            traceId = currentParent != null ? currentParent.getTraceId() : UUID.randomUUID().toString();
        }

        String parentSpanId = opts.getParentSpanId();
        if (parentSpanId == null && currentParent != null) {
            Span prevSibling = TraceContext.getLastChild(currentParent.getId());
            parentSpanId = prevSibling != null ? prevSibling.getId() : currentParent.getId();
        }

        int importance;
        if (opts.getImportanceLevel() != null) {
            importance = opts.getImportanceLevel();
        } else {
            String type = opts.getNodeType();
            if (type == null) {
                type = "default";
            }
            type = type.trim().toLowerCase();

            if (nodeTypeImportanceMapping.containsKey(type)) {
                importance = nodeTypeImportanceMapping.get(type);
            } else {
                if (currentParent != null) {
                    importance = currentParent.getImportanceLevel() + 1;
                } else {
                    importance = 2;
                }
            }
        }

        // Must be mutable and thread-safe so attributes appended later are synced
        Map<String, String> data = new ConcurrentHashMap<>();
        if (opts.getData() != null) {
            data.putAll(opts.getData());
        }
        if (serviceName != null && !serviceName.isBlank() && !data.containsKey("serviceName")) {
            data.put("serviceName", serviceName);
        }

        IngestNodeStart nodeStart = new IngestNodeStart(
            id,
            traceId,
            opts.getNodeType() != null ? opts.getNodeType() : "default",
            data,
            name,
            System.currentTimeMillis(),
            importance
        );

        List<IngestTraceStart> traceStarts = new ArrayList<>();
        // If starting a NEW trace (no traceId provided in options and no current active context)
        if (opts.getTraceId() == null && currentParent == null) {
            traceStarts.add(new IngestTraceStart(
                traceId,
                opts.getTraceName(),
                opts.getImportanceLabels(),
                System.currentTimeMillis()
            ));
        }

        Span span = new Span(nodeStart, (endedSpan) -> {
            addToBuffer(
                List.of(),
                List.of(),
                List.of(),
                List.of(endedSpan.toNodeEnd()),
                List.of()
            );
        });

        List<IngestEdgeStart> edgeStarts = new ArrayList<>();
        if (parentSpanId != null) {
            edgeStarts.add(new IngestEdgeStart(
                UUID.randomUUID().toString(),
                traceId,
                "child",
                parentSpanId,
                span.getId(),
                Map.of(),
                System.currentTimeMillis()
            ));
        }

        addToBuffer(
            traceStarts,
            List.of(span.toNodeStart()),
            edgeStarts,
            List.of(),
            List.of()
        );

        if (currentParent != null) {
            TraceContext.setLastChild(currentParent.getId(), span);
        }

        return span;
    }

    /**
     * Propagator: wraps a Runnable so the current thread context is carried into execution.
     */
    public Runnable wrap(Runnable runnable) {
        Span activeSpan = TraceContext.getActive();
        return () -> {
            Span parent = TraceContext.getActive();
            TraceContext.setActive(activeSpan);
            try {
                runnable.run();
            } finally {
                TraceContext.setActive(parent);
            }
        };
    }

    /**
     * Propagator: wraps a Callable so the current thread context is carried into execution.
     */
    public <T> Callable<T> wrap(Callable<T> callable) {
        Span activeSpan = TraceContext.getActive();
        return () -> {
            Span parent = TraceContext.getActive();
            TraceContext.setActive(activeSpan);
            try {
                return callable.call();
            } finally {
                TraceContext.setActive(parent);
            }
        };
    }

    /**
     * Propagator: wraps an Executor to automatically propagate trace context on all submitted runnables.
     */
    public Executor wrap(Executor executor) {
        return runnable -> executor.execute(wrap(runnable));
    }

    /**
     * Propagator: wraps an ExecutorService to automatically propagate trace context.
     */
    public ExecutorService wrap(ExecutorService executorService) {
        return new TracingExecutorService(executorService);
    }

    /**
     * Context propagation helper for manual export/outbound requests.
     */
    public Map<String, String> extractContext() {
        Span span = TraceContext.getActive();
        if (span == null) {
            return Map.of();
        }
        Map<String, String> context = new HashMap<>();
        context.put("x-topo-trace-id", span.getTraceId());
        context.put("x-topo-parent-id", span.getId());
        context.put("X-Trace-Id", span.getTraceId());
        context.put("X-Span-Id", span.getId());
        return context;
    }

    /**
     * Context propagation helper to inject incoming trace context into local context.
     * Returns a dummy parent span.
     */
    public Span injectContext(String traceId, String spanId) {
        IngestNodeStart nodeStart = new IngestNodeStart(
            spanId,
            traceId,
            "external",
            new ConcurrentHashMap<>(),
            "external",
            System.currentTimeMillis(),
            0
        );
        return new Span(nodeStart, null);
    }

    private void addToBuffer(
        List<IngestTraceStart> traceStarts,
        List<IngestNodeStart> nodeStarts,
        List<IngestEdgeStart> edgeStarts,
        List<IngestNodeEnd> nodeEnds,
        List<IngestEdgeEnd> edgeEnds
    ) {
        int incoming = traceStarts.size() + nodeStarts.size() + edgeStarts.size() + nodeEnds.size() + edgeEnds.size();
        if (incoming == 0) return;

        boolean triggerFlush = false;

        synchronized (bufferLock) {
            int current = traceStartsBuffer.size() + nodeStartsBuffer.size() + edgeStartsBuffer.size() +
                nodeEndsBuffer.size() + edgeEndsBuffer.size();

            if (current + incoming > HARD_BATCH_CAP) {
                triggerFlush = true;
            }

            traceStartsBuffer.addAll(traceStarts);
            nodeStartsBuffer.addAll(nodeStarts);
            edgeStartsBuffer.addAll(edgeStarts);
            nodeEndsBuffer.addAll(nodeEnds);
            edgeEndsBuffer.addAll(edgeEnds);

            int newTotal = current + incoming;
            if (newTotal >= batchSize) {
                triggerFlush = true;
            }
        }

        if (triggerFlush) {
            flush();
        }
    }

    /**
     * Immediately export all buffered items.
     */
    public void flush() {
        IngestBatch batch;
        synchronized (bufferLock) {
            if (traceStartsBuffer.isEmpty() && nodeStartsBuffer.isEmpty() &&
                edgeStartsBuffer.isEmpty() && nodeEndsBuffer.isEmpty() && edgeEndsBuffer.isEmpty()) {
                return;
            }
            batch = new IngestBatch(
                new ArrayList<>(traceStartsBuffer),
                new ArrayList<>(nodeStartsBuffer),
                new ArrayList<>(edgeStartsBuffer),
                new ArrayList<>(nodeEndsBuffer),
                new ArrayList<>(edgeEndsBuffer)
            );
            traceStartsBuffer.clear();
            nodeStartsBuffer.clear();
            edgeStartsBuffer.clear();
            nodeEndsBuffer.clear();
            edgeEndsBuffer.clear();
        }

        try {
            ingestWithRetry(batch);
        } catch (Exception e) {
            log.error("[Topo-Tracer SDK] Failed to ingest trace batch", e);
            if (onDrop != null) {
                try {
                    onDrop.accept(batch);
                } catch (Exception ex) {
                    log.error("[Topo-Tracer SDK] Error in onDrop callback", ex);
                }
            }
        }
    }

    private void ingestWithRetry(IngestBatch batch) throws Exception {
        Exception lastError = null;
        for (int i = 0; i < maxRetries; i++) {
            try {
                sendIngest(batch);
                return;
            } catch (Exception e) {
                lastError = e;
                if (i < maxRetries - 1) {
                    long delay = (long) (Math.pow(2, i) * retryDelayMs + Math.random() * 1000);
                    Thread.sleep(delay);
                }
            }
        }
        throw lastError != null ? lastError : new RuntimeException("Ingestion failed after retries");
    }

    private void sendIngest(IngestBatch batch) throws Exception {
        String payload;
        if (userId != null && !userId.isBlank()) {
            Map<String, Object> map = new HashMap<>();
            map.put("userId", userId);
            map.put("traceStarts", batch.traceStarts());
            map.put("nodeStarts", batch.nodeStarts());
            map.put("edgeStarts", batch.edgeStarts());
            map.put("nodeEnds", batch.nodeEnds());
            map.put("edgeEnds", batch.edgeEnds());
            payload = objectMapper.writeValueAsString(map);
        } else {
            payload = objectMapper.writeValueAsString(batch);
        }

        HttpRequest.Builder builder = HttpRequest.newBuilder()
            .uri(URI.create(buildIngestUrl(endpoint)))
            .header("Content-Type", "application/json")
            .header("X-API-Key", apiKey)
            .POST(HttpRequest.BodyPublishers.ofString(payload));

        if (userId != null && !userId.isBlank()) {
            builder.header("X-User-Id", userId);
        }

        HttpRequest request = builder.build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new RuntimeException("HTTP Ingestion Error status=" + response.statusCode() + " body=" + response.body());
        }
    }

    private String buildIngestUrl(String endpoint) {
        String trimmed = endpoint.replaceAll("/+$", "");
        return trimmed.endsWith("/api/v1/ingest") ? trimmed : trimmed + "/api/v1/ingest";
    }

    /**
     * Stop the background scheduler and flush any remaining events.
     */
    public void shutdown() {
        if (flushScheduler != null) {
            flushScheduler.shutdown();
            try {
                if (!flushScheduler.awaitTermination(5, TimeUnit.SECONDS)) {
                    flushScheduler.shutdownNow();
                }
            } catch (InterruptedException e) {
                flushScheduler.shutdownNow();
                Thread.currentThread().interrupt();
            }
        }
        flush();
    }

    /**
     * Tracing decorator class for standard Java ExecutorService implementations.
     */
    private class TracingExecutorService implements ExecutorService {
        private final ExecutorService delegate;

        public TracingExecutorService(ExecutorService delegate) {
            this.delegate = delegate;
        }

        @Override
        public void execute(Runnable command) {
            delegate.execute(wrap(command));
        }

        @Override
        public void shutdown() {
            delegate.shutdown();
        }

        @Override
        public List<Runnable> shutdownNow() {
            return delegate.shutdownNow();
        }

        @Override
        public boolean isShutdown() {
            return delegate.isShutdown();
        }

        @Override
        public boolean isTerminated() {
            return delegate.isTerminated();
        }

        @Override
        public boolean awaitTermination(long timeout, TimeUnit unit) throws InterruptedException {
            return delegate.awaitTermination(timeout, unit);
        }

        @Override
        public <T> Future<T> submit(Callable<T> task) {
            return delegate.submit(wrap(task));
        }

        @Override
        public <T> Future<T> submit(Runnable task, T result) {
            return delegate.submit(wrap(task), result);
        }

        @Override
        public Future<?> submit(Runnable task) {
            return delegate.submit(wrap(task));
        }

        @Override
        public <T> List<Future<T>> invokeAll(Collection<? extends Callable<T>> tasks) throws InterruptedException {
            Collection<Callable<T>> wrapped = new ArrayList<>(tasks.size());
            for (Callable<T> t : tasks) {
                wrapped.add(wrap(t));
            }
            return delegate.invokeAll(wrapped);
        }

        @Override
        public <T> List<Future<T>> invokeAll(Collection<? extends Callable<T>> tasks, long timeout, TimeUnit unit) throws InterruptedException {
            Collection<Callable<T>> wrapped = new ArrayList<>(tasks.size());
            for (Callable<T> t : tasks) {
                wrapped.add(wrap(t));
            }
            return delegate.invokeAll(wrapped, timeout, unit);
        }

        @Override
        public <T> T invokeAny(Collection<? extends Callable<T>> tasks) throws InterruptedException, ExecutionException {
            Collection<Callable<T>> wrapped = new ArrayList<>(tasks.size());
            for (Callable<T> t : tasks) {
                wrapped.add(wrap(t));
            }
            return delegate.invokeAny(wrapped);
        }

        @Override
        public <T> T invokeAny(Collection<? extends Callable<T>> tasks, long timeout, TimeUnit unit) throws InterruptedException, ExecutionException, TimeoutException {
            Collection<Callable<T>> wrapped = new ArrayList<>(tasks.size());
            for (Callable<T> t : tasks) {
                wrapped.add(wrap(t));
            }
            return delegate.invokeAny(wrapped, timeout, unit);
        }
    }
}
