import { Tracer } from "../src/index";

async function main() {
  console.log("=============================================================");
  console.log("   TOPO-TRACER V4: RUNNING DEEP AUTO-INCREMENT LEVEL TEST    ");
  console.log("=============================================================");

  // Initialize the Tracer with names for levels 0, 1, 2, 3 ONLY
  Tracer.init(
    { baseUrl: "http://localhost:3000" },
    { 
      id: "boundary-gateway-deep-10",
      name: "Super Deep Service Gateway", 
      type: "gateway",
      levelNames: {
        0: "Architecture Map",
        1: "API Controllers",
        2: "Business Procedures",
        3: "Internal SQL & Details"
      }
    }
  );

  // 1. Level 0: Start boundary
  const root = Tracer.startBoundary("POST /api/v1/deep-process-depth-10");
  console.log("   Distributed Trace ID:", root.traceId);

  // Nest spans programmatically up to Level 10
  const activeSpans: any[] = [];
  let currentParent = root;

  console.log("   Nesting 10 levels automatically in a loop...");
  for (let level = 1; level <= 10; level++) {
    const isNamed = level <= 3;
    const labelSuffix = isNamed ? "" : " (Unnamed)";
    currentParent = currentParent.startSpan(`Auto-Nested Level ${level}${labelSuffix}`);
    activeSpans.push(currentParent);
  }

  // Simulate execution work
  await new Promise(r => setTimeout(r, 30));

  // Close spans sequentially in reverse chronological stack order
  console.log("   Closing spans...");
  for (let i = activeSpans.length - 1; i >= 0; i--) {
    activeSpans[i].end();
  }
  
  root.end();

  // Commit and flush telemetry to ClickHouse
  await Tracer.flush();
  console.log("\nDeep auto-nested trace successfully flushed!");
  console.log(`Explore your new dynamic trace: http://localhost:5173/trace/${root.traceId}`);

  await Tracer.shutdown();
}

main().catch(console.error);
