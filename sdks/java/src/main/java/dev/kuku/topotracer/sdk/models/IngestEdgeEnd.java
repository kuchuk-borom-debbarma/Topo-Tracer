package dev.kuku.topotracer.sdk.models;

public record IngestEdgeEnd(
    String id,
    String traceId,
    long endedAt
) {}
