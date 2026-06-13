package dev.kuku.topotracer.sdk;

import dev.kuku.topotracer.sdk.models.IngestBatch;
import dev.kuku.topotracer.sdk.models.IngestNodeStart;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

public class TracerTest {

    @Test
    public void testBasicTracingAndNesting() throws Exception {
        List<IngestBatch> batches = new ArrayList<>();
        
        Tracer tracer = new Tracer.Builder()
            .endpoint("http://invalid-endpoint-for-test-fallback")
            .apiKey("test-key")
            .serviceName("test-service")
            .maxRetries(1)
            .retryDelayMs(1)
            .flushIntervalMs(0) // Disable scheduled flush, use manual flush
            .onDrop(batches::add)
            .build();

        TraceOptions options = TraceOptions.builder()
            .traceName("Test Trace")
            .importanceLabel(0, "level-0")
            .importanceLevel(0);

        // Run trace block
        tracer.trace("root-node", () -> {
            Span rootSpan = TraceContext.getActive();
            assertNotNull(rootSpan);
            assertEquals("root-node", rootSpan.getStartMessage());
            assertEquals(0, rootSpan.getImportanceLevel());
            rootSpan.setAttribute("test-attr", "value1");

            // Nested trace call
            tracer.trace("child-node", () -> {
                Span childSpan = TraceContext.getActive();
                assertNotNull(childSpan);
                assertEquals("child-node", childSpan.getStartMessage());
                assertEquals(0, childSpan.getImportanceLevel()); // Inherits parent level by default
            });
        }, options);

        // Trigger manual flush
        tracer.flush();

        // Verify that flush failed (as expected) and called onDrop, capturing the batch
        assertEquals(1, batches.size());
        IngestBatch batch = batches.get(0);

        // 1. Verify trace start
        assertEquals(1, batch.traceStarts().size());
        assertEquals("Test Trace", batch.traceStarts().get(0).name());
        assertEquals("level-0", batch.traceStarts().get(0).importanceLabels().get(0));

        // 2. Verify node starts
        assertEquals(2, batch.nodeStarts().size());
        IngestNodeStart rootNode = batch.nodeStarts().stream()
            .filter(n -> n.startMessage().equals("root-node"))
            .findFirst()
            .orElse(null);
        assertNotNull(rootNode);
        assertEquals("value1", rootNode.data().get("test-attr"));
        assertEquals("test-service", rootNode.data().get("serviceName"));

        IngestNodeStart childNode = batch.nodeStarts().stream()
            .filter(n -> n.startMessage().equals("child-node"))
            .findFirst()
            .orElse(null);
        assertNotNull(childNode);

        // 3. Verify parent-child edge
        assertEquals(1, batch.edgeStarts().size());
        assertEquals(rootNode.id(), batch.edgeStarts().get(0).fromNodeId());
        assertEquals(childNode.id(), batch.edgeStarts().get(0).toNodeId());
        assertEquals("child", batch.edgeStarts().get(0).edgeType());

        // 4. Verify node ends
        assertEquals(2, batch.nodeEnds().size());
    }

    @Test
    public void testDynamicImportanceScaling() throws Exception {
        List<IngestBatch> batches = new ArrayList<>();
        Tracer tracer = new Tracer.Builder()
            .endpoint("http://invalid-endpoint-for-test-fallback")
            .apiKey("test-key")
            .maxRetries(1)
            .retryDelayMs(1)
            .flushIntervalMs(0)
            .onDrop(batches::add)
            .build();

        TraceOptions rootOptions = TraceOptions.builder()
            .importanceLevel(1);

        tracer.trace("root", () -> {
            // Child 1: dynamic nesting disabled (default: false)
            tracer.trace("static-child", () -> {
                assertEquals(1, TraceContext.getActive().getImportanceLevel());
            });

            // Child 2: dynamic nesting enabled
            TraceOptions opt2 = TraceOptions.builder().dynamicImportance(true);
            tracer.trace("dynamic-child", () -> {
                Span active = TraceContext.getActive();
                assertEquals(2, active.getImportanceLevel()); // Inherits + 1

                // Nested dynamic child
                TraceOptions opt3 = TraceOptions.builder().dynamicImportance(true);
                tracer.trace("dynamic-grandchild", () -> {
                    assertEquals(3, TraceContext.getActive().getImportanceLevel()); // Grandparent + 2
                }, opt3);
            }, opt2);
        }, rootOptions);
    }

    @Test
    public void testThreadContextPropagation() throws Exception {
        List<IngestBatch> batches = new ArrayList<>();
        Tracer tracer = new Tracer.Builder()
            .endpoint("http://invalid-endpoint-for-test-fallback")
            .apiKey("test-key")
            .maxRetries(1)
            .retryDelayMs(1)
            .flushIntervalMs(0)
            .onDrop(batches::add)
            .build();

        ExecutorService executor = Executors.newFixedThreadPool(1);
        ExecutorService wrappedExecutor = tracer.wrap(executor);

        tracer.trace("root", () -> {
            Span rootSpan = TraceContext.getActive();
            assertNotNull(rootSpan);
            String traceId = rootSpan.getTraceId();

            Callable<String> task = () -> {
                Span activeSpan = TraceContext.getActive();
                assertNotNull(activeSpan);
                assertEquals(traceId, activeSpan.getTraceId());
                return "success";
            };

            // Wrap callable and submit
            wrappedExecutor.submit(task);
        });

        executor.shutdown();
        assertTrue(executor.awaitTermination(2, TimeUnit.SECONDS));
    }
}
