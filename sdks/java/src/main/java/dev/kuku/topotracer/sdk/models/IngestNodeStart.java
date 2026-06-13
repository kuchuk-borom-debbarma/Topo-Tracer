package dev.kuku.topotracer.sdk.models;

import java.util.Map;

public record IngestNodeStart(
    String id,
    String traceId,
    String nodeType,
    Map<String, String> data,
    String startMessage,
    long startedAt,
    int importanceLevel
) {}
