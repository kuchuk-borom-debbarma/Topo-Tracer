package dev.kuku.topotracer.sdk.models;

import java.util.Map;

public record IngestTraceStart(
    String traceId,
    String name,
    Map<Integer, String> importanceLabels,
    long timestamp
) {}
