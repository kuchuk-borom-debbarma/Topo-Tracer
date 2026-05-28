export interface TraceNode {
  id: string;
  traceId: string;
  containerId: string;
  parentNodeId: string;
  name: string;
  nodeType: 'http_server' | 'http_client' | 'database' | 'queue' | 'pubsub' | 'function' | 'internal';
  depthIndex: number;
  localDepthIndex: number;
  group?: string;
  metadata: Record<string, any> | null;
  initiatedAtLocal: string;
  processedAtLocal: string;
  completedAtLocal: string | null;
  scheduledAtLocal?: string;
  cpuActiveDurationUs?: number;
  suspendedAtLocal?: string[];
  resumedAtLocal?: string[];
}

export interface WireTarget {
  id: string;
  type: 'node' | 'container';
}

export interface VisualWire {
  id: string;
  fromTarget: WireTarget;
  toTarget: WireTarget;
}

export interface TraceEdge {
  id: string;
  traceId: string;
  fromContainerId: string;
  toContainerId: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: string;
  dispatchedAtLocal: string;
  respondedAtLocal: string | null;
}

export interface FullTraceResult {
  nodes: TraceNode[];
  edges: TraceEdge[];
  visualWires: VisualWire[];
  isZoomReady: boolean;
  maxAvailableDepth: number;
  maxAvailableLocalDepth: number;
}

export interface TraceMetadata {
  isZoomReady: boolean;
  maxAvailableDepth: number;
  maxAvailableLocalDepth: number;
}

const BACKEND_BASE = 'http://localhost:3000/telemetry';

// Robust offline mock fallback dataset based on real-world simulations
const MOCK_TRACE_ID = 'e037a6a7-1942-474e-b198-daffe6504822';

const MOCK_METADATA: TraceMetadata = {
  isZoomReady: true,
  maxAvailableDepth: 4,
  maxAvailableLocalDepth: 3
};

