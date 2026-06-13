package dev.kuku.topotracer.sdk.models;

import java.util.List;

public record IngestBatch(
    List<IngestTraceStart> traceStarts,
    List<IngestNodeStart> nodeStarts,
    List<IngestEdgeStart> edgeStarts,
    List<IngestNodeEnd> nodeEnds,
    List<IngestEdgeEnd> edgeEnds
) {}
