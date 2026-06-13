package dev.kuku.topotracer.sdk;

import org.slf4j.MDC;
import java.util.HashMap;
import java.util.Map;

/**
 * Thread-local context propagation holder for the active Span and sibling child tracking.
 * Integrates with SLF4J MDC for automatic logging decoration.
 */
public class TraceContext {
    private static final ThreadLocal<Span> activeSpan = new ThreadLocal<>();
    private static final ThreadLocal<Map<String, Span>> lastChildMap = ThreadLocal.withInitial(HashMap::new);

    /**
     * Get the current active span in this thread.
     */
    public static Span getActive() {
        return activeSpan.get();
    }

    /**
     * Set the current active span for this thread and update SLF4J MDC.
     */
    public static void setActive(Span span) {
        if (span == null) {
            clear();
        } else {
            activeSpan.set(span);
            MDC.put("traceId", span.getTraceId());
            MDC.put("spanId", span.getId());
        }
    }

    /**
     * Get the last child span started under a parent in the current thread.
     */
    public static Span getLastChild(String parentId) {
        return lastChildMap.get().get(parentId);
    }

    /**
     * Set the last child span started under a parent in the current thread.
     */
    public static void setLastChild(String parentId, Span child) {
        lastChildMap.get().put(parentId, child);
    }

    /**
     * Clear the active span and child mappings from this thread.
     */
    public static void clear() {
        activeSpan.remove();
        lastChildMap.remove();
        MDC.remove("traceId");
        MDC.remove("spanId");
    }
}
