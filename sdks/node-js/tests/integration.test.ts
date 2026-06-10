import { expect, test, describe } from "bun:test";
import { Tracer } from "../src/Tracer";

describe("SDK Integration", () => {
  test("Should send ingestion events to the server with manual flush", async () => {
    const receivedPayloads: any[] = [];
    
    const server = Bun.serve({
      port: 3333,
      async fetch(req) {
        if (req.method === "POST" && new URL(req.url).pathname === "/api/v1/ingest") {
          const body = await req.json();
          receivedPayloads.push(body);
          return Response.json({ success: true });
        }
        return new Response("Not Found", { status: 404 });
      },
    });

    const tracer = new Tracer({
      endpoint: "http://localhost:3333",
      apiKey: "test-api-key",
      userId: "test-user-id",
      batchSize: 10, // High enough to avoid auto-flush
      flushInterval: 0, // Disable auto-flush
    });

    const rootSpan = tracer.startNode({ name: "Root Operation", type: "root" });
    rootSpan.end("Done with root");

    // Events should be in buffer, not sent yet
    expect(receivedPayloads.length).toBe(0);

    await tracer.flush();

    server.stop();

    // Verify received payloads
    expect(receivedPayloads.length).toBe(1);
    expect(receivedPayloads[0].nodeStarts.length).toBe(1);
    expect(receivedPayloads[0].nodeEnds.length).toBe(1);
  });

  test("Should support distributed tracing via parentSpanId", async () => {
    const receivedPayloads: any[] = [];
    
    const server = Bun.serve({
      port: 3334,
      async fetch(req) {
        if (req.method === "POST" && new URL(req.url).pathname === "/api/v1/ingest") {
          const body = await req.json();
          receivedPayloads.push(body);
          return Response.json({ success: true });
        }
        return new Response("Not Found", { status: 404 });
      },
    });

    const tracer = new Tracer({
      endpoint: "http://localhost:3334",
      apiKey: "test-api-key",
      userId: "test-user-id",
    });

    const externalTraceId = "external-trace-id";
    const externalSpanId = "external-span-id";

    const span = tracer.startNode({ 
        name: "Remote Child", 
        traceId: externalTraceId, 
        parentSpanId: externalSpanId 
    });
    span.end();

    await tracer.flush();
    server.stop();

    expect(receivedPayloads.length).toBe(1);
    const payload = receivedPayloads[0];
    expect(payload.nodeStarts[0].traceId).toBe(externalTraceId);
    expect(payload.edgeStarts[0].fromNodeId).toBe(externalSpanId);
    expect(payload.edgeStarts[0].toNodeId).toBe(payload.nodeStarts[0].id);
  });

  test("Should support context extraction and injection", async () => {
    const tracer = new Tracer({
      endpoint: "http://localhost:3335",
      apiKey: "test-api-key",
      userId: "test-user-id",
    });

    const rootSpan = tracer.startNode({ name: "Root" });
    
    tracer.run(rootSpan, () => {
        const context = tracer.extractContext();
        expect(context.traceId).toBe(rootSpan.traceId);
        expect(context.spanId).toBe(rootSpan.id);

        const injectedSpan = tracer.injectContext({ traceId: "t1", spanId: "s1" });
        tracer.run(injectedSpan, () => {
            const innerContext = tracer.extractContext();
            expect(innerContext.traceId).toBe("t1");
            expect(innerContext.spanId).toBe("s1");
        });
    });
  });

  test("Should handle buffer overflow and onDrop callback", async () => {
    let droppedData: any = null;
    const tracer = new Tracer({
      endpoint: "http://localhost:3336",
      apiKey: "test-api-key",
      userId: "test-user-id",
      batchSize: 2000,
      onDrop: (err, data) => {
          droppedData = data;
      }
    });

    // HARD_BATCH_CAP is 1000. 1001 nodes * (1 nodeStart) = 1001 events.
    for (let i = 0; i < 1001; i++) {
        tracer.startNode({ name: `Node ${i}` });
    }

    expect(droppedData).not.toBeNull();
    expect(droppedData.nodeStarts.length).toBe(1);
  });
});
