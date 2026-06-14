package dev.kuku.topotracer.sdk;

/**
 * Hook triggered during span lifecycle transitions.
 * Runs synchronously on the calling thread.
 */
public interface TraceHook {
    /**
     * Called when a span starts.
     *
     * @param span the started span
     */
    default void onSpanStart(Span span) {}

    /**
     * Called when a span ends.
     *
     * @param span the ended span
     */
    default void onSpanEnd(Span span) {}
}
