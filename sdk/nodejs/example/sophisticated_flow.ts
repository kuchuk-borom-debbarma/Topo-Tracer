import { Tracer } from "../src/index";
import { v4 as uuidv4 } from "uuid";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runSophisticatedSimulation() {
  console.log("=========================================");
  console.log("🚀 Starting Sophisticated Tracing Simulation");
  console.log("=========================================\n");

  const orderSvcId = "container-order-api";
  const paymentSvcId = "container-payment-svc";
  const inventorySvcId = "container-inventory-worker";
  const reportSvcId = "container-reporting-batch";

  // --- INTER-SERVICE PAYLOADS ---
  let httpRequestHeaders: any = {};
  let kafkaMessagePayload: any = {};
  let batchQueuePayloads: any[] = []; // Simulating a queue that a batch worker pulls from

  // =======================================================================
  // SERVICE A: Order API Gateway
  // =======================================================================
  console.log("🟢 [Service A] Initializing Order API Gateway...");
  Tracer.init({ baseUrl: "http://localhost:3000" }, { name: "Order API Gateway", containerType: "Express API", id: orderSvcId });

  const rootNode = Tracer.startTrace("POST /v1/checkout", "http_server");
  console.log(`   [Service A] Started Trace: ${rootNode.traceId}`);
  await delay(15);
  rootNode.markProcessed();

  // 1. Concurrent / Parallel Execution
  // We want to fetch the User Account and their Fraud Score simultaneously.
  console.log(`   [Service A] Executing concurrent queries...`);
  const userQueryNode = rootNode.startChild("DB: Fetch User", "database");
  const fraudScoreNode = rootNode.startChild("API: Fraud Check", "http_client");
  
  await Promise.all([
    (async () => {
      await delay(25);
      userQueryNode.markProcessed();
      userQueryNode.markCompleted({ userId: 42 });
    })(),
    (async () => {
      await delay(40);
      fraudScoreNode.markProcessed();
      fraudScoreNode.markCompleted({ score: 0.05 });
    })()
  ]);

  // 2. Remote HTTP Call to Payment Service
  const paymentClientNode = rootNode.startChild("HTTP POST /payments/charge", "http_client");
  await delay(5);
  paymentClientNode.markProcessed();
  
  const paymentIncomingNodeId = uuidv4(); 
  paymentClientNode.recordEgressEdge(paymentSvcId, paymentIncomingNodeId, "http_request");

  httpRequestHeaders = {
    "x-trace-id": rootNode.traceId,
    "x-parent-node-id": paymentClientNode.id,
    "x-target-node-id": paymentIncomingNodeId,
    "x-depth-index": paymentClientNode.depthIndex.toString(),
  };
  
  paymentClientNode.markCompleted({ status: 500 }); // We'll simulate a failure downstream

  // 3. Async Event Publishing to Inventory Service
  const eventPublisherNode = rootNode.startChild("Kafka Produce: OrderCreated", "message_producer");
  await delay(5);
  eventPublisherNode.markProcessed();

  const inventoryConsumerNodeId = uuidv4();
  eventPublisherNode.recordEgressEdge(inventorySvcId, inventoryConsumerNodeId, "kafka_message");

  kafkaMessagePayload = {
    orderId: 999,
    _traceContext: {
      traceId: rootNode.traceId,
      parentNodeId: eventPublisherNode.id,
      targetNodeId: inventoryConsumerNodeId,
      depthIndex: eventPublisherNode.depthIndex
    }
  };

  eventPublisherNode.markCompleted({ topic: "orders.events" });

  // 4. Send to Reporting Queue for Fan-out batching
  // We push this trace's context onto a simulated queue for a batch worker to pull later
  const reportingTargetNodeId = uuidv4();
  rootNode.recordEgressEdge(reportSvcId, reportingTargetNodeId, "sqs_message");
  batchQueuePayloads.push({
    traceId: rootNode.traceId,
    parentNodeId: rootNode.id, // Direct child of root for reporting
    targetNodeId: reportingTargetNodeId,
    depthIndex: rootNode.depthIndex
  });

  rootNode.markCompleted({ status: 200, message: "Checkout complete" });
  
  console.log("   [Service A] Flushing telemetry and shutting down...\n");
  try { await Tracer.flush(); } catch (e) {}
  await Tracer.shutdown();


  // =======================================================================
  // SERVICE B: Payment Service (Error Flow)
  // =======================================================================
  console.log("🔵 [Service B] Initializing Payment Service...");
  Tracer.init({ baseUrl: "http://localhost:3000" }, { name: "Payment Processing Service", containerType: "gRPC/HTTP Service", id: paymentSvcId });

  const bTraceId = httpRequestHeaders["x-trace-id"];
  const bParentId = httpRequestHeaders["x-parent-node-id"];
  const bDepth = parseInt(httpRequestHeaders["x-depth-index"], 10);
  
  const paymentRootNode = Tracer.continueTrace(bTraceId, bParentId, "POST /payments/charge", "http_server", bDepth);
  paymentRootNode.id = httpRequestHeaders["x-target-node-id"];

  console.log(`   [Service B] Continuing Trace: ${paymentRootNode.traceId}`);
  await delay(10);
  paymentRootNode.markProcessed();

  // 5. Error & Exception Flow
  const stripeNode = paymentRootNode.startChild("Stripe API Charge", "http_client");
  await delay(15);
  stripeNode.markProcessed();
  
  try {
    console.log("   [Service B] Simulating Stripe API Crash...");
    throw new Error("Stripe Gateway Timeout");
  } catch (err: any) {
    // Record the explicit failure
    stripeNode.markCompleted({ 
      error: true, 
      errorMessage: err.message, 
      stack: err.stack 
    });

    // Fallback/Retry flow
    const fallbackNode = paymentRootNode.startChild("Paypal API Fallback", "http_client");
    await delay(30);
    fallbackNode.markProcessed();
    fallbackNode.markCompleted({ success: true, gateway: "paypal" });
  }

  paymentRootNode.markCompleted({ chargedAmount: 150.00, warning: "Fell back to alternative gateway" });

  console.log("   [Service B] Flushing telemetry and shutting down...\n");
  try { await Tracer.flush(); } catch (e) {}
  await Tracer.shutdown();


  // =======================================================================
  // SERVICE C: Inventory Worker (Async Event Consumer)
  // =======================================================================
  console.log("🟠 [Service C] Initializing Inventory Worker...");
  Tracer.init({ baseUrl: "http://localhost:3000" }, { name: "Inventory Kafka Consumer", containerType: "Background Worker", id: inventorySvcId });

  const cTraceCtx = kafkaMessagePayload._traceContext;
  
  const inventoryRootNode = Tracer.continueTrace(cTraceCtx.traceId, cTraceCtx.parentNodeId, "Consume Kafka: OrderCreated", "message_consumer", cTraceCtx.depthIndex);
  inventoryRootNode.id = cTraceCtx.targetNodeId;

  console.log(`   [Service C] Processing Event for Trace: ${inventoryRootNode.traceId}`);
  await delay(15);
  inventoryRootNode.markProcessed();

  const inventoryDbNode = inventoryRootNode.startChild("DB: Decrement Stock", "database");
  await delay(25);
  inventoryDbNode.markProcessed();
  inventoryDbNode.markCompleted({ item: "widget", newStock: 42 });

  inventoryRootNode.markCompleted({ status: "consumed" });

  console.log("   [Service C] Flushing telemetry and shutting down...\n");
  try { await Tracer.flush(); } catch (e) {}
  await Tracer.shutdown();


  // =======================================================================
  // SERVICE D: Reporting Batch Processor (Fan-out / Batching)
  // =======================================================================
  console.log("🟣 [Service D] Initializing Batch Processor...");
  Tracer.init({ baseUrl: "http://localhost:3000" }, { name: "Nightly Batch Reporting", containerType: "Cron Job", id: reportSvcId });

  // Add a fake extra payload to simulate a batch of multiple traces
  batchQueuePayloads.push({
    traceId: uuidv4(), // Different trace
    parentNodeId: uuidv4(),
    targetNodeId: uuidv4(),
    depthIndex: 0
  });

  console.log(`   [Service D] Polled queue, received batch of ${batchQueuePayloads.length} items.`);

  // 6. Fan-out / Batch Processing
  // A single cron job iteration loops over many disparate trace contexts
  const batchRootNode = Tracer.startTrace("Cron: Process Nightly Reports", "batch_job");
  batchRootNode.markProcessed();

  for (const item of batchQueuePayloads) {
    // For each item, we continue its specific distributed trace
    const itemNode = Tracer.continueTrace(item.traceId, item.parentNodeId, "Process Report Item", "function", item.depthIndex);
    itemNode.id = item.targetNodeId; // Match edge if provided
    
    await delay(10);
    itemNode.markProcessed();
    
    // We can link the trace back to the batch runner using metadata or custom edges if desired.
    itemNode.markCompleted({ batchJobTraceId: batchRootNode.traceId });
  }

  batchRootNode.markCompleted({ processedCount: batchQueuePayloads.length });

  console.log("   [Service D] Flushing telemetry and shutting down...\n");
  try { await Tracer.flush(); } catch (e) {}
  await Tracer.shutdown();

  console.log("=========================================");
  console.log("✅ Simulation Complete");
  console.log("=========================================");
}

runSophisticatedSimulation().catch(console.error);
