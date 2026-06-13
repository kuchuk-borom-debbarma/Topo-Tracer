package dev.kuku.topotracer.sdk.models;

public record IngestNodeEnd(
    String id,
    String traceId,
    long endedAt,
    String endMessage
) {}
