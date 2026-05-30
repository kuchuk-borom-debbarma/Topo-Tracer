import { Tracer } from "../src/index";

async function runExample() {
  // 1. Initialize the Tracer for this Node.js process (Container)
  Tracer.init(
    { baseUrl: "http://localhost:3000" },
    { name: "OrderService", type: "Node.js Process", id: "order-svc-1" }
  );

  console.log("Started Tracer for OrderService.");

  // 2. Start a root container trace when a request comes in
  const orderContainer = Tracer.startContainer("POST /api/orders", ["order_tag"]);
  const rootNodeId = orderContainer.logNode("Request Received", ["init"]);

  console.log(`Started Trace: ${orderContainer.traceId}`);

  // Simulate some initial request processing time
  await new Promise(r => setTimeout(r, 10));

  // 3. Create a nested child container for database processing
  const dbContainer = orderContainer.startChildContainer("DB: Insert Order", ["db"]);
  const dbNodeId = dbContainer.logNode("INSERT INTO orders", ["query"]);
  
  // Simulate DB processing
  await new Promise(r => setTimeout(r, 20));
  
  dbContainer.complete();
  console.log("Database container completed.");

  // Draw an edge within our flow from root node to the DB container
  orderContainer.logEdge(rootNodeId, dbContainer.id, "container", "database_transaction");

  // 4. Simulate a call to another service (PaymentService)
  const checkoutClientNodeId = orderContainer.logNode("Call PaymentService", ["network"]);
  const targetContainerId = "payment-svc-1";
  
  // Draw edge from caller node to payment service container
  orderContainer.logEdge(checkoutClientNodeId, targetContainerId, "container", "http_request");

  // 5. Complete the root container
  orderContainer.complete();
  console.log("Root container completed.");

  // 6. Flush pending telemetry to the backend
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
