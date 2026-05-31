import { Tracer, Span } from "../src/index";

/**
 * Topo-Tracer V4: Sophisticated Microservice Architecture Simulation
 * 
 * This example simulates a complete distributed transaction across four microservices:
 *   1. [Service A] Order API Gateway (Root service, entry HTTP router)
 *   2. [Service B] Payment Processing Service (Handles credit card charges via Stripe/PayPal)
 *   3. [Service C] Inventory Worker (Listens to Kafka events to update catalog stocks)
 * 
 * It showcases how visual detail levels (viewLevel) are explicitly set by developers
 * to align with human-readable visual levels, and how the snapping engine handles these.
 */

async function runSophisticatedSimulation() {
  console.log("=============================================================");
  console.log("   TOPO-TRACER V4: SOPHISTICATED MICROSERVICES TRACE FLOW   ");
  console.log("=============================================================");

  const orderSvcId = "boundary-order-gateway";
  const paymentSvcId = "boundary-payment-processor";
  const inventorySvcId = "boundary-inventory-consumer";

  // =========================================================================
  // 1. INITIATING SERVICE A: ORDER API GATEWAY (Root Service)
  // =========================================================================
  console.log("\n[Service A] Initializing Order API Gateway...");
  Tracer.init(
    { baseUrl: "http://localhost:3000" },
    { 
      id: orderSvcId,
      name: "Order API Gateway", 
      type: "gateway",
      levelNames: {
        0: "Architecture Map",          // Level 0: Services, queues, databases
        1: "API Controllers",            // Level 1: HTTP handlers
        2: "Business Procedures",        // Level 2: validateOrder, processPayment, dispatchOrder
        3: "Internal SQL & Details"      // Level 3: cache checks, database scripts
      }
    }
  );

  // Start root boundary span (viewLevel = 0: Architecture Map)
  const gatewayBoundary = Tracer.startBoundary("POST /v1/checkout", { 
    type: "service",
    viewLevel: 0 
  });
  console.log(`   [Service A] Started Distributed Trace ID: ${gatewayBoundary.traceId}`);

  // HTTP router entry execution span (viewLevel = 1: API Controllers)
  const gatewayRecvNode = gatewayBoundary.startSpan("Gateway received request", { 
    type: "http_server",
    viewLevel: 1
  });
  await new Promise(r => setTimeout(r, 10));
  gatewayRecvNode.end();

  // 1A. Nested Procedure: validateOrder() (viewLevel = 2: Business Procedures)
  const validateNode = gatewayBoundary.startSpan("1.1 validateOrder()", { 
    type: "function",
    viewLevel: 2 
  });
  
  // Cache check inside validateOrder() (viewLevel = 3: Internal SQL & Details)
  const cacheNode = validateNode.startSpan("redis.get(user_session)", { 
    type: "cache",
    viewLevel: 3 
  });
  await new Promise(r => setTimeout(r, 5));
  cacheNode.end();
  
  validateNode.end();
  // Draw edge: gateway entry -> validateOrder
  gatewayRecvNode.logEdge(validateNode.id, "local_call");

  // 1B. Nested Procedure: processPayment() (viewLevel = 2: Business Procedures)
  const processPaymentNode = gatewayBoundary.startSpan("1.2 processPayment()", { 
    type: "function",
    viewLevel: 2 
  });
  gatewayRecvNode.logEdge(processPaymentNode.id, "local_call");

  // Client RPC caller node inside processPayment() (viewLevel = 3: Internal SQL & Details)
  const paymentClientNode = processPaymentNode.startSpan("gRPC Call: PaymentService.Charge", { 
    type: "rpc_client",
    viewLevel: 3 
  });
  await new Promise(r => setTimeout(r, 15));
  
  // Draw visual link: client RPC node -> payment service boundary (Column 0)
  paymentClientNode.logEdge(paymentSvcId, "grpc_call");
  
  paymentClientNode.end();
  processPaymentNode.end();

  // 1C. Nested Procedure: dispatchOrder() (viewLevel = 2: Business Procedures)
  const dispatchOrderNode = gatewayBoundary.startSpan("1.3 dispatchOrder()", { 
    type: "function",
    viewLevel: 2 
  });
  gatewayRecvNode.logEdge(dispatchOrderNode.id, "local_call");

  // Kafka produce event inside dispatchOrder (viewLevel = 3: Internal SQL & Details)
  const kafkaProduceNode = dispatchOrderNode.startSpan("Kafka.publish(order-created)", { 
    type: "message_producer",
    viewLevel: 3 
  });
  
  // HOISTED KAFKA BUS (Boundary)
  // We explicitly set viewLevel to 0 to pull the Kafka Topic out to the root canvas next to the services!
  const kafkaBus = kafkaProduceNode.startBoundary("Topic: order-created", { 
    viewLevel: 0,
    type: "queue" 
  });
  
  // Draw link: produce node -> hoisted Kafka bus
  kafkaProduceNode.logEdge(kafkaBus.id, "kafka_publish");
  
  kafkaBus.end();
  kafkaProduceNode.end();

  // Downstream context propagation headers to simulate HTTP call to Payment Service
  const paymentServiceHeaders = gatewayBoundary.createCarrierHeaders(paymentClientNode.id);

  // Downstream context propagation headers to simulate Kafka message to Inventory Consumer
  const inventoryKafkaHeaders = gatewayBoundary.createCarrierHeaders(kafkaProduceNode.id);

  // Gateway completion (viewLevel = 1: API Controllers)
  const gatewayDoneNode = gatewayBoundary.startSpan("Gateway completed response", { 
    type: "http_server",
    viewLevel: 1 
  });
  gatewayDoneNode.end();
  gatewayBoundary.end();
  console.log("   [Service A] Order API Gateway completed successfully.");


  // =========================================================================
  // 2. SIMULATING SERVICE B: PAYMENT PROCESSING SERVICE (Downstream Service)
  // =========================================================================
  console.log("\n[Service B] Initializing Payment Processing Service...");
  Tracer.init(
    { baseUrl: "http://localhost:3000" },
    { 
      id: paymentSvcId,
      name: "Payment Processor", 
      type: "service", 
      levelNames: {
        0: "Architecture Map",
        1: "gRPC Entrypoints",
        2: "Payment Gateways",
        3: "Database Scripts"
      }
    }
  );

  // Continue trace using incoming carrier headers.
  // We explicitly override the viewLevel of the continued service boundary to 0!
  // This keeps the service boundary cleanly positioned on the high-level Architecture Map.
  const paymentBoundary = Tracer.continueTrace(paymentServiceHeaders, "ChargePayment", { 
    type: "service",
    viewLevel: 0 
  });
  console.log(`   [Service B] Continuing Distributed Trace ID: ${paymentBoundary.traceId}`);

  // gRPC entry receiver execution span (viewLevel = 1: gRPC Entrypoints)
  const paymentRecvNode = paymentBoundary.startSpan("gRPC request accepted", { 
    type: "rpc_server",
    viewLevel: 1 
  });
  await new Promise(r => setTimeout(r, 8));
  paymentRecvNode.end();

  // 2A. Nested Gateway Call: stripeCharge() (viewLevel = 2: Payment Gateways)
  const stripeNode = paymentBoundary.startSpan("1.2.1 stripeCharge()", { 
    type: "function",
    viewLevel: 2 
  });
  paymentRecvNode.logEdge(stripeNode.id, "local_call");

  // Post to Stripe REST API (viewLevel = 3: Database Scripts / Client details)
  const stripeHttpNode = stripeNode.startSpan("POST https://api.stripe.com/v1/charges", { 
    type: "http_client",
    viewLevel: 3 
  });
  
  // HOISTED STRIPE ENDPOINT (Boundary - viewLevel = 0)
  // Hoist to Level 0 to show it clearly on the main dashboard as an external API dependency
  const stripeExternal = stripeHttpNode.startBoundary("External API: Stripe", { 
    viewLevel: 0, 
    type: "external" 
  });
  
  // Draw link: local http node -> external Stripe boundary
  stripeHttpNode.logEdge(stripeExternal.id, "http_request");
  
  stripeExternal.end();
  await new Promise(r => setTimeout(r, 25)); // Simulate REST call delay
  stripeHttpNode.end();
  stripeNode.end();

  // Complete Payment Service boundary
  paymentBoundary.end();
  console.log("   [Service B] Payment Processor completed successfully.");


  // =========================================================================
  // 3. SIMULATING SERVICE C: INVENTORY CONSUMER (Kafka Listener)
  // =========================================================================
  console.log("\n[Service C] Initializing Inventory Consumer...");
  Tracer.init(
    { baseUrl: "http://localhost:3000" },
    { 
      id: inventorySvcId,
      name: "Inventory Worker", 
      type: "worker",
      levelNames: {
        0: "Architecture Map",
        1: "Message Handlers",
        2: "Database Updates"
      }
    }
  );

  // Continue trace using Kafka message carrier headers
  // Explicitly override service boundary viewLevel to 0 to align on the Architecture Map
  const inventoryBoundary = Tracer.continueTrace(inventoryKafkaHeaders, "InventoryConsumer", { 
    type: "service",
    viewLevel: 0 
  });
  console.log(`   [Service C] Continuing Distributed Trace ID: ${inventoryBoundary.traceId}`);

  // Kafka consumer entry handle (viewLevel = 1: Message Handlers)
  const consumeNode = inventoryBoundary.startSpan("Kafka Event Consumed", { 
    type: "message_consumer",
    viewLevel: 1 
  });
  await new Promise(r => setTimeout(r, 12));
  consumeNode.end();

  // 3A. Nested Database update: decrementInventory() (viewLevel = 2: Database Updates)
  const updateStockNode = inventoryBoundary.startSpan("1.3.1 decrementInventory()", { 
    type: "function",
    viewLevel: 2 
  });
  consumeNode.logEdge(updateStockNode.id, "local_call");

  // SQL Update execution span (viewLevel = 3)
  const dbUpdateNode = updateStockNode.startSpan("UPDATE inventory SET stock = stock - 1", { 
    type: "sql_query",
    viewLevel: 3 
  });
  
  // HOISTED POSTGRES DATABASE (Boundary - viewLevel = 0)
  // Hoist Postgres to Level 0 so it visually aggregates database traffic across all microservices!
  const postgresDb = dbUpdateNode.startBoundary("PostgreSQL: CatalogDB", { 
    viewLevel: 0,
    type: "database" 
  });
  
  // Draw link: query node -> PostgreSQL Database
  dbUpdateNode.logEdge(postgresDb.id, "database_query");
  
  postgresDb.end();
  await new Promise(r => setTimeout(r, 18)); // Simulate query time
  dbUpdateNode.end();
  updateStockNode.end();

  // Complete Inventory Service
  inventoryBoundary.end();
  console.log("   [Service C] Inventory Worker completed successfully.");


  // =========================================================================
  // 4. EXPORTING & FLUSHING TRACES
  // =========================================================================
  console.log("\nFlushing sophisticated telemetry batch to backend...");
  try {
    await Tracer.flush();
    console.log("All V4 microservice telemetries successfully flushed.");
    console.log(`Auditable V4 Trace ID: ${gatewayBoundary.traceId}`);
    console.log("\nHow to see dynamic visual snapping and Ghost Spans:");
    console.log(`1. Query the backend: GET http://localhost:3000/telemetry/trace/${gatewayBoundary.traceId}?maxLevel=1`);
    console.log("2. Check the edge connections inside 'edges' and 'ghostSpans'. You will see detailed 'validate_card' L2 function calls snapped up to 'processCheckout' L1, with interactive 'GhostSpan' capsules summarizing the skipped elapsed durations!");
  } catch (error: any) {
    console.warn("Flush skipped (backend not active):", error.message);
  }

  await Tracer.shutdown();
}

runSophisticatedSimulation().catch(console.error);
