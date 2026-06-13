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
                assertEquals(1, childSpan.getImportanceLevel()); // Dynamic by default under new rules
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
    public void testNodeTypeImportanceMapping() throws Exception {
        Tracer tracer = new Tracer.Builder()
            .endpoint("http://invalid-endpoint-for-test-fallback")
            .apiKey("test-key")
            .maxRetries(1)
            .retryDelayMs(1)
            .flushIntervalMs(0)
            .build();

        // 1. Controller gets 0
        tracer.trace("controller-span", () -> {
            Span active = TraceContext.getActive();
            assertEquals(0, active.getImportanceLevel());

            // 2. Service under controller (rest) gets dynamic: parent (0) + 1 = 1
            tracer.trace("service-span", () -> {
                Span activeService = TraceContext.getActive();
                assertEquals(1, activeService.getImportanceLevel());

                // 3. DB call under service gets 0
                tracer.trace("db-span", () -> {
                    Span activeDb = TraceContext.getActive();
                    assertEquals(0, activeDb.getImportanceLevel());
                }, TraceOptions.builder().nodeType("db-call"));

                // 4. IO under service gets 1
                tracer.trace("io-span", () -> {
                    Span activeIo = TraceContext.getActive();
                    assertEquals(1, activeIo.getImportanceLevel());
                }, TraceOptions.builder().nodeType("io"));

                // 5. Nested service (rest) gets dynamic: parent (1) + 1 = 2
                tracer.trace("nested-service-span", () -> {
                    Span activeNested = TraceContext.getActive();
                    assertEquals(2, activeNested.getImportanceLevel());
                }, TraceOptions.builder().nodeType("service"));
            }, TraceOptions.builder().nodeType("service"));
        }, TraceOptions.builder().nodeType("controller"));

        // 6. Root dynamic (no parent) gets 2
        tracer.trace("root-service", () -> {
            Span activeRoot = TraceContext.getActive();
            assertEquals(2, activeRoot.getImportanceLevel());
        }, TraceOptions.builder().nodeType("service"));
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

    @Test
    public void testNodeTypeEnumAndImportanceEnum() throws Exception {
        Tracer tracer = new Tracer.Builder()
            .endpoint("http://invalid-endpoint-for-test-fallback")
            .apiKey("test-key")
            .flushIntervalMs(0)
            .build();

        tracer.trace("controller-span", () -> {
            Span active = TraceContext.getActive();
            assertEquals(0, active.getImportanceLevel());
            assertEquals("controller", active.getNodeType());

            tracer.trace("db-span", () -> {
                Span activeDb = TraceContext.getActive();
                assertEquals(0, activeDb.getImportanceLevel());
                assertEquals("db-call", activeDb.getNodeType());
            }, TraceOptions.builder().nodeType(TopoNodeType.DB_CALL));

            tracer.trace("critical-span", () -> {
                Span activeCrit = TraceContext.getActive();
                assertEquals(0, activeCrit.getImportanceLevel());
                assertEquals("method", activeCrit.getNodeType());
            }, TraceOptions.builder().nodeType(TopoNodeType.METHOD).importance(TopoImportance.CRITICAL));
        }, TraceOptions.builder().nodeType(TopoNodeType.CONTROLLER));
    }

    @Test
    public void testConfigurableNodeTypeMapping() throws Exception {
        Tracer tracer = new Tracer.Builder()
            .endpoint("http://invalid-endpoint-for-test-fallback")
            .apiKey("test-key")
            .flushIntervalMs(0)
            .nodeTypeImportance("custom-type", 3)
            .build();

        tracer.trace("custom-span", () -> {
            Span active = TraceContext.getActive();
            assertEquals(3, active.getImportanceLevel());
        }, TraceOptions.builder().nodeType("custom-type"));
    }

    @Test
    public void testSequentialSiblingChainingThroughDeepestDescendant() throws Exception {
        List<IngestBatch> batches = new ArrayList<>();
        Tracer tracer = new Tracer.Builder()
            .endpoint("http://invalid-endpoint-for-test-fallback")
            .apiKey("test-key")
            .flushIntervalMs(0)
            .onDrop(batches::add)
            .build();

        tracer.trace("P", () -> {
            tracer.trace("S1", () -> {
                tracer.trace("S1.1", () -> {});
                tracer.trace("S1.2", () -> {});
            });
            tracer.trace("S2", () -> {});
        });

        tracer.flush();

        assertEquals(1, batches.size());
        IngestBatch batch = batches.get(0);

        IngestNodeStart s1 = batch.nodeStarts().stream()
            .filter(n -> n.startMessage().equals("S1"))
            .findFirst()
            .orElse(null);
        IngestNodeStart s1_1 = batch.nodeStarts().stream()
            .filter(n -> n.startMessage().equals("S1.1"))
            .findFirst()
            .orElse(null);
        IngestNodeStart s1_2 = batch.nodeStarts().stream()
            .filter(n -> n.startMessage().equals("S1.2"))
            .findFirst()
            .orElse(null);
        IngestNodeStart s2 = batch.nodeStarts().stream()
            .filter(n -> n.startMessage().equals("S2"))
            .findFirst()
            .orElse(null);

        assertNotNull(s1);
        assertNotNull(s1_1);
        assertNotNull(s1_2);
        assertNotNull(s2);

        // Verify s1 -> s1_1
        var edge1 = batch.edgeStarts().stream()
            .filter(e -> e.toNodeId().equals(s1_1.id()))
            .findFirst()
            .orElse(null);
        assertNotNull(edge1);
        assertEquals(s1.id(), edge1.fromNodeId());

        // Verify s1_1 -> s1_2
        var edge2 = batch.edgeStarts().stream()
            .filter(e -> e.toNodeId().equals(s1_2.id()))
            .findFirst()
            .orElse(null);
        assertNotNull(edge2);
        assertEquals(s1_1.id(), edge2.fromNodeId());

        // Verify s1_2 -> s2
        var edge3 = batch.edgeStarts().stream()
            .filter(e -> e.toNodeId().equals(s2.id()))
            .findFirst()
            .orElse(null);
        assertNotNull(edge3);
        assertEquals(s1_2.id(), edge3.fromNodeId());
    }
}
