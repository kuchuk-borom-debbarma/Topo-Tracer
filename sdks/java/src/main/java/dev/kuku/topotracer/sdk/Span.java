package dev.kuku.topotracer.sdk;

import dev.kuku.topotracer.sdk.models.IngestNodeEnd;
import dev.kuku.topotracer.sdk.models.IngestNodeStart;

import java.util.HashMap;
import java.util.Map;
import java.util.function.Consumer;

/**
 * Represents a single node unit of execution in a trace.
 */
public class Span {
    private final String id;
    private final String traceId;
    private final String nodeType;
    private final String startMessage;
    private final String name;
    private final long startedAt;
    private final int importanceLevel;
    private final Map<String, String> data; // Shared mutable map reference
    private final Consumer<Span> onEnd;
    
    private String endMessage;
    private boolean ended = false;

    public Span(IngestNodeStart nodeStart, Consumer<Span> onEnd) {
        this.id = nodeStart.id();
        this.traceId = nodeStart.traceId();
        this.nodeType = nodeStart.nodeType();
        this.startMessage = nodeStart.startMessage();
        this.name = nodeStart.name();
        this.startedAt = nodeStart.startedAt();
        this.importanceLevel = nodeStart.importanceLevel();
        this.data = nodeStart.data(); // Share reference to dynamic attribute map
        this.onEnd = onEnd;
    }

    public synchronized Span setAttribute(String key, Object value) {
        if (ended) return this;
        this.data.put(key, value == null ? "null" : String.valueOf(value));
        return this;
    }

    public synchronized Span setData(String key, String value) {
        return setAttribute(key, value);
    }

    public synchronized Span setAllData(Map<String, String> data) {
        if (ended) return this;
        if (data != null) {
            this.data.putAll(data);
        }
        return this;
    }

    public synchronized void end() {
        end(null);
    }

    public synchronized void end(String endMessage) {
        if (ended) return;
        this.ended = true;
        this.endMessage = endMessage;
        if (onEnd != null) {
            onEnd.accept(this);
        }
    }

    public String getId() {
        return id;
    }

    public String getTraceId() {
        return traceId;
    }

    public String getNodeType() {
        return nodeType;
    }

    public String getStartMessage() {
        return startMessage;
    }

    public String getName() {
        return name;
    }

    public long getStartedAt() {
        return startedAt;
    }

    public int getImportanceLevel() {
        return importanceLevel;
    }

    public synchronized Map<String, String> getData() {
        return new HashMap<>(data);
    }

    public boolean isEnded() {
        return ended;
    }

    public String getEndMessage() {
        return endMessage;
    }

    public IngestNodeStart toNodeStart() {
        return new IngestNodeStart(
            id,
            traceId,
            nodeType,
            data, // Shares map reference
            startMessage,
            startedAt,
            importanceLevel,
            name
        );
    }

    public IngestNodeEnd toNodeEnd() {
        return new IngestNodeEnd(
            id,
            traceId,
            System.currentTimeMillis(),
            endMessage
        );
    }
}
