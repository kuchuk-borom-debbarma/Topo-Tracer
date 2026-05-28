import { Tracer } from "../src/index";
import { v4 as uuidv4 } from "uuid";

async function runExample() {
  // 1. Initialize the Tracer for this Node.js process (Container)
  Tracer.init(
    { baseUrl: "http://localhost:3000" },
    { name: "OrderService", containerType: "Node.js Process", id: "order-svc-1" }
  );

  console.log("Started Tracer for OrderService.");

  // 2. Start a trace when a request comes in
  const rootNode = Tracer.startTrace("POST /api/orders", "http_server_request");

  console.log(`Started Trace: ${rootNode.traceId}`);

  // Simulate some initial request processing time
  await new Promise(r => setTimeout(r, 10));
  rootNode.markProcessed();

  // 3. Create a child node for a database query
  const dbNode = rootNode.startChild("INSERT INTO orders", "database_query");
  
  // Simulate DB processing
  await new Promise(r => setTimeout(r, 20));
  dbNode.markProcessed();
  
  // Finish DB processing
  await new Promise(r => setTimeout(r, 5));
  dbNode.markCompleted({ rowsInserted: 1 });

  console.log("Database node completed.");

  // 4. Simulate a call to another service (PaymentService)
  // We record an egress edge to the external service
  const targetContainerId = "payment-svc-1";
  const targetNodeId = uuidv4(); // Usually provided by context propagation or determined later
  rootNode.recordEgressEdge(targetContainerId, targetNodeId, "http_client_request");

  // 5. Complete the root node
  rootNode.markCompleted({ status: 200, orderId: 123 });

  console.log("Root node completed.");

  // 6. Flush pending telemetry to the backend
  console.log("Flushing telemetry...");
  // Note: we catch since the backend might not be running locally right now
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
