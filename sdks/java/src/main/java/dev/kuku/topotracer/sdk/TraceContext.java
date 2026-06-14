package dev.kuku.topotracer.sdk;

import org.slf4j.MDC;

/**
 * Thread-local context propagation holder for the active Span.
 * Integrates with SLF4J MDC for automatic logging decoration.
 */
public class TraceContext {
    private static final ThreadLocal<Span> activeSpan = new ThreadLocal<>();

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
     * Clear the active span from this thread.
     */
    public static void clear() {
        activeSpan.remove();
        MDC.remove("traceId");
        MDC.remove("spanId");
    }
}