// Generates high-fidelity mock responses at various global/local depths
export function getMockTrace(depth: number, depthType: 'global' | 'local'): FullTraceResult {
  // Let's model a 7-node distributed e-commerce checkout trace
  const allNodes: TraceNode[] = [
    {
      id: 'n-checkout-gate',
      traceId: MOCK_TRACE_ID,
      containerId: 'container-order-api',
      parentNodeId: '',
      name: 'POST /v1/checkout',
      nodeType: 'http_server',
      depthIndex: 0,
      localDepthIndex: 0,
      group: 'Gateway Ingestion',
      metadata: { status: 200, client_ip: '192.168.1.45', route: '/v1/checkout', user_agent: 'Mozilla/5.0' },
      initiatedAtLocal: '2026-05-28T07:00:00.000Z',
      processedAtLocal: '2026-05-28T07:00:00.002Z',
      completedAtLocal: '2026-05-28T07:00:00.820Z'
    },
    {
      id: 'n-validate',
      traceId: MOCK_TRACE_ID,
      containerId: 'container-order-api',
      parentNodeId: 'n-checkout-gate',
      name: 'validateOrder()',
      nodeType: 'function',
      depthIndex: 1,
      localDepthIndex: 1,
      group: 'Validation Layer',
      metadata: { items_count: 3, cart_validation: 'success', stock_reserved: true },
      initiatedAtLocal: '2026-05-28T07:00:00.010Z',
      processedAtLocal: '2026-05-28T07:00:00.011Z',
      completedAtLocal: '2026-05-28T07:00:00.095Z'
    },
    {
      id: 'n-validate-perms',
      traceId: MOCK_TRACE_ID,
      containerId: 'container-order-api',
      parentNodeId: 'n-checkout-gate',
      name: 'checkUserPermissions()',
      nodeType: 'function',
      depthIndex: 1,
      localDepthIndex: 1,
      group: 'Validation Layer',
      metadata: { roles: ['user', 'customer'], scopes: ['read:checkout', 'write:checkout'] },
      initiatedAtLocal: '2026-05-28T07:00:00.020Z',
      processedAtLocal: '2026-05-28T07:00:00.021Z',
      completedAtLocal: '2026-05-28T07:00:00.080Z'
    },
    {
      id: 'n-payment-call',
      traceId: MOCK_TRACE_ID,
      containerId: 'container-order-api',
      parentNodeId: 'n-checkout-gate',
      name: 'POST container-payment-svc/charge',
      nodeType: 'http_client',
      depthIndex: 1,
      localDepthIndex: 1,
      group: 'Payment Integration',
      metadata: { method: 'POST', endpoint: '/charge', retry_count: 0 },
      initiatedAtLocal: '2026-05-28T07:00:00.110Z',
      processedAtLocal: '2026-05-28T07:00:00.112Z',
      completedAtLocal: '2026-05-28T07:00:00.540Z'
    },
    {
      id: 'n-payment-recv',
      traceId: MOCK_TRACE_ID,
      containerId: 'container-payment-svc',
      parentNodeId: 'n-payment-call',
      name: 'POST /charge',
      nodeType: 'http_server',
      depthIndex: 2,
      localDepthIndex: 0,
      group: 'Charge Processor',
      metadata: { gateway: 'stripe', currency: 'USD', amount: 249.99 },
      initiatedAtLocal: '2026-05-28T07:00:00.120Z',
      processedAtLocal: '2026-05-28T07:00:00.125Z',
      completedAtLocal: '2026-05-28T07:00:00.530Z'
    },
    {
      id: 'n-stripe-db',
      traceId: MOCK_TRACE_ID,
      containerId: 'container-payment-svc',
      parentNodeId: 'n-payment-recv',
      name: 'SELECT * FROM ledger WHERE tx_id = ?',
      nodeType: 'database',
      depthIndex: 3,
      localDepthIndex: 1,
      group: 'Stripe Processor',
      metadata: { query: 'SELECT * FROM ledger WHERE tx_id = ?', rows_returned: 1, pool_connections: 4 },
      initiatedAtLocal: '2026-05-28T07:00:00.140Z',
      processedAtLocal: '2026-05-28T07:00:00.140Z',
      completedAtLocal: '2026-05-28T07:00:00.185Z'
    },
    {
      id: 'n-stripe-api',
      traceId: MOCK_TRACE_ID,
      containerId: 'container-payment-svc',
      parentNodeId: 'n-payment-recv',
      name: 'POST api.stripe.com/v3/charges',
      nodeType: 'http_client',
      depthIndex: 3,
      localDepthIndex: 1,
      group: 'Stripe Processor',
      metadata: { provider: 'stripe', timeout_ms: 5000 },
      initiatedAtLocal: '2026-05-28T07:00:00.200Z',
      processedAtLocal: '2026-05-28T07:00:00.202Z',
      completedAtLocal: '2026-05-28T07:00:00.510Z'
    },
    {
      id: 'n-dispatch-pub',
      traceId: MOCK_TRACE_ID,
      containerId: 'container-order-api',
      parentNodeId: 'n-checkout-gate',
      name: 'Kafka Pub: order-dispatched',
      nodeType: 'pubsub',
      depthIndex: 1,
      localDepthIndex: 1,
      group: 'Event Ingestion',
      metadata: { topic: 'order-dispatched', partition: 2, offset: 194452 },
      initiatedAtLocal: '2026-05-28T07:00:00.560Z',
      processedAtLocal: '2026-05-28T07:00:00.560Z',
      completedAtLocal: '2026-05-28T07:00:00.600Z'
    },
    {
      id: 'n-dispatch-sub',
      traceId: MOCK_TRACE_ID,
      containerId: 'container-inventory-worker',
      parentNodeId: 'n-dispatch-pub',
      name: 'Kafka Sub: order-dispatched',
      nodeType: 'pubsub',
      depthIndex: 2,
      localDepthIndex: 0,
      group: 'Event Ingestion',
      metadata: { consumer_group: 'inv-workers', lag: 0 },
      initiatedAtLocal: '2026-05-28T07:00:00.605Z',
      processedAtLocal: '2026-05-28T07:00:00.608Z',
      completedAtLocal: '2026-05-28T07:00:00.810Z'
    },
    {
      id: 'n-inventory-db',
      traceId: MOCK_TRACE_ID,
      containerId: 'container-inventory-worker',
      parentNodeId: 'n-dispatch-sub',
      name: 'UPDATE stock SET qty = qty - 3 WHERE sku = ?',
      nodeType: 'database',
      depthIndex: 3,
      localDepthIndex: 1,
      group: 'Stock Database',
      metadata: { query: 'UPDATE stock SET qty = qty - 3 WHERE sku = ?', affected_rows: 1 },
      initiatedAtLocal: '2026-05-28T07:00:00.620Z',
      processedAtLocal: '2026-05-28T07:00:00.622Z',
      completedAtLocal: '2026-05-28T07:00:00.780Z'
    }
  ];

  // Filter nodes based on active depth visual slider
  const filteredNodes = allNodes.filter(n => {
    const val = depthType === 'local' ? n.localDepthIndex : n.depthIndex;
    return val <= depth;
  });

  // Calculate visual wires based on depth level (dynamic snap anchors)
  const visualWires: VisualWire[] = [];

  if (depthType === 'global') {
    if (depth === 0) {
      // Connect checkout root to collapsed containers
      visualWires.push({
        id: 'w-p1',
        fromTarget: { id: 'n-checkout-gate', type: 'node' },
        toTarget: { id: 'container-payment-svc', type: 'container' }
      });
      visualWires.push({
        id: 'w-p2',
        fromTarget: { id: 'n-checkout-gate', type: 'node' },
        toTarget: { id: 'container-inventory-worker', type: 'container' }
      });
    } else if (depth === 1) {
      // Connect specific nodes inside order-api to collapsed containers
      visualWires.push({
        id: 'w-p1',
        fromTarget: { id: 'n-payment-call', type: 'node' },
        toTarget: { id: 'container-payment-svc', type: 'container' }
      });
      visualWires.push({
        id: 'w-p2',
        fromTarget: { id: 'n-dispatch-pub', type: 'node' },
        toTarget: { id: 'container-inventory-worker', type: 'container' }
      });
    } else if (depth >= 2) {
      // Connect nodes in order-api to nodes/containers inside other apps
      visualWires.push({
        id: 'w-p1',
        fromTarget: { id: 'n-payment-call', type: 'node' },
        toTarget: { id: 'n-payment-recv', type: 'node' }
      });
      visualWires.push({
        id: 'w-p2',
        fromTarget: { id: 'n-dispatch-pub', type: 'node' },
        toTarget: { id: 'n-dispatch-sub', type: 'node' }
      });
    }
  } else {
    // Local depth mode
    if (depth === 0) {
      // Connect high-level API entrypoints directly
      visualWires.push({
        id: 'w-p1',
        fromTarget: { id: 'n-checkout-gate', type: 'node' },
        toTarget: { id: 'n-payment-recv', type: 'node' }
      });
      visualWires.push({
        id: 'w-p2',
        fromTarget: { id: 'n-checkout-gate', type: 'node' },
        toTarget: { id: 'n-dispatch-sub', type: 'node' }
      });
    } else {
      visualWires.push({
        id: 'w-p1',
        fromTarget: { id: 'n-payment-call', type: 'node' },
        toTarget: { id: 'n-payment-recv', type: 'node' }
      });
      visualWires.push({
        id: 'w-p2',
        fromTarget: { id: 'n-dispatch-pub', type: 'node' },
        toTarget: { id: 'n-dispatch-sub', type: 'node' }
      });
    }
  }

  const mockEdges: TraceEdge[] = [
    {
      id: 'e-payment',
      traceId: MOCK_TRACE_ID,
      fromContainerId: 'container-order-api',
      toContainerId: 'container-payment-svc',
      fromNodeId: 'n-payment-call',
      toNodeId: 'n-payment-recv',
      edgeType: 'http_request',
      dispatchedAtLocal: '2026-05-28T07:00:00.112Z',
      respondedAtLocal: '2026-05-28T07:00:00.540Z'
    },
    {
      id: 'e-dispatch',
      traceId: MOCK_TRACE_ID,
      fromContainerId: 'container-order-api',
      toContainerId: 'container-inventory-worker',
      fromNodeId: 'n-dispatch-pub',
      toNodeId: 'n-dispatch-sub',
      edgeType: 'kafka_message',
      dispatchedAtLocal: '2026-05-28T07:00:00.560Z',
      respondedAtLocal: '2026-05-28T07:00:00.600Z'
    }
  ];

  return {
    nodes: filteredNodes,
    edges: mockEdges,
    visualWires,
    isZoomReady: true,
    maxAvailableDepth: MOCK_METADATA.maxAvailableDepth,
    maxAvailableLocalDepth: MOCK_METADATA.maxAvailableLocalDepth
  };
}

export async function fetchTraceFull(
  traceId: string, 
  depth: number, 
  depthType: 'global' | 'local'
): Promise<FullTraceResult> {
  if (traceId === 'mock' || traceId === MOCK_TRACE_ID) {
    return getMockTrace(depth, depthType);
  }

  try {
    const res = await fetch(`${BACKEND_BASE}/trace/${traceId}/full?depth=${depth}&depthType=${depthType}`);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`[API] Failed to fetch live trace ${traceId}, falling back to mock dataset`, err);
    return getMockTrace(depth, depthType);
  }
}

export async function fetchTraceMetadata(traceId: string): Promise<TraceMetadata> {
  if (traceId === 'mock' || traceId === MOCK_TRACE_ID) {
    return MOCK_METADATA;
  }

  try {
    const res = await fetch(`${BACKEND_BASE}/trace/${traceId}/metadata`);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`[API] Failed to fetch live metadata for ${traceId}, falling back to mock`, err);
    return MOCK_METADATA;
  }
}
