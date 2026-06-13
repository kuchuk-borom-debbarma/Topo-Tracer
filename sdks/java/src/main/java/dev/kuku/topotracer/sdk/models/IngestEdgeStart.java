package dev.kuku.topotracer.sdk.models;

import java.util.Map;

public record IngestEdgeStart(
    String id,
    String traceId,
    String edgeType,
    String fromNodeId,
    String toNodeId,
    Map<String, String> data,
    long startedAt
) {}
