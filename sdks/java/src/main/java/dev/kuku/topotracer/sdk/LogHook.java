package dev.kuku.topotracer.sdk;

import java.util.Map;

/**
 * Hook triggered when a log is recorded by the Tracer.
 * Runs synchronously on the calling thread.
 */
@FunctionalInterface
public interface LogHook {
    /**
     * Called when a log message is captured.
     *
     * @param message the log message
     * @param data metadata map (non-null, but may be empty)
     * @param importanceLevel the importance level of the log (may be null)
     */
    void onLog(String message, Map<String, String> data, Integer importanceLevel);
}
