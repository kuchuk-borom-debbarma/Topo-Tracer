package dev.kuku.topotracer.sdk;

import org.slf4j.MDC;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Thread-local context propagation holder for the active span and execution cursor.
 * Integrates with SLF4J MDC for automatic logging decoration.
 */
public class TraceContext {
    private static final ThreadLocal<Span> activeSpan = new ThreadLocal<>();
    private static final ThreadLocal<Map<String, Span>> lastChildMap =
        ThreadLocal.withInitial(HashMap::new);
    private static final ThreadLocal<List<Span>> pendingParents =
        ThreadLocal.withInitial(List::of);

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

    public static Span getLastChild(String parentId) {
        return lastChildMap.get().get(parentId);
    }

    public static void setLastChild(String parentId, Span child) {
        lastChildMap.get().put(parentId, child);
    }

    static Snapshot capture() {
        return new Snapshot(
            activeSpan.get(),
            new HashMap<>(lastChildMap.get()),
            List.copyOf(pendingParents.get()));
    }

    static void restore(Snapshot snapshot) {
        lastChildMap.set(new HashMap<>(snapshot.lastChildren()));
        pendingParents.set(List.copyOf(snapshot.pendingParents()));
        setActive(snapshot.activeSpan());
    }

    static Span getTail(Span root) {
        Span tail = root;
        Span child;
        while (tail != null && (child = lastChildMap.get().get(tail.getId())) != null) {
            tail = child;
        }
        return tail;
    }

    static void setPendingParents(List<Span> parents) {
        pendingParents.set(List.copyOf(parents));
    }

    static List<Span> consumePendingParents() {
        List<Span> parents = pendingParents.get();
        pendingParents.set(List.of());
        return parents;
    }

    /**
     * Clear the active span and execution cursor from this thread.
     */
    public static void clear() {
        activeSpan.remove();
        lastChildMap.remove();
        pendingParents.remove();
        MDC.remove("traceId");
        MDC.remove("spanId");
    }

    record Snapshot(
        Span activeSpan,
        Map<String, Span> lastChildren,
        List<Span> pendingParents
    ) {
    }
}
