import { Tracer, Span, Level } from "../src/index";

/**
 * Topo-Tracer V2: Sophisticated Microservice Architecture Simulation
 * 
 * This example simulates a complete distributed transaction across three microservices:
 *   1. [Service A] Order API Gateway (Root service, entry HTTP router)
 *   2. [Service B] Payment Processing Service (Handles credit card charges via Stripe/PayPal)
 *   3. [Service C] Inventory Worker (Listens to Kafka events to update catalog stocks)
 */

async function runSophisticatedSimulation() {
  console.log("=============================================================");
  console.log("   TOPO-TRACER V2: DEEP NESTED MICROSERVICES TRACE FLOW      ");
  console.log("=============================================================");

  // =========================================================================
  // 1. INITIATING SERVICE A: ORDER API GATEWAY (Root Service)
  // =========================================================================
  console.log("\n[Service A] Initializing Order API Gateway...");
  Tracer.init({ baseUrl: "http://localhost:3000" });

  // Start root trace (Level: INFO)
  const gatewayTrace = Tracer.startTrace("POST /v1/checkout", { 
    level: Level.INFO,
    tags: { type: "service", "service.name": "Order API Gateway" }
  });
  console.log(`   [Service A] Started Distributed Trace ID: ${gatewayTrace.traceId}`);

  // HTTP router entry execution span (Level: INFO)
  const gatewayRecvNode = gatewayTrace.startSpan("Gateway received request", { 
    level: Level.INFO,
    tags: { type: "http_server" }
  });
  await new Promise(r => setTimeout(r, 5));

  // 1A. Nested Procedure inside gatewayRecvNode: validateOrder()
  const validateNode = gatewayRecvNode.startSpan("1.1 validateOrder()", { 
    level: Level.DEBUG,
    tags: { type: "function" }
  });
  
  // Cache check inside validateOrder()
  const cacheNode = validateNode.startSpan("redis.get(user_session)", { 
    level: Level.TRACE,
    tags: { type: "cache" }
  });
  await new Promise(r => setTimeout(r, 5));
  cacheNode.end();
  validateNode.end();

  // 1B. Nested Procedure inside gatewayRecvNode: processPayment()
  const processPaymentNode = gatewayRecvNode.startSpan("1.2 processPayment()", { 
    level: Level.DEBUG,
    tags: { type: "function" }
  });
  
  // Client RPC caller node inside processPayment()
  const paymentClientNode = processPaymentNode.startSpan("gRPC Call: PaymentService.Charge", { 
    level: Level.INFO,
    tags: { type: "rpc_client" }
  });
  await new Promise(r => setTimeout(r, 15));
  
  paymentClientNode.end();
  processPaymentNode.end();

  // 1C. Nested Procedure inside gatewayRecvNode: dispatchOrder()
  const dispatchOrderNode = gatewayRecvNode.startSpan("1.3 dispatchOrder()", { 
    level: Level.DEBUG,
    tags: { type: "function" }
  });

  // Kafka produce event inside dispatchOrder
  const kafkaProduceNode = dispatchOrderNode.startSpan("Kafka.publish(order-created)", { 
    level: Level.INFO,
    tags: { type: "message_producer" }
  });
  
  // Draw link to logical queue topic
  // Note: we can still log an edge to a static ID representing the kafka topic if we want
  const kafkaTopicId = "kafka-topic-order-created";
  kafkaProduceNode.logEdge(kafkaTopicId);
  
  kafkaProduceNode.end();
  dispatchOrderNode.end();

  // Downstream context propagation headers to simulate HTTP call to Payment Service
  const paymentServiceHeaders = gatewayTrace.createCarrierHeaders(paymentClientNode.id);

  // Downstream context propagation headers to simulate Kafka message to Inventory Consumer
  const inventoryKafkaHeaders = gatewayTrace.createCarrierHeaders(kafkaProduceNode.id);

  // End gateway controller and root service trace
  await new Promise(r => setTimeout(r, 5));
  gatewayRecvNode.end();
  gatewayTrace.end();

  // Commit and flush Service A telemetry
  await Tracer.flush();
  console.log("   [Service A] Order API Gateway completed and flushed successfully.");


  // =========================================================================
  // 2. SIMULATING SERVICE B: PAYMENT PROCESSING SERVICE (Downstream Service)
  // =========================================================================
  console.log("\n[Service B] Initializing Payment Processing Service...");
  Tracer.init({ baseUrl: "http://localhost:3000" });

  // Continue trace using incoming carrier headers
  const paymentTrace = Tracer.continueTrace(paymentServiceHeaders, "ChargePayment", { 
    level: Level.INFO,
    tags: { type: "service", "service.name": "Payment Processor" }
  });
  console.log(`   [Service B] Continuing Distributed Trace ID: ${paymentTrace.traceId}`);

  // gRPC entry receiver execution span
  const paymentRecvNode = paymentTrace.startSpan("gRPC request accepted", { 
    level: Level.INFO,
    tags: { type: "rpc_server" }
  });
  await new Promise(r => setTimeout(r, 5));

  // 2A. Nested Gateway Call inside paymentRecvNode: stripeCharge()
  const stripeNode = paymentRecvNode.startSpan("1.2.1 stripeCharge()", { 
    level: Level.DEBUG,
    tags: { type: "function" }
  });

  // Post to Stripe REST API inside stripeCharge()
  const stripeHttpNode = stripeNode.startSpan("POST https://api.stripe.com/v1/charges", { 
    level: Level.INFO,
    tags: { type: "http_client" }
  });
  
  // Link to external stripe boundary
  stripeHttpNode.logEdge("stripe-api-external");
  
  await new Promise(r => setTimeout(r, 20)); // Simulate REST call delay
  stripeHttpNode.end();
  stripeNode.end();

  // Complete Payment Service receiver and boundary
  paymentRecvNode.end();
  paymentTrace.end();

  // Commit and flush Service B telemetry
  await Tracer.flush();
  console.log("   [Service B] Payment Processor completed and flushed successfully.");


  // =========================================================================
  // 3. SIMULATING SERVICE C: INVENTORY CONSUMER (Kafka Listener)
  // =========================================================================
  console.log("\n[Service C] Initializing Inventory Consumer...");
  Tracer.init({ baseUrl: "http://localhost:3000" });

  // Continue trace using Kafka message carrier headers
  const inventoryTrace = Tracer.continueTrace(inventoryKafkaHeaders, "InventoryConsumer", { 
    level: Level.INFO,
    tags: { type: "service", "service.name": "Inventory Worker" }
  });
  console.log(`   [Service C] Continuing Distributed Trace ID: ${inventoryTrace.traceId}`);

  // Draw link from the Kafka topic that triggered this
  inventoryTrace.logEdge(kafkaTopicId);

  // Kafka consumer entry handle
  const consumeNode = inventoryTrace.startSpan("Kafka Event Consumed", { 
    level: Level.INFO,
    tags: { type: "message_consumer" }
  });
  await new Promise(r => setTimeout(r, 8));

  // 3A. Nested Database update inside consumeNode: decrementInventory()
  const updateStockNode = consumeNode.startSpan("1.3.1 decrementInventory()", { 
    level: Level.DEBUG,
    tags: { type: "function" }
  });

  // SQL Update execution span inside decrementInventory
  const dbUpdateNode = updateStockNode.startSpan("UPDATE inventory SET stock = stock - 1", { 
    level: Level.TRACE,
    tags: { type: "sql_query" }
  });
  
  // Link to database
  dbUpdateNode.logEdge("postgres-catalog-db");
  
  await new Promise(r => setTimeout(r, 15)); // Simulate query time
  dbUpdateNode.end();
  updateStockNode.end();

  // Complete Inventory Service
  consumeNode.end();
  inventoryTrace.end();

  // Commit and flush Service C telemetry
  await Tracer.flush();
  console.log("   [Service C] Inventory Worker completed and flushed successfully.");


  // =========================================================================
  // 4. EXPORTING COMPLETE ARCHITECTURE FLOW
  // =========================================================================
  console.log("\nComplete deep nested transaction flow successfully published!");
  console.log(`Auditable V2 Trace ID: ${gatewayTrace.traceId}`);
  console.log(`Visual URL: http://localhost:5173/trace/${gatewayTrace.traceId}`);

  await Tracer.shutdown();
}

runSophisticatedSimulation().catch(console.error);
