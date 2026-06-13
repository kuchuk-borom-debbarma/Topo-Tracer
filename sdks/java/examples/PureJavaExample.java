package dev.kuku.topotracer.sdk;

import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class PureJavaExample {

    public static void main(String[] args) {
        System.out.println("Starting Pure Java Topo-Tracer Example...");

        // 1. Initialize Tracer
        Tracer tracer = new Tracer.Builder()
            .endpoint("http://localhost:3999") // points to hono-server local ingest
            .apiKey("dev-key")
            .serviceName("pure-java-app")
            .batchSize(2)
            .flushIntervalMs(1000)
            .build();

        // 2. Start a Trace with custom metadata
        TraceOptions rootOptions = TraceOptions.builder()
            .traceName("Pure Java Demo Order Process")
            .importanceLabel(0, "Request Entry")
            .importanceLabel(1, "Service Call")
            .importanceLabel(2, "Database Query")
            .importanceLabel(3, "Sub-Query Detail")
            .importanceLevel(0); // Root trace starts at importance level 0

        // 3. Programmatic/Fluent trace calls with nested spans
        tracer.trace("create-order", () -> {
            Span activeSpan = TraceContext.getActive();
            activeSpan.setAttribute("order.id", "ord_998877");
            activeSpan.setAttribute("order.amount", "450.00");

            System.out.println("Running create-order span... traceId: " + activeSpan.getTraceId() + ", spanId: " + activeSpan.getId());

            // Nested call 1: automatically inherits parent traceId, creates child edge, importance = parent (0)
            tracer.trace("validate-payment", () -> {
                System.out.println("Running validate-payment span...");
                TraceContext.getActive().setAttribute("payment.method", "credit-card");
                sleep(50);
            });

            // Nested call 2: has dynamic nested importance enabled.
            // Importance will scale to parent.importance + 1 (which will be 1)
            TraceOptions childOptions = TraceOptions.builder().dynamicImportance(true);
            tracer.trace("save-to-db", () -> {
                Span dbSpan = TraceContext.getActive();
                System.out.println("Running save-to-db span... importance: " + dbSpan.getImportanceLevel());
                dbSpan.setAttribute("db.table", "orders");

                // Deeper nested call: inherits parent importance (1) + scales dynamic nested importance to 2!
                TraceOptions subDbOptions = TraceOptions.builder().dynamicImportance(true);
                tracer.trace("execute-sql-insert", () -> {
                    Span sqlSpan = TraceContext.getActive();
                    System.out.println("Running execute-sql-insert span... importance: " + sqlSpan.getImportanceLevel());
                    sqlSpan.setAttribute("db.statement", "INSERT INTO orders ...");
                    sleep(20);
                }, subDbOptions);

            }, childOptions);

            // 4. Thread-switching scenario: Propagating context to executor threads
            ExecutorService executor = Executors.newFixedThreadPool(2);
            // Wrap the executor so context is carried automatically to worker threads
            ExecutorService wrappedExecutor = (ExecutorService) tracer.wrap((java.util.concurrent.Executor) executor);

            wrappedExecutor.submit(() -> {
                Span asyncSpan = TraceContext.getActive();
                if (asyncSpan != null) {
                    System.out.println("Async thread running with correct context! traceId: " + asyncSpan.getTraceId() + ", parentSpanId: " + asyncSpan.getId());
                    // Start a nested span inside the async thread
                    tracer.trace("async-db-flush", () -> {
                        System.out.println("Nested async span executed successfully.");
                    });
                } else {
                    System.err.println("Failed: Context did not propagate to async thread.");
                }
            });

            // Wait for executor to finish
            executor.shutdown();
            try {
                executor.awaitTermination(2, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }

        }, rootOptions);

        // 5. Shutdown and flush
        System.out.println("Shutting down tracer and flushing remaining events...");
        tracer.shutdown();
        System.out.println("Example execution finished.");
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
