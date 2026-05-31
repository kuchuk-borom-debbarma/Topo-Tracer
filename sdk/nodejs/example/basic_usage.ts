import { Tracer } from "../src/index";

async function runExample() {
  // 1. Initialize the Tracer for this microservice (with custom visual level names)
  Tracer.init(
    { baseUrl: "http://localhost:3000" },
    { 
      id: "order-svc-1",
      name: "OrderService", 
      type: "service", 
      levelNames: {
        0: "Infrastructure & Services",
        1: "Major Ingress Entries",
        2: "Business Transactions",
        3: "Database & Cache Operations"
      }
    }
  );

  console.log("Started V4 Tracer for OrderService.");

  // 2. Start a root boundary span (viewLevel = 0)
  const rootBoundary = Tracer.startBoundary("POST /api/orders");
  console.log(`Started Trace ID: ${rootBoundary.traceId}`);

  // 3. Start a major entry execution span (auto-assigned viewLevel = 1)
  const entryNode = rootBoundary.startSpan("Request Received", { type: "http_server" });
  
  // Simulate some initial request processing time
  await new Promise(r => setTimeout(r, 10));
  
  entryNode.end(); // Complete the entry node

  // 4. Start a nested child boundary span for database (auto-assigned viewLevel = 1)
  const dbBoundary = rootBoundary.startBoundary("DB Connection Pool", { type: "database" });
  
  // Start the actual SQL query execution span (auto-assigned viewLevel = 2)
  const dbQueryNode = dbBoundary.startSpan("INSERT INTO orders", { type: "sql_query" });
  
  // Simulate DB query execution
  await new Promise(r => setTimeout(r, 20));
  
  dbQueryNode.end(); // Complete query execution
  dbBoundary.end(); // Complete DB boundary scope
  console.log("Database boundary transaction completed.");

  // Draw an edge connection within our flow from request entry to the DB boundary
  entryNode.logEdge(dbBoundary.id, "database_transaction");

  // 5. Simulate a client HTTP call to another downstream service (PaymentService)
  const checkoutClientNode = rootBoundary.startSpan("Call PaymentService", { type: "http_client" });
  const paymentServiceId = "payment-svc-1"; // Target service boundary ID
  
  // Draw an edge from our client HTTP node to the payment service boundary
  checkoutClientNode.logEdge(paymentServiceId, "http_request");
  
  checkoutClientNode.end(); // Complete the client call node

  // 6. Complete the root service boundary scope
  rootBoundary.end();
  console.log("Root OrderService boundary completed.");

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
