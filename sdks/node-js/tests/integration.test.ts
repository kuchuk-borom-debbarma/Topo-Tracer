import { expect, test, describe, afterEach, beforeEach } from "bun:test";
import { Tracer, NodeType, Importance } from "../src";

describe("SDK Integration", () => {
  let originalFetch = global.fetch;

  beforeEach(() => {
    // @ts-ignore
    globalThis.fetch = (async () => new Response(JSON.stringify({ success: true }), { status: 200 })) as any;
  });

  afterEach(() => {
    // @ts-ignore
    globalThis.fetch = originalFetch as any;
  });

  test("Should send ingestion events to the server with manual flush", async () => {
    const receivedPayloads: any[] = [];
    
    // @ts-ignore
    global.fetch = async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      receivedPayloads.push(body);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };

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

    // Verify received payloads
    expect(receivedPayloads.length).toBe(1);
    expect(receivedPayloads[0].nodeStarts.length).toBe(1);
    expect(receivedPayloads[0].nodeEnds.length).toBe(1);
  });

  test("Should support distributed tracing via parentSpanId", async () => {
    const receivedPayloads: any[] = [];
    
    // @ts-ignore
    global.fetch = async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      receivedPayloads.push(body);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };

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

  test("Should auto-flush under buffer pressure instead of dropping events", async () => {
    const receivedPayloads: any[] = [];
    let droppedData: any = null;

    // @ts-ignore
    global.fetch = async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      receivedPayloads.push(body);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };

    const tracer = new Tracer({
      endpoint: "http://localhost:3336",
      apiKey: "test-api-key",
      userId: "test-user-id",
      batchSize: 2000,
      flushInterval: 0,
      onDrop: (data, reason) => {
        droppedData = data;
      }
    });

    // HARD_BATCH_CAP is 1000. Crossing it should force a drain, not drop.
    for (let i = 0; i < 1001; i++) {
        tracer.startNode({ name: `Node ${i}` });
    }

    await tracer.flush();

    const totalNodeStarts = receivedPayloads.reduce(
      (total, payload) => total + payload.nodeStarts.length,
      0,
    );

    expect(droppedData).toBeNull();
    expect(totalNodeStarts).toBe(1001);
  });

  test("Should support trace name and importance labels on TraceStart but ignore on child spans", async () => {
    const receivedPayloads: any[] = [];
    
    // @ts-ignore
    global.fetch = async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      receivedPayloads.push(body);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };

    const tracer = new Tracer({
      endpoint: "http://localhost:3337",
      apiKey: "test-api-key",
      userId: "test-user-id",
    });

    await tracer.trace("Root Op", async (root) => {
        await tracer.trace("Child Op", async (child) => {
            // Child trace name should be ignored
        }, { traceName: "Child Name" });
    }, { traceName: "My Real Trace Name", importanceLabels: { 0: "Database" } });

    await tracer.flush();

    expect(receivedPayloads.length).toBe(1);
    const payload = receivedPayloads[0];
    
    // TraceStart should have name and labels
    expect(payload.traceStarts.length).toBe(1);
    expect(payload.traceStarts[0].name).toBe("My Real Trace Name");
    expect(payload.traceStarts[0].importanceLabels).toEqual({ 0: "Database" });

    // Root node should NOT have traceName (D-24)
    const rootStart = payload.nodeStarts.find((n: any) => n.startMessage === "Root Op");
    expect(rootStart.traceName).toBeUndefined();

    // Child node should NOT have traceName
    const childStart = payload.nodeStarts.find((n: any) => n.startMessage === "Child Op");
    expect(childStart.traceName).toBeUndefined();
  });

  test("Should maintain backward compatibility for trace(name, fn)", async () => {
    const receivedPayloads: any[] = [];
    
    // @ts-ignore
    global.fetch = async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      receivedPayloads.push(body);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };

    const tracer = new Tracer({
      endpoint: "http://localhost:3338",
      apiKey: "test-api-key",
      userId: "test-user-id",
    });

    await tracer.trace("Old Style", async (span) => {});

    await tracer.flush();

    expect(receivedPayloads.length).toBe(1);
    const payload = receivedPayloads[0];
    expect(payload.nodeStarts[0].startMessage).toBe("Old Style");
    expect(payload.nodeStarts[0].traceName).toBeUndefined();
  });

  test("Should allow API-key-only ingestion without X-User-Id header", async () => {
    const receivedHeaders: Record<string, string> = {};

    global.fetch = async (_url: string, init: any) => {
      const headers = new Headers(init.headers);
      receivedHeaders["x-api-key"] = headers.get("X-API-Key") ?? "";
      receivedHeaders["x-user-id"] = headers.get("X-User-Id") ?? "";
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };

    const tracer = new Tracer({
      endpoint: "http://localhost:4444",
      apiKey: "api-key-only",
      batchSize: 10,
      flushInterval: 0,
    });

    await tracer.trace("API key only trace", async () => {
      return;
    });
    await tracer.flush();

    expect(receivedHeaders["x-api-key"]).toBe("api-key-only");
    expect(receivedHeaders["x-user-id"]).toBe("");
  });

  test("Should support NodeType and Importance enums and custom mappings config", async () => {
    const receivedPayloads: any[] = [];
    
    // @ts-ignore
    global.fetch = async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      receivedPayloads.push(body);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };

    const tracer = new Tracer({
      endpoint: "http://localhost:5555",
      apiKey: "test-api-key",
      userId: "test-user-id",
      nodeTypeImportanceMapping: {
        "custom-node": 3,
      },
    });

    await tracer.trace("Controller Op", async () => {
      await tracer.trace("DB Op", async () => {
        await tracer.trace("Custom Op", async () => {
          await tracer.trace("Critical Custom Op", async () => {}, { 
            type: "custom-node", 
            importanceLevel: Importance.CRITICAL 
          });
        }, { type: "custom-node" });
      }, { type: NodeType.DB_CALL });
    }, { type: NodeType.CONTROLLER });

    await tracer.flush();

    expect(receivedPayloads.length).toBe(1);
    const payload = receivedPayloads[0];

    const controllerSpan = payload.nodeStarts.find((n: any) => n.startMessage === "Controller Op");
    expect(controllerSpan.importanceLevel).toBe(0); // Mapped controller type -> 0

    const dbSpan = payload.nodeStarts.find((n: any) => n.startMessage === "DB Op");
    expect(dbSpan.importanceLevel).toBe(0); // Mapped db-call type -> 0

    const customSpan = payload.nodeStarts.find((n: any) => n.startMessage === "Custom Op");
    expect(customSpan.importanceLevel).toBe(3); // Configured custom-node mapping -> 3

    const criticalCustomSpan = payload.nodeStarts.find((n: any) => n.startMessage === "Critical Custom Op");
    expect(criticalCustomSpan.importanceLevel).toBe(0); // Explicit Importance.CRITICAL override -> 0
  });

  test("Should resolve sequential sibling chaining through deepest descendant", async () => {
    const receivedPayloads: any[] = [];
    
    // @ts-ignore
    global.fetch = async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      receivedPayloads.push(body);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };

    const tracer = new Tracer({
      endpoint: "http://localhost:6666",
      apiKey: "test-api-key",
      userId: "test-user-id",
    });

    await tracer.trace("P", async () => {
      await tracer.trace("S1", async () => {
        await tracer.trace("S1.1", async () => {});
        await tracer.trace("S1.2", async () => {});
      });
      await tracer.trace("S2", async () => {});
    });

    await tracer.flush();

    expect(receivedPayloads.length).toBe(1);
    const payload = receivedPayloads[0];

    const s1 = payload.nodeStarts.find((n: any) => n.startMessage === "S1");
    const s1_1 = payload.nodeStarts.find((n: any) => n.startMessage === "S1.1");
    const s1_2 = payload.nodeStarts.find((n: any) => n.startMessage === "S1.2");
    const s2 = payload.nodeStarts.find((n: any) => n.startMessage === "S2");

    const edge1 = payload.edgeStarts.find((e: any) => e.toNodeId === s1_1.id);
    expect(edge1.fromNodeId).toBe(s1.id);

    const edge2 = payload.edgeStarts.find((e: any) => e.toNodeId === s1_2.id);
    expect(edge2.fromNodeId).toBe(s1_1.id);

    const edge3 = payload.edgeStarts.find((e: any) => e.toNodeId === s2.id);
    expect(edge3.fromNodeId).toBe(s1_2.id);
  });

  test("Should execute log and trace hooks synchronously", async () => {
    let logHookCount = 0;
    let spanStartCount = 0;
    let spanEndCount = 0;

    const tracer = new Tracer({
      endpoint: "http://localhost:3339",
      apiKey: "test-api-key",
      userId: "test-user-id",
      logHooks: [
        (msg, data, level) => {
          logHookCount++;
          expect(msg).toBe("test-log");
          expect(data).toEqual({ key: "val" });
          expect(level).toBe(1);
        }
      ],
      traceHooks: [
        {
          onSpanStart: (span) => {
            spanStartCount++;
            if (span.toNodeStart().startMessage === "test-span") {
              span.setAttribute("hook-key", "hook-val");
            }
          },
          onSpanEnd: (span) => {
            spanEndCount++;
            if (span.toNodeStart().startMessage === "test-span") {
              expect(span.toNodeStart().data["hook-key"]).toBe("hook-val");
            }
          }
        }
      ]
    });

    await tracer.trace("test-span", async () => {
      tracer.log("test-log", { key: "val" }, 1);
    });

    expect(logHookCount).toBe(1);
    expect(spanStartCount).toBe(2);
    expect(spanEndCount).toBe(2);
  });

  test("Should handle network ingestion errors gracefully without crashing when ignoreFailures is true", async () => {
    // @ts-ignore
    global.fetch = async () => {
      throw new Error("Network offline");
    };

    const tracer = new Tracer({
      endpoint: "http://localhost:3340",
      apiKey: "test-api-key",
      userId: "test-user-id",
      maxRetries: 1,
      retryDelay: 1,
      ignoreFailures: true,
    });

    tracer.startNode({ name: "fail-node" }).end();

    await tracer.flush();
  });

  test("Should propagate network ingestion errors if ignoreFailures is false", async () => {
    // @ts-ignore
    global.fetch = async () => {
      throw new Error("Network offline");
    };

    const tracer = new Tracer({
      endpoint: "http://localhost:3341",
      apiKey: "test-api-key",
      userId: "test-user-id",
      maxRetries: 1,
      retryDelay: 1,
      ignoreFailures: false,
    });

    tracer.startNode({ name: "fail-node" }).end();

    await expect(tracer.flush()).rejects.toThrow("Network offline");
  });
});
