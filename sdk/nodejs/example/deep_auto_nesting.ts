import { Tracer, Level } from "../src/index";

async function main() {
  console.log("=============================================================");
  console.log("   TOPO-TRACER V2: RUNNING DEEP AUTO-INCREMENT LEVEL TEST    ");
  console.log("=============================================================");

  Tracer.init({ baseUrl: "http://localhost:3000" });

  // 1. Level 10: Start trace
  const root = Tracer.startTrace("POST /api/v1/deep-process-depth-10", {
    level: Level.INFO
  });
  console.log("   Distributed Trace ID:", root.traceId);

  // Nest spans programmatically up to Level 10
  const activeSpans: any[] = [];
  let currentParent = root;

  console.log("   Nesting 10 levels automatically in a loop...");
  for (let level = 1; level <= 10; level++) {
    // Increase numeric level (less important stuff gets a higher number/lower severity)
    const spanLevel = 30 + (level * 2); 
    currentParent = currentParent.startSpan(`Auto-Nested Depth ${level}`, {
      level: spanLevel
    });
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
