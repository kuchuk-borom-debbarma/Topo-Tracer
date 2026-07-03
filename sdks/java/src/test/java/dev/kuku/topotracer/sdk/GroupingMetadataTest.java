package dev.kuku.topotracer.sdk;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class GroupingMetadataTest {
    @Test
    void startNodeAddsDefaultGroupParentAndExplicitLayer() {
        Tracer tracer = new Tracer.Builder()
            .endpoint("http://localhost:8787")
            .apiKey("test-key")
            .flushIntervalMs(0)
            .batchSize(100)
            .build();

        Span root = tracer.startNode("controller", TraceOptions.builder().nodeType("controller"));
        TraceContext.setActive(root);

        Span child = tracer.startNode("child", TraceOptions.builder().nodeType("method"));
        Span service = tracer.startNode("payments-api", TraceOptions.builder()
            .nodeType("remote-call")
            .groupParentId(null)
            .layer("external-services", "External Services", 3));

        assertNull(root.getGroupParentId());
        assertEquals(root.getId(), child.getGroupParentId());
        assertNull(service.getGroupParentId());
        assertEquals("external-services", service.getLayer().key());
        assertEquals("External Services", service.getLayer().label());
        assertEquals(3, service.getLayer().order());

        TraceContext.clear();
    }
}
