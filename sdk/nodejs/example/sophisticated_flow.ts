import { Tracer, ContainerType, NodeType, EdgeType } from "../src/index";
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
  Tracer.init({ baseUrl: "http://localhost:3000" }, { name: "Order API Gateway", containerType: ContainerType.EXPRESS_API, id: orderSvcId });

  const rootNode = Tracer.startTrace("1. POST /v1/checkout", NodeType.HTTP_SERVER);
  console.log(`   [Service A] Started Trace: ${rootNode.traceId}`);
  await delay(15);
  rootNode.markProcessed();

  // 1. Linear Step 1: Validation
  const validationNode = rootNode.startChild("1.1 validateOrder()", NodeType.FUNCTION);
  validationNode.markProcessed();
  console.log(`   [Service A] Executing concurrent queries in validation...`);
  
  // Simulate database queue delay (scheduled 35ms ago)
  const userQueryScheduled = new Date(Date.now() - 35);
  const userQueryNode = validationNode.startChild("1.1.1 DB: Fetch User", NodeType.DATABASE, undefined, userQueryScheduled);
  const fraudScoreNode = validationNode.startChild("1.1.2 API: Fraud Check", NodeType.HTTP_CLIENT);
  
  await Promise.all([
    (async () => {
      userQueryNode.suspend(); // Waiting on DB connection pool
      await delay(15);
      userQueryNode.resume(); // Connection acquired, resuming!
      
      await delay(10);
      userQueryNode.markProcessed();
      
      // Simulate CPU-intensive deserialization and validation loop
      let count = 0;
      for (let i = 0; i < 4000000; i++) {
        count += (i * 3) % 2;
      }
      
      userQueryNode.markCompleted({ userId: 42, cpuResult: count });
    })(),
    (async () => {
      await delay(40);
      fraudScoreNode.markProcessed();
      fraudScoreNode.markCompleted({ score: 0.05 });
    })()
  ]);
  validationNode.markCompleted({ valid: true });

  // 2. Linear Step 2: Payment Processing
  const processPaymentNode = rootNode.startChild("1.2 processPayment()", NodeType.FUNCTION);
  processPaymentNode.markProcessed();
  
  const paymentClientNode = processPaymentNode.startChild("1.2.1 HTTP POST /payments/charge", NodeType.HTTP_CLIENT);
  await delay(5);
  paymentClientNode.markProcessed();
  
  const paymentIncomingNodeId = uuidv4(); 
  const paymentEdge = paymentClientNode.recordEgressEdge(paymentSvcId, paymentIncomingNodeId, EdgeType.HTTP_REQUEST);

  httpRequestHeaders = {
    "x-trace-id": rootNode.traceId,
    "x-parent-node-id": paymentClientNode.id,
    "x-target-node-id": paymentIncomingNodeId,
    "x-depth-index": paymentClientNode.depthIndex.toString(),
  };

  await delay(45); // Simulate downstream round-trip processing time
  paymentEdge.complete();
  
  paymentClientNode.markCompleted({ status: 500 }); // We'll simulate a failure downstream
  processPaymentNode.markCompleted({ status: "payment_failed_fallback" });

  // 3. Linear Step 3: Dispatch & Reporting
  const dispatchOrderNode = rootNode.startChild("1.3 dispatchOrder()", NodeType.FUNCTION);
  dispatchOrderNode.markProcessed();

  const eventPublisherNode = dispatchOrderNode.startChild("1.3.1 Kafka Produce: OrderCreated", NodeType.MESSAGE_PRODUCER);
  await delay(5);
  eventPublisherNode.markProcessed();

  const inventoryConsumerNodeId = uuidv4();
  const kafkaEdge = eventPublisherNode.recordEgressEdge(inventorySvcId, inventoryConsumerNodeId, EdgeType.KAFKA_MESSAGE);

  kafkaMessagePayload = {
    orderId: 999,
    _traceContext: {
      traceId: rootNode.traceId,
      parentNodeId: eventPublisherNode.id,
      targetNodeId: inventoryConsumerNodeId,
      depthIndex: eventPublisherNode.depthIndex
    }
  };

  await delay(12); // Simulate broker write latency
  kafkaEdge.complete();

  eventPublisherNode.markCompleted({ topic: "orders.events" });

  // 4. Send to Reporting Queue for Fan-out batching (Also nested under Dispatch)
  const reportingTargetNodeId = uuidv4();
  const sqsEdge = dispatchOrderNode.recordEgressEdge(reportSvcId, reportingTargetNodeId, EdgeType.SQS_MESSAGE);
  batchQueuePayloads.push({
    traceId: rootNode.traceId,
    parentNodeId: dispatchOrderNode.id,
    targetNodeId: reportingTargetNodeId,
    depthIndex: dispatchOrderNode.depthIndex
  });

  await delay(8); // Simulate queue delivery latency
  sqsEdge.complete();

  dispatchOrderNode.markCompleted({ dispatched: true });

  rootNode.markCompleted({ status: 200, message: "Checkout complete" });
  
  console.log("   [Service A] Flushing telemetry and shutting down...\n");
  try { await Tracer.flush(); } catch (e) {}
  await Tracer.shutdown();


  // =======================================================================
  // SERVICE B: Payment Service (Error Flow)
  // =======================================================================
  console.log("🔵 [Service B] Initializing Payment Service...");
  Tracer.init({ baseUrl: "http://localhost:3000" }, { name: "Payment Processing Service", containerType: ContainerType.GRPC_SERVICE, id: paymentSvcId });

  const bTraceId = httpRequestHeaders["x-trace-id"];
  const bParentId = httpRequestHeaders["x-parent-node-id"];
  const bDepth = parseInt(httpRequestHeaders["x-depth-index"], 10);
  
  const paymentRootNode = Tracer.continueTrace(
    bTraceId, bParentId, 
    "1.2.1.1 POST /payments/charge", NodeType.HTTP_SERVER, 
    bDepth, undefined, undefined,
    httpRequestHeaders["x-target-node-id"]  // overrideId — matches the egress edge destination
  );
  // No id mutation needed — _blockId is locked to x-target-node-id from construction

  console.log(`   [Service B] Continuing Trace: ${paymentRootNode.traceId}`);
  await delay(10);
  paymentRootNode.markProcessed();

  // 5. Error & Exception Flow
  const stripeNode = paymentRootNode.startChild("1.2.1.1.1 Stripe API Charge", NodeType.HTTP_CLIENT);
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
    const fallbackNode = paymentRootNode.startChild("1.2.1.1.2 Paypal API Fallback", NodeType.HTTP_CLIENT);
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
  Tracer.init({ baseUrl: "http://localhost:3000" }, { name: "Inventory Kafka Consumer", containerType: ContainerType.BACKGROUND_WORKER, id: inventorySvcId });

  const cTraceCtx = kafkaMessagePayload._traceContext;
  
  // Simulate Kafka consumer queue/broker wait lag (message scheduled 75ms ago)
  const kafkaScheduled = new Date(Date.now() - 75);
  const inventoryRootNode = Tracer.continueTrace(
    cTraceCtx.traceId, 
    cTraceCtx.parentNodeId, 
    "1.3.1.1 Consume Kafka: OrderCreated", 
    NodeType.MESSAGE_CONSUMER, 
    cTraceCtx.depthIndex, 
    undefined, 
    kafkaScheduled,
    cTraceCtx.targetNodeId  // overrideId — matches the egress edge destination
  );
  // No id mutation needed

  console.log(`   [Service C] Processing Event for Trace: ${inventoryRootNode.traceId}`);
  
  inventoryRootNode.suspend(); // Processing delayed, thread busy
  await delay(10);
  inventoryRootNode.resume();  // Consumer thread free, resume context!

  inventoryRootNode.markProcessed();

  // DEEP NESTING: processInventoryUpdate -> validateStock -> DB Check
  const processInventoryNode = inventoryRootNode.startChild("1.3.1.1.1 processInventoryUpdate()", NodeType.FUNCTION);
  await delay(2);
  processInventoryNode.markProcessed();

  const validateStockNode = processInventoryNode.startChild("1.3.1.1.1.1 validateStock()", NodeType.FUNCTION);
  const dbCheckNode = validateStockNode.startChild("1.3.1.1.1.1.1 DB: Check Current Stock", NodeType.DATABASE);
  await delay(10);
  dbCheckNode.markProcessed();
  
  // Simulate heavy database hash verification CPU loop
  let stockVerifyHash = 0;
  for (let i = 0; i < 5000000; i++) {
    stockVerifyHash += (i * 11) % 7;
  }

  dbCheckNode.markCompleted({ stock: 15, verifyCode: stockVerifyHash });
  validateStockNode.markProcessed();
  validateStockNode.markCompleted({ valid: true });

  const decrementNode = processInventoryNode.startChild("1.3.1.1.1.2 DB: Decrement Stock", NodeType.DATABASE);
  await delay(15);
  decrementNode.markProcessed();
  decrementNode.markCompleted({ item: "widget", newStock: 14 });

  // DEEP NESTING: calculateRestock -> Restock Logic & Kafka Produce
  const restockCheckNode = processInventoryNode.startChild("1.3.1.1.1.3 calculateRestock()", NodeType.FUNCTION);
  await delay(2);
  restockCheckNode.markProcessed();
  
  const restockDecisionNode = restockCheckNode.startChild("1.3.1.1.1.3.1 evaluateThreshold()", NodeType.FUNCTION);
  restockDecisionNode.markProcessed();
  restockDecisionNode.markCompleted({ threshold: 20, current: 14, needsRestock: true });
  
  const reorderEventNode = restockCheckNode.startChild("1.3.1.1.1.3.2 Kafka Produce: ReorderItem", NodeType.MESSAGE_PRODUCER);
  await delay(5);
  reorderEventNode.markProcessed();
  reorderEventNode.markCompleted({ topic: "inventory.reorder", quantity: 100 });
  
  restockCheckNode.markCompleted();
  processInventoryNode.markCompleted({ status: "success", logs: ["Inventory updated successfully"] });

  inventoryRootNode.markCompleted({ status: "consumed" });

  console.log("   [Service C] Flushing telemetry and shutting down...\n");
  try { await Tracer.flush(); } catch (e) {}
  await Tracer.shutdown();


  // =======================================================================
  // SERVICE D: Reporting Batch Processor (Fan-out / Batching)
  // =======================================================================
  console.log("🟣 [Service D] Initializing Batch Processor...");
  Tracer.init({ baseUrl: "http://localhost:3000" }, { name: "Nightly Batch Reporting", containerType: ContainerType.CRON_JOB, id: reportSvcId });

  // Add a fake extra payload to simulate a batch of multiple traces
  batchQueuePayloads.push({
    traceId: uuidv4(), // Different trace
    parentNodeId: uuidv4(),
    targetNodeId: uuidv4(),
    depthIndex: 0
  });

  console.log(`   [Service D] Polled queue, received batch of ${batchQueuePayloads.length} items.`);

  // 6. Fan-out / Batch Processing with extremely deep nesting
  const batchRootNode = Tracer.startTrace("4. Cron: Process Nightly Reports", NodeType.BATCH_JOB);
  batchRootNode.markProcessed();

  for (const item of batchQueuePayloads) {
    const itemNode = Tracer.continueTrace(
      item.traceId, item.parentNodeId, 
      "1.3.2 Process Report Item", NodeType.FUNCTION, 
      item.depthIndex, undefined, undefined,
      item.targetNodeId  // overrideId — matches the egress edge destination
    );
    // No id mutation needed
    
    await delay(5);
    itemNode.markProcessed();
    
    // DEEP NESTING: generatePdfReport -> render -> sanitize
    const generatePdfNode = itemNode.startChild("1.3.2.1 generatePdfReport()", NodeType.FUNCTION);
    generatePdfNode.markProcessed();
    
    const fetchTemplateNode = generatePdfNode.startChild("1.3.2.1.1 S3: Fetch Template", NodeType.HTTP_CLIENT);
    await delay(15);
    fetchTemplateNode.markProcessed();
    fetchTemplateNode.markCompleted({ bucket: "reports-templates" });

    const renderNode = generatePdfNode.startChild("1.3.2.1.2 renderTemplate()", NodeType.FUNCTION);
    renderNode.markProcessed();
    
    const sanitizeNode = renderNode.startChild("1.3.2.1.2.1 sanitizeData()", NodeType.FUNCTION);
    sanitizeNode.markProcessed();
    sanitizeNode.markCompleted({ sanitizedFields: 4 });
    
    renderNode.markCompleted({ status: "rendered" });
    generatePdfNode.markCompleted({ status: "success", fileSize: "45KB" });

    // DEEP NESTING: sendEmail -> SMTP
    const emailNode = itemNode.startChild("1.3.2.2 sendEmail()", NodeType.FUNCTION);
    emailNode.markProcessed();
    
    const smtpNode = emailNode.startChild("1.3.2.2.1 SMTP: Deliver", NodeType.HTTP_CLIENT);
    await delay(10);
    smtpNode.markProcessed();
    smtpNode.markCompleted({ delivered: true, recipient: "admin@example.com" });
    
    emailNode.markCompleted({ method: "smtp" });
    
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

