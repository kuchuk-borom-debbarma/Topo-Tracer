import { v4 as uuidv4 } from "uuid";

const BASE_URL = "http://localhost:3000/telemetry";

// Helper to generate sequential IDs
let idCounter = 1;
const nextId = () => `id_${Date.now()}_${idCounter++}`;

const TRACE_ID = `mega_trace_${Date.now()}`;

// 10 Distinct Containers for a Microservices E-Commerce Architecture
const containers = [
  { id: "c_api", name: "API Gateway", containerType: "service", createdAtLocal: new Date().toISOString() },
  { id: "c_auth", name: "Auth Service", containerType: "service", createdAtLocal: new Date().toISOString() },
  { id: "c_user", name: "User Service", containerType: "service", createdAtLocal: new Date().toISOString() },
  { id: "c_catalog", name: "Product Catalog", containerType: "service", createdAtLocal: new Date().toISOString() },
  { id: "c_inventory", name: "Inventory Service", containerType: "service", createdAtLocal: new Date().toISOString() },
  { id: "c_order", name: "Order Management", containerType: "service", createdAtLocal: new Date().toISOString() },
  { id: "c_billing", name: "Billing Service", containerType: "service", createdAtLocal: new Date().toISOString() },
  { id: "c_notification", name: "Notification Worker", containerType: "worker", createdAtLocal: new Date().toISOString() },
  { id: "c_analytics", name: "Data Warehouse", containerType: "analytics", createdAtLocal: new Date().toISOString() },
  { id: "c_eventbus", name: "Kafka Event Bus", containerType: "message_queue", createdAtLocal: new Date().toISOString() },
  { id: "c_db_cluster", name: "Distributed DB", containerType: "database", createdAtLocal: new Date().toISOString() }
];

const nodes: any[] = [];
const edges: any[] = [];

let globalTimeMs = Date.now();
const getTimestamp = () => new Date(globalTimeMs).toISOString();
const advanceTime = (ms: number) => {
  globalTimeMs += ms;
  return getTimestamp();
};

const createNode = (
  containerId: string, 
  name: string, 
  nodeType: string, 
  depthIndex: number, 
  parentNodeId?: string, 
  durationMs: number = 10,
  metadata: any = {}
) => {
  const id = nextId();
  const initiatedAt = getTimestamp();
  const processedAt = advanceTime(Math.max(1, durationMs * 0.1)); // 10% overhead
  const completedAt = advanceTime(Math.max(1, durationMs * 0.9));
  
  const node = {
    id,
    traceId: TRACE_ID,
    containerId,
    parentNodeId: parentNodeId || "",
    name,
    nodeType,
    depthIndex,
    metadata,
    initiatedAtLocal: initiatedAt,
    processedAtLocal: processedAt,
    completedAtLocal: completedAt
  };
  
  nodes.push(node);
  return node;
};

const createEdge = (fromNode: any, toNode: any, edgeType: string) => {
  const edge = {
    id: nextId(),
    traceId: TRACE_ID,
    fromNodeId: fromNode.id,
    toContainerId: toNode.containerId,
    type: edgeType,
    timestamp: new Date(fromNode.processedAtLocal).getTime()
  };
  edges.push(edge);
  return edge;
};

// --- SIMULATE HIGHLY COMPLEX DISTRIBUTED E-COMMERCE WORKFLOW ---

const startTime = globalTimeMs;

// 1. Initial Request
const gwReq = createNode("c_api", "POST /v1/checkout", "http_server", 0, undefined, 2);

// 2. Auth Flow (Deep internal stack)
const authReq = createNode("c_auth", "AuthenticateUser", "rpc_server", 1, gwReq.id, 5);
createEdge(gwReq, authReq, "grpc");

const generateDeepInternalStack = (containerId: string, parentId: string, depth: number, maxDepth: number, taskName: string): any => {
  if (depth >= maxDepth) return parentId;
  const child = createNode(containerId, `internal_${taskName}_step_${depth}`, "function", depth, parentId, 2);
  return generateDeepInternalStack(containerId, child.id, depth + 1, maxDepth, taskName);
};

// Generate depth 10 internal stack in Auth
const authDeepLeaf = generateDeepInternalStack("c_auth", authReq.id, 2, 10, "crypto_verify");
const authDb = createNode("c_db_cluster", "SELECT user_session", "db_query", 11, authDeepLeaf, 15);
createEdge(nodes.find(n => n.id === authDeepLeaf), authDb, "tcp");

// 3. User & Catalog Verification (Parallel)
// Parallel branch 1: User Service
globalTimeMs = new Date(authReq.completedAtLocal).getTime() + 2;
const usrReq = createNode("c_user", "GetUserProfile", "rpc_server", 1, gwReq.id, 10);
createEdge(gwReq, usrReq, "grpc");

// Parallel branch 2: Catalog Service
globalTimeMs = new Date(authReq.completedAtLocal).getTime() + 2;
const catReq = createNode("c_catalog", "VerifyPrices", "rpc_server", 1, gwReq.id, 15);
createEdge(gwReq, catReq, "grpc");

// Sync point before Order
globalTimeMs = Math.max(new Date(usrReq.completedAtLocal).getTime(), new Date(catReq.completedAtLocal).getTime()) + 5;

