// fallow-ignore-file
import { describe, expect, it } from "bun:test";
import { parseTraceParent, formatTraceParent, hexToUuid, uuidToHex, spanIdToUuid } from "./context";
import { InternalTracer, SpansBuffer, ActiveSpanContext } from "./InternalTracer";

describe("Tracing Context Helper", () => {
  it("should parse valid traceparent header", () => {
    const header = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    const parsed = parseTraceParent(header);
    
    expect(parsed).not.toBeNull();
    expect(parsed!.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(parsed!.spanId).toBe("00f067aa0ba902b7");
    expect(parsed!.sampled).toBe(true);
  });

  it("should return null for invalid traceparent header", () => {
    const invalidHeader = "00-shorttrace-shortspan-01";
    const parsed = parseTraceParent(invalidHeader);
    expect(parsed).toBeNull();
  });

  it("should format context to W3C traceparent header", () => {
    const ctx = {
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      spanId: "00f067aa0ba902b7",
      sampled: true,
    };
    const header = formatTraceParent(ctx);
    expect(header).toBe("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");
  });

  it("should convert 32-char hex string to UUID format", () => {
    const hex = "f81d4fae7dec11d0a76500a0c91e6bf6";
    const uuid = hexToUuid(hex);
    expect(uuid).toBe("f81d4fae-7dec-11d0-a765-00a0c91e6bf6");
  });

  it("should convert UUID format back to 32-char hex", () => {
    const uuid = "f81d4fae-7dec-11d0-a765-00a0c91e6bf6";
    const hex = uuidToHex(uuid);
    expect(hex).toBe("f81d4fae7dec11d0a76500a0c91e6bf6");
  });

  it("should convert 16-char spanId to padded UUID format", () => {
    const spanId = "1234567890abcdef";
    const uuid = spanIdToUuid(spanId);
    expect(uuid).toBe("12345678-90ab-cdef-0000-000000000000");
  });
});

describe("InternalTracer execution", () => {
  it("should run operations inside a tracing context and buffer spans", async () => {
    const spansBuffer: SpansBuffer = {
      nodeStarts: [],
      nodeEnds: [],
      edgeStarts: [],
      edgeEnds: [],
    };

    const rootTraceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    const rootSpanId = "00f067aa0ba902b7";

    const context: ActiveSpanContext = {
      traceId: rootTraceId,
      spanId: rootSpanId,
      spansBuffer,
    };

    await InternalTracer.run(context, async () => {
      // 1st level nested span (child of rootSpanId)
      const result = await InternalTracer.trace("parent-op", async (childId1) => {
        expect(childId1).toHaveLength(16);
        
        // 2nd level nested span (child of childId1)
        const nestedResult = await InternalTracer.trace("child-op", async (childId2) => {
          expect(childId2).toHaveLength(16);
          expect(childId2).not.toBe(childId1);
          return "hello-nested";
        }, { type: "cpu", importanceLevel: 2 });

        expect(nestedResult).toBe("hello-nested");
        return "hello-parent";
      }, { type: "db", importanceLevel: 1 });

      expect(result).toBe("hello-parent");
    });

    // Verify spans buffered
    // We expect 2 nodes started (parent-op, child-op)
    expect(spansBuffer.nodeStarts).toHaveLength(2);
    expect(spansBuffer.nodeStarts[0].startMessage).toBe("parent-op");
    expect(spansBuffer.nodeStarts[0].nodeType).toBe("db");
    expect(spansBuffer.nodeStarts[0].importanceLevel).toBe(1);

    expect(spansBuffer.nodeStarts[1].startMessage).toBe("child-op");
    expect(spansBuffer.nodeStarts[1].nodeType).toBe("cpu");
    expect(spansBuffer.nodeStarts[1].importanceLevel).toBe(2);

    // We expect 2 parent-child relation edges created
    // 1. rootSpanId -> parent-op
    // 2. parent-op -> child-op
    expect(spansBuffer.edgeStarts).toHaveLength(2);
    expect(spansBuffer.edgeStarts[0].fromNodeId).toBe(spanIdToUuid(rootSpanId));
    expect(spansBuffer.edgeStarts[0].toNodeId).toBe(spansBuffer.nodeStarts[0].id);

    expect(spansBuffer.edgeStarts[1].fromNodeId).toBe(spansBuffer.nodeStarts[0].id);
    expect(spansBuffer.edgeStarts[1].toNodeId).toBe(spansBuffer.nodeStarts[1].id);

    // We expect both nodes to have ended successfully
    expect(spansBuffer.nodeEnds).toHaveLength(2);
    expect(spansBuffer.nodeEnds[0].status).toBe("success");
    expect(spansBuffer.nodeEnds[1].status).toBe("success");
  });

  it("should capture errors and mark span status as error", async () => {
    const spansBuffer: SpansBuffer = {
      nodeStarts: [],
      nodeEnds: [],
      edgeStarts: [],
      edgeEnds: [],
    };

    const context: ActiveSpanContext = {
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      spanId: "00f067aa0ba902b7",
      spansBuffer,
    };

    let errorThrown = false;
    try {
      await InternalTracer.run(context, async () => {
        await InternalTracer.trace("failing-op", async () => {
          throw new Error("Something went wrong");
        });
      });
    } catch (err) {
      errorThrown = true;
      expect((err as Error).message).toBe("Something went wrong");
    }

    expect(errorThrown).toBe(true);
    expect(spansBuffer.nodeStarts).toHaveLength(1);
    expect(spansBuffer.nodeEnds).toHaveLength(1);
    expect(spansBuffer.nodeEnds[0].status).toBe("error");
    expect(spansBuffer.nodeEnds[0].data.error).toBe("Something went wrong");
  });
});
