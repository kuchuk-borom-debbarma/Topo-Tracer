import { Tracer, ContainerType, NodeType, EdgeType } from "../src/index";
import { v4 as uuidv4 } from "uuid";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runSophisticatedSimulation() {
  console.log("=========================================");
  console.log("🚀 Starting V3 Sophisticated Simulation");
  console.log("   (Containers = Functions, Nodes = Logs)");
  console.log("=========================================\n");

  const orderSvcId = "container-order-api";
  const paymentSvcId = "container-payment-svc";
  const inventorySvcId = "container-inventory-worker";
  const reportSvcId = "container-reporting-batch";

  // --- INTER-SERVICE PAYLOADS ---
  let httpRequestHeaders: any = {};
  let kafkaMessagePayload: any = {};
  let batchQueuePayloads: any[] = []; 

  // =======================================================================
  // SERVICE A: Order API Gateway
  // =======================================================================
  console.log("🟢 [Service A] Initializing Order API Gateway...");
  Tracer.init(
    { baseUrl: "http://localhost:3000" }, 
    { name: "Order API Gateway", containerType: ContainerType.EXPRESS_API, id: orderSvcId }
  );

  // Root container representing the ingress gateway service scope
  const gatewayContainer = Tracer.startContainer("1. POST /v1/checkout", ["service", "checkout"]);
  console.log(`   [Service A] Started Trace: ${gatewayContainer.traceId}`);
  
  await delay(15);
  gatewayContainer.logNode("Gateway received request", ["checkout", "gateway"]);

  // 1. Nested Function Call: validateOrder() [Sub-Container - will get auto tag internal_function_depth_1]
  const validateTx = gatewayContainer.startChildContainer("1.1 validateOrder()", ["checkout"]);
  validateTx.logNode("Validation started", ["checkout"]);

  // Fetch User DB Query [Node - log event]
  const dbFetchNodeId = validateTx.logNode("1.1.1 DB: Fetch User", ["database", "read"]);
  await delay(15);

  // Fraud check API Call [Node - log event]
  const fraudCheckNodeId = validateTx.logNode("1.1.2 API: Fraud Check", ["network"]);
  await delay(25);

  validateTx.logNode("Validation succeeded", ["checkout"]);
  validateTx.complete();

  // 2. Nested Function Call: processPayment() [Sub-Container - depth 1]
  const processPaymentTx = gatewayContainer.startChildContainer("1.2 processPayment()", ["checkout"]);
  processPaymentTx.logNode("Payment flow started", ["checkout"]);

  // HTTP Gateway Client Request [Node - log event]
  const paymentClientNodeId = processPaymentTx.logNode("1.2.1 HTTP POST /payments/charge", ["network"]);
  await delay(5);

  const paymentIncomingNodeId = uuidv4();
  
  // Register network egress crossing from caller node to payment incoming node
  processPaymentTx.logEdge(paymentClientNodeId, paymentIncomingNodeId, EdgeType.HTTP_REQUEST);

  httpRequestHeaders = {
    "x-trace-id": gatewayContainer.traceId,
    "x-parent-node-id": paymentClientNodeId,
    "x-target-node-id": paymentIncomingNodeId,
    "x-depth-index": processPaymentTx.depthIndex.toString(),
  };

  await delay(45); // Downstream processing time
  processPaymentTx.logNode("Payment failed fallback triggered", ["checkout", "payment_failure"]);
  processPaymentTx.complete();

  // 3. Nested Function Call: dispatchOrder() [Sub-Container - depth 1]
  const dispatchOrderTx = gatewayContainer.startChildContainer("1.3 dispatchOrder()", ["checkout"]);
  dispatchOrderTx.logNode("Dispatch flow started", ["checkout"]);

  // Kafka Produce event [Node - log event]
  const kafkaProduceNodeId = dispatchOrderTx.logNode("1.3.1 Kafka Produce: OrderCreated", ["pub_sub", "network"]);
  await delay(5);

  const inventoryConsumerNodeId = uuidv4();
  dispatchOrderTx.logEdge(kafkaProduceNodeId, inventoryConsumerNodeId, EdgeType.KAFKA_MESSAGE);

  kafkaMessagePayload = {
    orderId: 999,
    _traceContext: {
      traceId: gatewayContainer.traceId,
      parentNodeId: kafkaProduceNodeId,
      targetNodeId: inventoryConsumerNodeId,
      depthIndex: dispatchOrderTx.depthIndex
    }
  };

  await delay(12);

  // 4. nested Queue dispatch to Reporting Chron batch [Sub-Container - depth 1]
  const sqsProduceNodeId = dispatchOrderTx.logNode("1.3.2 SQS Produce: Nightly Batch Queue", ["pub_sub", "network"]);
  const reportingTargetNodeId = uuidv4();
  dispatchOrderTx.logEdge(sqsProduceNodeId, reportingTargetNodeId, EdgeType.SQS_MESSAGE);

  batchQueuePayloads.push({
    traceId: gatewayContainer.traceId,
    parentNodeId: sqsProduceNodeId,
    targetNodeId: reportingTargetNodeId,
    depthIndex: dispatchOrderTx.depthIndex
  });

  await delay(8);
  dispatchOrderTx.complete();

  gatewayContainer.logNode("Gateway completed response", ["checkout", "gateway"]);
  gatewayContainer.complete();

  console.log("   [Service A] Flushing telemetry and shutting down...\n");
  try { await Tracer.flush(); } catch (e) {}
  await Tracer.shutdown();


  // =======================================================================
  // SERVICE B: Payment Service (Error / Fallback Flow)
  // =======================================================================
  console.log("🔵 [Service B] Initializing Payment Service...");
  Tracer.init(
    { baseUrl: "http://localhost:3000" }, 
    { name: "Payment Processing Service", containerType: ContainerType.GRPC_SERVICE, id: paymentSvcId }
  );

  const bTraceId = httpRequestHeaders["x-trace-id"];
  const bParentId = httpRequestHeaders["x-parent-node-id"];
  const bDepth = parseInt(httpRequestHeaders["x-depth-index"], 10);
  
  // Continue trace as payment root container
  const paymentRootContainer = Tracer.continueTrace(
    bTraceId, bParentId, 
    "1.2.1.1 POST /payments/charge", NodeType.HTTP_SERVER, 
    bDepth, undefined, undefined,
    httpRequestHeaders["x-target-node-id"]
  );

  console.log(`   [Service B] Continuing Trace: ${paymentRootContainer.traceId}`);
  await delay(10);
  paymentRootContainer.logNode("Payment service request accepted", ["payment"]);

  // 5. Nested Function Call: stripeCharge() [Sub-Container - depth 1]
  const stripeTx = paymentRootContainer.startChildContainer("1.2.1.1.1 stripeCharge()", ["payment", "stripe"]);
  
  // Stripe API HTTP call [Node - log event]
  const stripeApiNodeId = stripeTx.logNode("HTTP POST api.stripe.com/v3/charges", ["network", "stripe"]);
  await delay(15);
  
  try {
    console.log("   [Service B] Simulating Stripe API Crash...");
    throw new Error("Stripe Gateway Timeout");
  } catch (err: any) {
    stripeTx.logNode("Stripe API charge failed", ["stripe", "error"], { message: err.message });
    stripeTx.complete();

    // 6. Nested Fallback Function Call: paypalFallback() [Sub-Container - depth 1]
    const paypalTx = paymentRootContainer.startChildContainer("1.2.1.1.2 paypalFallback()", ["payment", "paypal"]);
    
    // Paypal API HTTP call [Node - log event]
    paypalTx.logNode("HTTP POST api.paypal.com/v1/payments", ["network", "paypal"]);
    await delay(30);

    paypalTx.logNode("Paypal fallback succeeded", ["paypal", "success"]);
    paypalTx.complete();
  }

  paymentRootContainer.logNode("Payment charge finished", ["payment"]);
  paymentRootContainer.complete();

  console.log("   [Service B] Flushing telemetry and shutting down...\n");
  try { await Tracer.flush(); } catch (e) {}
  await Tracer.shutdown();


  // =======================================================================
  // SERVICE C: Inventory Worker (Async Event Consumer)
  // =======================================================================
  console.log("🟠 [Service C] Initializing Inventory Worker...");
  Tracer.init(
    { baseUrl: "http://localhost:3000" }, 
    { name: "Inventory Kafka Consumer", containerType: ContainerType.BACKGROUND_WORKER, id: inventorySvcId }
  );

  const cTraceCtx = kafkaMessagePayload._traceContext;
  const kafkaScheduled = new Date(Date.now() - 75);

  const inventoryRootContainer = Tracer.continueTrace(
    cTraceCtx.traceId, 
    cTraceCtx.parentNodeId, 
    "1.3.1.1 Consume Kafka: OrderCreated", 
    NodeType.MESSAGE_CONSUMER, 
    cTraceCtx.depthIndex, 
    undefined, 
    kafkaScheduled,
    cTraceCtx.targetNodeId
  );

  console.log(`   [Service C] Processing Event for Trace: ${inventoryRootContainer.traceId}`);
  await delay(10);
  inventoryRootContainer.logNode("Kafka event consumed", ["inventory", "pub_sub"]);

  // 7. Nested Function Call: processInventoryUpdate() [Sub-Container - depth 1]
  const processInvTx = inventoryRootContainer.startChildContainer("1.3.1.1.1 processInventoryUpdate()", ["inventory"]);
  
  // 8. Deeply Nested Function Call: validateStock() [Sub-Container - depth 2 -> auto tag internal_function_depth_2]
  const validateStockTx = processInvTx.startChildContainer("1.3.1.1.1.1 validateStock()", ["inventory"]);

  // 9. Extra Deeply Nested Function Call: dbCheckStock() [Sub-Container - depth 3 -> auto tag internal_function_depth_3]
  const dbCheckStockTx = validateStockTx.startChildContainer("1.3.1.1.1.1.1 dbCheckStock()", ["inventory"]);
  
  // Database Select Query [Node - log event]
  dbCheckStockTx.logNode("DB: SELECT stock FROM inventory WHERE item = 999", ["database", "read"]);
  await delay(10);
  dbCheckStockTx.complete();

  validateStockTx.logNode("Stock validation passed", ["inventory"]);
  validateStockTx.complete();

  // 10. Nested Function Call: decrementStock() [Sub-Container - depth 2]
  const decrementStockTx = processInvTx.startChildContainer("1.3.1.1.1.2 decrementStock()", ["inventory"]);
  
  // Database Update Query [Node - log event]
  decrementStockTx.logNode("DB: UPDATE inventory SET stock = stock - 1 WHERE item = 999", ["database", "write"]);
  await delay(15);
  decrementStockTx.complete();

  // 11. Nested Function Call: calculateRestock() [Sub-Container - depth 2]
  const calculateRestockTx = processInvTx.startChildContainer("1.3.1.1.1.3 calculateRestock()", ["inventory"]);
  
  // 12. Deeply Nested Function Call: evaluateThreshold() [Sub-Container - depth 3]
  const evaluateThresholdTx = calculateRestockTx.startChildContainer("1.3.1.1.1.3.1 evaluateThreshold()", ["inventory"]);
  evaluateThresholdTx.logNode("Compare stock level against warning threshold (20)", ["logic"]);
  await delay(2);
  evaluateThresholdTx.complete();

  // 13. Deeply Nested Function Call: reorderItem() [Sub-Container - depth 3]
  const reorderItemTx = calculateRestockTx.startChildContainer("1.3.1.1.1.3.2 reorderItem()", ["inventory"]);
  
  // Kafka Reorder Produce [Node - log event]
  reorderItemTx.logNode("Kafka Produce: ReorderItem", ["pub_sub", "network"]);
  await delay(5);
  reorderItemTx.complete();

  calculateRestockTx.complete();
  processInvTx.complete();
  
  inventoryRootContainer.logNode("Inventory processing finished", ["inventory"]);
  inventoryRootContainer.complete();

  console.log("   [Service C] Flushing telemetry and shutting down...\n");
  try { await Tracer.flush(); } catch (e) {}
  await Tracer.shutdown();


  // =======================================================================
  // SERVICE D: Reporting Batch Processor (Cron / Fan-out)
  // =======================================================================
  console.log("🟣 [Service D] Initializing Batch Processor...");
  Tracer.init(
    { baseUrl: "http://localhost:3000" }, 
    { name: "Nightly Batch Reporting", containerType: ContainerType.CRON_JOB, id: reportSvcId }
  );

  // Add dummy queue item for batching
  batchQueuePayloads.push({
    traceId: uuidv4(),
    parentNodeId: uuidv4(),
    targetNodeId: uuidv4(),
    depthIndex: 0
  });

  console.log(`   [Service D] Polled queue, received batch of ${batchQueuePayloads.length} items.`);

  const batchRootContainer = Tracer.startContainer("4. Cron: Process Nightly Reports", ["batch", "reporting"]);
  batchRootContainer.logNode("Batch cron triggered", ["batch"]);

  for (const item of batchQueuePayloads) {
    const itemContainer = Tracer.continueTrace(
      item.traceId, item.parentNodeId, 
      "1.3.2 Process Report Item", NodeType.FUNCTION, 
      item.depthIndex, undefined, undefined,
      item.targetNodeId
    );
    
    await delay(5);
    itemContainer.logNode("Batch item processing accepted", ["batch"]);
    
    // 14. Nested Function Call: generatePdfReport() [Sub-Container - depth 1]
    const generatePdfTx = itemContainer.startChildContainer("1.3.2.1 generatePdfReport()", ["batch", "pdf"]);
    
    // Fetch Template from S3 [Node - log event]
    generatePdfTx.logNode("S3: GET template.html FROM reports-templates", ["network", "s3"]);
    await delay(15);
    
    // 15. Deeply Nested Function Call: renderTemplate() [Sub-Container - depth 2]
    const renderTx = generatePdfTx.startChildContainer("1.3.2.1.2 renderTemplate()", ["batch", "pdf"]);
    
    // 16. Extra Deeply Nested Function Call: sanitizeData() [Sub-Container - depth 3]
    const sanitizeTx = renderTx.startChildContainer("1.3.2.1.2.1 sanitizeData()", ["batch", "pdf"]);
    sanitizeTx.logNode("Sanitize user string fields", ["logic"]);
    sanitizeTx.complete();

    renderTx.logNode("Compile HTML string buffer", ["pdf"]);
    renderTx.complete();

    generatePdfTx.logNode("Export PDF binary stream", ["pdf"]);
    generatePdfTx.complete();

    // 17. Nested Function Call: sendEmail() [Sub-Container - depth 1]
    const sendEmailTx = itemContainer.startChildContainer("1.3.2.2 sendEmail()", ["batch", "email"]);
    
    // SMTP Delivery request [Node - log event]
    sendEmailTx.logNode("SMTP: Deliver PDF report to admin@example.com", ["network", "email"]);
    await delay(10);
    sendEmailTx.complete();
    
    itemContainer.logNode("Report item completed", ["batch"]);
    itemContainer.complete();
  }

  batchRootContainer.logNode("Cron process complete", ["batch"]);
  batchRootContainer.complete();

  console.log("   [Service D] Flushing telemetry and shutting down...\n");
  try { await Tracer.flush(); } catch (e) {}
  await Tracer.shutdown();

  console.log("=========================================");
  console.log("✅ Simulation Complete");
  console.log("=========================================");
}

runSophisticatedSimulation().catch(console.error);
