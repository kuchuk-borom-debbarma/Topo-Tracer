import { Tracer, Span } from "../src/index";

/**
 * Topo-Tracer V4: Sophisticated Microservice Architecture Simulation
 * 
 * This example simulates a complete distributed transaction across four microservices:
 *   1. [Service A] Order API Gateway (Root service, entry HTTP router)
 *   2. [Service B] Payment Processing Service (Handles credit card charges via Stripe/PayPal)
 *   3. [Service C] Inventory Worker (Listens to Kafka events to update catalog stocks)
 * 
 * This version uses deep parentage nesting where sub-functions run structurally inside
 * the request entrypoint nodes, exactly matching production trace instrumentations.
 */

async function runSophisticatedSimulation() {
  console.log("=============================================================");
  console.log("   TOPO-TRACER V4: DEEP NESTED MICROSERVICES TRACE FLOW      ");
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
  // ⚠️ REMAINS OPEN until all gateway operations complete!
  const gatewayRecvNode = gatewayBoundary.startSpan("Gateway received request", { 
    type: "http_server",
    viewLevel: 1
  });
  await new Promise(r => setTimeout(r, 5));

  // 1A. Nested Procedure inside gatewayRecvNode: validateOrder() (viewLevel = 2)
  const validateNode = gatewayRecvNode.startSpan("1.1 validateOrder()", { 
    type: "function",
    viewLevel: 2 
  });
  
  // Cache check inside validateOrder() (viewLevel = 3)
  const cacheNode = validateNode.startSpan("redis.get(user_session)", { 
    type: "cache",
    viewLevel: 3 
  });
  await new Promise(r => setTimeout(r, 5));
  cacheNode.end();
  validateNode.end();

  // Draw edge: gateway controller -> validateOrder nested procedure
  gatewayRecvNode.logEdge(validateNode.id, "local_call");

  // 1B. Nested Procedure inside gatewayRecvNode: processPayment() (viewLevel = 2)
  const processPaymentNode = gatewayRecvNode.startSpan("1.2 processPayment()", { 
    type: "function",
    viewLevel: 2 
  });
  
  // Client RPC caller node inside processPayment() (viewLevel = 3)
  const paymentClientNode = processPaymentNode.startSpan("gRPC Call: PaymentService.Charge", { 
    type: "rpc_client",
    viewLevel: 3 
  });
  await new Promise(r => setTimeout(r, 15));
  
  // Draw link: client RPC node -> Payment Service boundary container (Level 0)
  paymentClientNode.logEdge(paymentSvcId, "grpc_call");
  
  paymentClientNode.end();
  processPaymentNode.end();

  // Draw edge: gateway controller -> processPayment nested procedure
  gatewayRecvNode.logEdge(processPaymentNode.id, "local_call");

  // 1C. Nested Procedure inside gatewayRecvNode: dispatchOrder() (viewLevel = 2)
  const dispatchOrderNode = gatewayRecvNode.startSpan("1.3 dispatchOrder()", { 
    type: "function",
    viewLevel: 2 
  });

  // Kafka produce event inside dispatchOrder (viewLevel = 3)
  const kafkaProduceNode = dispatchOrderNode.startSpan("Kafka.publish(order-created)", { 
    type: "message_producer",
    viewLevel: 3 
  });
  
  // HOISTED KAFKA BUS (Boundary)
  const kafkaBus = kafkaProduceNode.startBoundary("Topic: order-created", { 
    viewLevel: 0,
    type: "queue" 
  });
  
  // Draw link: produce node -> hoisted Kafka bus
  kafkaProduceNode.logEdge(kafkaBus.id, "kafka_publish");
  
  kafkaBus.end();
  kafkaProduceNode.end();
  dispatchOrderNode.end();

  // Draw edge: gateway controller -> dispatchOrder nested procedure
  gatewayRecvNode.logEdge(dispatchOrderNode.id, "local_call");

  // Downstream context propagation headers to simulate HTTP call to Payment Service
  const paymentServiceHeaders = gatewayBoundary.createCarrierHeaders(paymentClientNode.id);

  // Downstream context propagation headers to simulate Kafka message to Inventory Consumer
  const inventoryKafkaHeaders = gatewayBoundary.createCarrierHeaders(kafkaProduceNode.id);

  // End gateway controller and root service boundary
  await new Promise(r => setTimeout(r, 5));
  gatewayRecvNode.end();
  gatewayBoundary.end();

  // Commit and flush Service A telemetry
  await Tracer.flush();
  console.log("   [Service A] Order API Gateway completed and flushed successfully.");


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

  // Continue trace using incoming carrier headers
  const paymentBoundary = Tracer.continueTrace(paymentServiceHeaders, "ChargePayment", { 
    type: "service",
    viewLevel: 0 
  });
  console.log(`   [Service B] Continuing Distributed Trace ID: ${paymentBoundary.traceId}`);

  // gRPC entry receiver execution span (viewLevel = 1)
  // ⚠️ REMAINS OPEN!
  const paymentRecvNode = paymentBoundary.startSpan("gRPC request accepted", { 
    type: "rpc_server",
    viewLevel: 1 
  });
  await new Promise(r => setTimeout(r, 5));

  // 2A. Nested Gateway Call inside paymentRecvNode: stripeCharge() (viewLevel = 2)
  const stripeNode = paymentRecvNode.startSpan("1.2.1 stripeCharge()", { 
    type: "function",
    viewLevel: 2 
  });
  paymentRecvNode.logEdge(stripeNode.id, "local_call");

  // Post to Stripe REST API inside stripeCharge() (viewLevel = 3)
  const stripeHttpNode = stripeNode.startSpan("POST https://api.stripe.com/v1/charges", { 
    type: "http_client",
    viewLevel: 3 
  });
  
  // HOISTED STRIPE ENDPOINT (Boundary - viewLevel = 0)
  const stripeExternal = stripeHttpNode.startBoundary("External API: Stripe", { 
    viewLevel: 0, 
    type: "external" 
  });
  
  // Draw link: local http node -> external Stripe boundary
  stripeHttpNode.logEdge(stripeExternal.id, "http_request");
  
  stripeExternal.end();
  await new Promise(r => setTimeout(r, 20)); // Simulate REST call delay
  stripeHttpNode.end();
  stripeNode.end();

  // Complete Payment Service receiver and boundary
  paymentRecvNode.end();
  paymentBoundary.end();

  // Commit and flush Service B telemetry
  await Tracer.flush();
  console.log("   [Service B] Payment Processor completed and flushed successfully.");


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
  const inventoryBoundary = Tracer.continueTrace(inventoryKafkaHeaders, "InventoryConsumer", { 
    type: "service",
    viewLevel: 0 
  });
  console.log(`   [Service C] Continuing Distributed Trace ID: ${inventoryBoundary.traceId}`);

  // Kafka consumer entry handle (viewLevel = 1)
  // ⚠️ REMAINS OPEN!
  const consumeNode = inventoryBoundary.startSpan("Kafka Event Consumed", { 
    type: "message_consumer",
    viewLevel: 1 
  });
  await new Promise(r => setTimeout(r, 8));

  // 3A. Nested Database update inside consumeNode: decrementInventory() (viewLevel = 2)
  const updateStockNode = consumeNode.startSpan("1.3.1 decrementInventory()", { 
    type: "function",
    viewLevel: 2 
  });
  consumeNode.logEdge(updateStockNode.id, "local_call");

  // SQL Update execution span inside decrementInventory (viewLevel = 3)
  const dbUpdateNode = updateStockNode.startSpan("UPDATE inventory SET stock = stock - 1", { 
    type: "sql_query",
    viewLevel: 3 
  });
  
  // HOISTED POSTGRES DATABASE (Boundary - viewLevel = 0)
  const postgresDb = dbUpdateNode.startBoundary("PostgreSQL: CatalogDB", { 
    viewLevel: 0,
    type: "database" 
  });
  
  // Draw link: query node -> PostgreSQL Database
  dbUpdateNode.logEdge(postgresDb.id, "database_query");
  
  postgresDb.end();
  await new Promise(r => setTimeout(r, 15)); // Simulate query time
  dbUpdateNode.end();
  updateStockNode.end();

  // Complete Inventory Service
  consumeNode.end();
  inventoryBoundary.end();

  // Commit and flush Service C telemetry
  await Tracer.flush();
  console.log("   [Service C] Inventory Worker completed and flushed successfully.");


  // =========================================================================
  // 4. EXPORTING COMPLETE ARCHITECTURE FLOW
  // =========================================================================
  console.log("\nComplete deep nested transaction flow successfully published!");
  console.log(`Auditable V4 Trace ID: ${gatewayBoundary.traceId}`);
  console.log(`Visual URL: http://localhost:5173/trace/${gatewayBoundary.traceId}`);

  await Tracer.shutdown();
}

runSophisticatedSimulation().catch(console.error);
