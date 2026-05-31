import { Tracer, Level } from "../src/index";

async function runExample() {
  // 1. Initialize the Tracer for this microservice
  Tracer.init({ baseUrl: "http://localhost:3000" });

  console.log("Started V2 Tracer for OrderService.");

  // 2. Start a root trace (Level: INFO by default)
  const rootSpan = Tracer.startTrace("POST /api/orders");
  console.log(`Started Trace ID: ${rootSpan.traceId}`);

  // 3. Start a nested child span for processing (Level: DEBUG)
  const processSpan = rootSpan.startSpan("Request Received", { 
    level: Level.DEBUG,
    tags: { type: "http_server" } 
  });
  
  // Simulate some initial request processing time
  await new Promise(r => setTimeout(r, 10));
  
  processSpan.end(); // Complete the entry node

  // 4. Start a nested span for database operations
  // We don't specify groupName, so it defaults to "INSERT INTO orders"
  const dbQueryNode = rootSpan.startSpan("INSERT INTO orders", { 
    level: Level.INFO,
    tags: { type: "sql_query" } 
  });
  
  // Simulate DB query execution
  await new Promise(r => setTimeout(r, 20));
  
  dbQueryNode.end(); // Complete query execution
  console.log("Database transaction completed.");

  // 5. Simulate a client HTTP call to another downstream service
  const checkoutClientNode = rootSpan.startSpan("Call PaymentService", { 
    level: Level.INFO,
    tags: { type: "http_client" } 
  });
  
  // The downstream service context headers could be generated here:
  const headers = checkoutClientNode.createCarrierHeaders();
  console.log(`Propagating headers to downstream service:`, headers);
  
  checkoutClientNode.end(); // Complete the client call node

  // 6. Complete the root trace span scope
  rootSpan.end();
  console.log("Root OrderService trace completed.");

  // 7. Flush pending telemetry to the backend
  console.log("Flushing telemetry...");
  try {
    await Tracer.flush();
    console.log("Telemetry flushed successfully.");
  } catch (error: any) {
    console.log("Telemetry flush failed (expected if backend is not running):", error.message);
  }

  // Stop background intervals
  await Tracer.shutdown();
}

runExample().catch(console.error);