// 4. Order Creation (Triggers immense downstream pub/sub)
const orderReq = createNode("c_order", "CreateOrderGraph", "rpc_server", 1, gwReq.id, 5);
createEdge(gwReq, orderReq, "grpc");

const orderDb = createNode("c_db_cluster", "INSERT INTO orders", "db_query", 2, orderReq.id, 20);
createEdge(orderReq, orderDb, "tcp");

const orderPub = createNode("c_order", "Publish OrderCreated", "event_publisher", 2, orderReq.id, 2);
const eventBus1 = createNode("c_eventbus", "Topic: orders.events", "queue", 3, orderPub.id, 5);
createEdge(orderPub, eventBus1, "kafka_produce");

// 5. Mass Event Consumption
// Inventory consumes
globalTimeMs = new Date(eventBus1.completedAtLocal).getTime() + 10;
const invSub = createNode("c_inventory", "Consume OrderCreated", "event_listener", 4, eventBus1.id, 5);
createEdge(eventBus1, invSub, "kafka_consume");

// Billing consumes
globalTimeMs = new Date(eventBus1.completedAtLocal).getTime() + 15;
const billSub = createNode("c_billing", "Consume OrderCreated", "event_listener", 4, eventBus1.id, 5);
createEdge(eventBus1, billSub, "kafka_consume");

// Analytics consumes
globalTimeMs = new Date(eventBus1.completedAtLocal).getTime() + 8;
const analSub = createNode("c_analytics", "Ingest OrderCreated", "event_listener", 4, eventBus1.id, 15);
createEdge(eventBus1, analSub, "kafka_consume");

// 6. Inventory Processing
globalTimeMs = new Date(invSub.completedAtLocal).getTime();
const invDb = createNode("c_db_cluster", "UPDATE stock", "db_query", 5, invSub.id, 30);
createEdge(invSub, invDb, "tcp");
const invPub = createNode("c_inventory", "Publish InventoryReserved", "event_publisher", 5, invSub.id, 2);
const eventBus2 = createNode("c_eventbus", "Topic: inventory.events", "queue", 6, invPub.id, 5);
createEdge(invPub, eventBus2, "kafka_produce");

// 7. Billing Processing (Complex 3rd Party API)
globalTimeMs = new Date(billSub.completedAtLocal).getTime();
const billApi = createNode("c_billing", "Stripe API Checkout", "external_api", 5, billSub.id, 150);
const billPub = createNode("c_billing", "Publish PaymentSuccess", "event_publisher", 5, billSub.id, 2);
const eventBus3 = createNode("c_eventbus", "Topic: payments.events", "queue", 6, billPub.id, 5);
createEdge(billPub, eventBus3, "kafka_produce");

// 8. Order Management listens to both Inventory & Billing
globalTimeMs = Math.max(new Date(eventBus2.completedAtLocal).getTime(), new Date(eventBus3.completedAtLocal).getTime()) + 20;
const orderInvSub = createNode("c_order", "Consume InventoryReserved", "event_listener", 7, eventBus2.id, 5);
createEdge(eventBus2, orderInvSub, "kafka_consume");
const orderBillSub = createNode("c_order", "Consume PaymentSuccess", "event_listener", 7, eventBus3.id, 5);
createEdge(eventBus3, orderBillSub, "kafka_consume");

const orderFinal = createNode("c_order", "Finalize Order Status", "function", 8, orderInvSub.id, 10);

// 9. Notification Service - Extreme Depth Pipeline
globalTimeMs = new Date(eventBus3.completedAtLocal).getTime() + 12;
const notifSub = createNode("c_notification", "Consume PaymentSuccess", "event_listener", 7, eventBus3.id, 5);
createEdge(eventBus3, notifSub, "kafka_consume");

const notifPipeline = createNode("c_notification", "BuildEmailPipeline", "pipeline", 8, notifSub.id, 2);
// Drive depth to 20 inside Notification
const notifDeepLeaf = generateDeepInternalStack("c_notification", notifPipeline.id, 9, 20, "template_renderer");
const notifSes = createNode("c_notification", "AWS SES Send", "external_api", 20, notifDeepLeaf, 45);

// Update final Gateway completion time
gwReq.completedAtLocal = advanceTime(50);


async function sendData() {
  console.log(`Generating massive trace... (Nodes: ${nodes.length}, Edges: ${edges.length})`);
  
  // We chunk data to simulate real telemetry streaming and avoid huge payload blocking
  const cRes = await fetch(`${BASE_URL}/containers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(containers) });
  console.log("Containers:", await cRes.json());

  // Chunk nodes
  for (let i = 0; i < nodes.length; i += 50) {
    const chunk = nodes.slice(i, i + 50);
    const nRes = await fetch(`${BASE_URL}/nodes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(chunk) });
    await nRes.json();
  }
  console.log("Nodes: Uploaded successfully.");

  // Chunk edges
  for (let i = 0; i < edges.length; i += 50) {
    const chunk = edges.slice(i, i + 50);
    const eRes = await fetch(`${BASE_URL}/edges`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(chunk) });
    await eRes.json();
  }
  console.log("Edges: Uploaded successfully.");
  
  console.log(`\n\n🔥 MEGA TRACE GENERATED SUCCESSFULLY 🔥\nView Trace UI: ${TRACE_ID}\n`);
}

sendData().catch(console.error);
