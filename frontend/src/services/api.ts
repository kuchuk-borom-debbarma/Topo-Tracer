export type JsonValue = any;

/**
 * Represents a pre-computed layout Block on the read path.
 * A Block represents a structural vertical boundary/function scope.
 */
export interface ReadBlock {
  id: string;
  traceId: string;
  containerId: string;
  parentBlockId: string;
  callingNodeId: string;
  name: string;
  type: string;
  absoluteDepth: number;
  startTimeUs: number;
  durationUs: number | null;
  ancestryPath: string[];
  metadata?: Record<string, any> | null;
}

/**
 * Represents an operational step or log checkpoint inside a specific Block.
 * These flow vertically inside a Block card.
 */
export interface ReadNode {
  id: string;
  traceId: string;
  blockId: string;
  name: string;
  type: string;
  zoomLevel: number;
  localSequence: number;
  startTimeUs: number;
  durationUs: number | null;
  ancestryPath: string[];
  metadata?: Record<string, any> | null;
}

/**
 * Represents a horizontal connecting jump wire (edge) linking two Blocks on the UI.
 */
export interface ReadEdge {
  id: string;
  edgeId: string;
  traceId: string;
  fromBlockId: string;
  fromNodeId: string;
  toBlockId: string;
  toNodeId: string;
}

/**
 * Metadata caching the zoom capabilities and completion status of a trace.
 */
export interface TraceMetadata {
  traceId: string;
  isZoomReady: boolean;
  maxAvailableDepth: number;
  currentDepth: number;
}

/**
 * Represents the complete read-optimized dynamic layout response structure.
 */
export interface TraceLayoutResponse {
  metadata: TraceMetadata;
  blocks: ReadBlock[];
  nodes: ReadNode[];
  edges: ReadEdge[];
}

export interface TraceSummary {
  traceId: string;
  rootNodeName: string;
  startTime: string;
  nodeCount: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    prevTimeCursor: number | null;
    prevIdCursor: string | null;
    nextTimeCursor: number | null;
    nextIdCursor: string | null;
    hasPrev: boolean;
    hasNext: boolean;
  };
}

const BACKEND_BASE = 'http://localhost:3000/telemetry';

// Robust offline mock fallback dataset based on real-world e-commerce checkout simulations
export const MOCK_TRACE_ID = 'e037a6a7-1942-474e-b198-daffe6504822';

export const getMockTrace = (zoomLevel: number): TraceLayoutResponse => {
  // Define containers, blocks, nodes and edges
  const allBlocks: ReadBlock[] = [
    {
      id: 'b-checkout',
      traceId: MOCK_TRACE_ID,
      containerId: 'container-order-api',
      parentBlockId: '',
      callingNodeId: '',
      name: 'POST /v1/checkout',
      type: 'express_api',
      absoluteDepth: 0,
      startTimeUs: 1779977558000,
      durationUs: 820,
      ancestryPath: ['container-order-api', 'b-checkout'],
      metadata: { route: '/v1/checkout', client_ip: '192.168.1.45' }
    },
    {
      id: 'b-validate',
      traceId: MOCK_TRACE_ID,
      containerId: 'container-order-api',
      parentBlockId: 'b-checkout',
      callingNodeId: 'n-validate-call',
      name: 'validateOrder()',
      type: 'function',
      absoluteDepth: 1,
      startTimeUs: 1779977558010,
      durationUs: 85,
      ancestryPath: ['container-order-api', 'b-checkout', 'b-validate'],
      metadata: { file: 'src/controllers/checkout.ts' }
    },
    {
      id: 'b-charge',
      traceId: MOCK_TRACE_ID,
      containerId: 'container-payment-svc',
      parentBlockId: 'b-checkout',
      callingNodeId: 'n-payment-call',
      name: 'POST /charge',
      type: 'express_api',
      absoluteDepth: 1,
      startTimeUs: 1779977558120,
      durationUs: 410,
      ancestryPath: ['container-payment-svc', 'b-checkout', 'b-charge'],
      metadata: { gateway: 'stripe' }
    },
    {
      id: 'b-stripe-ledger',
      traceId: MOCK_TRACE_ID,
      containerId: 'container-payment-svc',
      parentBlockId: 'b-charge',
      callingNodeId: 'n-ledger-call',
      name: 'stripe.ledger.record()',
      type: 'function',
      absoluteDepth: 2,
      startTimeUs: 1779977558140,
      durationUs: 45,
      ancestryPath: ['container-payment-svc', 'b-checkout', 'b-charge', 'b-stripe-ledger'],
      metadata: { file: 'src/services/ledger.ts' }
    },
    {
      id: 'b-inventory',
      traceId: MOCK_TRACE_ID,
      containerId: 'container-inventory-worker',
      parentBlockId: 'b-checkout',
      callingNodeId: 'n-dispatch-pub',
      name: 'Kafka Sub: order-dispatched',
      type: 'kafka_consumer',
      absoluteDepth: 1,
      startTimeUs: 1779977558605,
      durationUs: 205,
      ancestryPath: ['container-inventory-worker', 'b-checkout', 'b-inventory'],
      metadata: { consumer_group: 'inv-workers' }
    }
  ];

  const allNodes: ReadNode[] = [
    // Nodes in b-checkout
    {
      id: 'n-gate-log1',
      traceId: MOCK_TRACE_ID,
      blockId: 'b-checkout',
      name: 'API Ingress Received',
      type: 'log',
      zoomLevel: 2,
      localSequence: 0,
      startTimeUs: 1779977558001,
      durationUs: null,
      ancestryPath: ['container-order-api', 'b-checkout', 'n-gate-log1'],
      metadata: { secure: true }
    },
    {
      id: 'n-validate-call',
      traceId: MOCK_TRACE_ID,
      blockId: 'b-checkout',
      name: 'Trigger Validation',
      type: 'step',
      zoomLevel: 1,
      localSequence: 1,
      startTimeUs: 1779977558010,
      durationUs: 85,
      ancestryPath: ['container-order-api', 'b-checkout', 'n-validate-call'],
      metadata: { async: false }
    },
    {
      id: 'n-payment-call',
      traceId: MOCK_TRACE_ID,
      blockId: 'b-checkout',
      name: 'Trigger Stripe Charge API',
      type: 'step',
      zoomLevel: 0,
      localSequence: 2,
      startTimeUs: 1779977558110,
      durationUs: 420,
      ancestryPath: ['container-order-api', 'b-checkout', 'n-payment-call'],
      metadata: { target_url: 'https://api.payments.com/charge' }
    },
    {
      id: 'n-dispatch-pub',
      traceId: MOCK_TRACE_ID,
      blockId: 'b-checkout',
      name: 'Kafka Pub: order-dispatched',
      type: 'pubsub',
      zoomLevel: 1,
      localSequence: 3,
      startTimeUs: 1779977558560,
      durationUs: 40,
      ancestryPath: ['container-order-api', 'b-checkout', 'n-dispatch-pub'],
      metadata: { topic: 'order-dispatched' }
    },

    // Nodes in b-validate
    {
      id: 'n-val-check1',
      traceId: MOCK_TRACE_ID,
      blockId: 'b-validate',
      name: 'Parse Request Cart Items',
      type: 'log',
      zoomLevel: 2,
      localSequence: 0,
      startTimeUs: 1779977558015,
      durationUs: null,
      ancestryPath: ['container-order-api', 'b-checkout', 'b-validate', 'n-val-check1'],
      metadata: { count: 3 }
    },
    {
      id: 'n-val-check2',
      traceId: MOCK_TRACE_ID,
      blockId: 'b-validate',
      name: 'Verify Account Permissions',
      type: 'step',
      zoomLevel: 1,
      localSequence: 1,
      startTimeUs: 1779977558020,
      durationUs: 60,
      ancestryPath: ['container-order-api', 'b-checkout', 'b-validate', 'n-val-check2'],
      metadata: { role: 'customer' }
    },

    // Nodes in b-charge
    {
      id: 'n-charge-init',
      traceId: MOCK_TRACE_ID,
      blockId: 'b-charge',
      name: 'Decrypt Gateway Payload',
      type: 'log',
      zoomLevel: 2,
      localSequence: 0,
      startTimeUs: 1779977558125,
      durationUs: null,
      ancestryPath: ['container-payment-svc', 'b-checkout', 'b-charge', 'n-charge-init']
    },
    {
      id: 'n-ledger-call',
      traceId: MOCK_TRACE_ID,
      blockId: 'b-charge',
      name: 'Record Local Ledger tx',
      type: 'step',
      zoomLevel: 1,
      localSequence: 1,
      startTimeUs: 1779977558140,
      durationUs: 45,
      ancestryPath: ['container-payment-svc', 'b-checkout', 'b-charge', 'n-ledger-call'],
      metadata: { database: 'ledger_db' }
    },
    {
      id: 'n-stripe-http',
      traceId: MOCK_TRACE_ID,
      blockId: 'b-charge',
      name: 'POST api.stripe.com/charges',
      type: 'step',
      zoomLevel: 0,
      localSequence: 2,
      startTimeUs: 1779977558200,
      durationUs: 310,
      ancestryPath: ['container-payment-svc', 'b-checkout', 'b-charge', 'n-stripe-http'],
      metadata: { timeout: 5000 }
    },

    // Nodes in b-stripe-ledger
    {
      id: 'n-db-ledger-find',
      traceId: MOCK_TRACE_ID,
      blockId: 'b-stripe-ledger',
      name: 'SELECT * FROM tx_ledger WHERE id = ?',
      type: 'db',
      zoomLevel: 2,
      localSequence: 0,
      startTimeUs: 1779977558142,
      durationUs: 43,
      ancestryPath: ['container-payment-svc', 'b-checkout', 'b-charge', 'b-stripe-ledger', 'n-db-ledger-find'],
      metadata: { rows: 1 }
    },

    // Nodes in b-inventory
    {
      id: 'n-inv-db-update',
      traceId: MOCK_TRACE_ID,
      blockId: 'b-inventory',
      name: 'UPDATE stock SET qty = qty - 3 WHERE id = 99',
      type: 'db',
      zoomLevel: 1,
      localSequence: 0,
      startTimeUs: 1779977558620,
      durationUs: 160,
      ancestryPath: ['container-inventory-worker', 'b-checkout', 'b-inventory', 'n-inv-db-update'],
      metadata: { rows_affected: 1 }
    }
  ];

  const mockEdges: ReadEdge[] = [
    {
      id: 'e-checkout-validate_wire',
      edgeId: 'e-checkout-validate',
      traceId: MOCK_TRACE_ID,
      fromBlockId: 'b-checkout',
      fromNodeId: 'n-validate-call',
      toBlockId: 'b-validate',
      toNodeId: 'n-val-check2'
    },
    {
      id: 'e-payment-call_wire',
      edgeId: 'e-payment-call',
      traceId: MOCK_TRACE_ID,
      fromBlockId: 'b-checkout',
      fromNodeId: 'n-payment-call',
      toBlockId: 'b-charge',
      toNodeId: 'n-stripe-http'
    },
    {
      id: 'e-ledger-call_wire',
      edgeId: 'e-ledger-call',
      traceId: MOCK_TRACE_ID,
      fromBlockId: 'b-charge',
      fromNodeId: 'n-ledger-call',
      toBlockId: 'b-stripe-ledger',
      toNodeId: 'n-db-ledger-find'
    },
    {
      id: 'e-dispatch-pub_wire',
      edgeId: 'e-dispatch-pub',
      traceId: MOCK_TRACE_ID,
      fromBlockId: 'b-checkout',
      fromNodeId: 'n-dispatch-pub',
      toBlockId: 'b-inventory',
      toNodeId: 'n-inv-db-update'
    }
  ];

  // Dynamic Filtering based on depth limits & absolute depths of blocks and nodes
  const filteredBlocks = allBlocks.filter(b => b.absoluteDepth <= zoomLevel);
  const blockIdsSet = new Set(filteredBlocks.map(b => b.id));
  const filteredNodes = allNodes.filter(n => {
    return blockIdsSet.has(n.blockId) && n.zoomLevel <= zoomLevel;
  });

  return {
    metadata: {
      traceId: MOCK_TRACE_ID,
      isZoomReady: true,
      maxAvailableDepth: 3,
      currentDepth: zoomLevel
    },
    blocks: filteredBlocks,
    nodes: filteredNodes,
    edges: mockEdges
  };
};

export async function fetchTraceLayout(
  traceId: string, 
  zoomLevel: number
): Promise<TraceLayoutResponse> {
  if (traceId === 'mock' || traceId === MOCK_TRACE_ID) {
    return getMockTrace(zoomLevel);
  }

  try {
    const res = await fetch(`${BACKEND_BASE}/trace/${traceId}?zoom_level=${zoomLevel}`);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`[API] Failed to fetch live trace layout for ${traceId}, falling back to mock dataset`, err);
    return getMockTrace(zoomLevel);
  }
}

export async function fetchTraces(
  limit: number = 20,
  beforeTime?: number,
  afterTime?: number
): Promise<PaginatedResult<TraceSummary>> {
  const params = new URLSearchParams();
  params.set('limit', limit.toString());
  if (beforeTime) params.set('beforeTime', beforeTime.toString());
  if (afterTime) params.set('afterTime', afterTime.toString());

  try {
    const res = await fetch(`${BACKEND_BASE}/traces?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`[API] Failed to fetch live traces, returning mock list`, err);
    return {
      data: [
        {
          traceId: MOCK_TRACE_ID,
          rootNodeName: 'POST /v1/checkout (Mock)',
          startTime: new Date().toISOString(),
          nodeCount: 10
        }
      ],
      pagination: {
        prevTimeCursor: null,
        prevIdCursor: null,
        nextTimeCursor: null,
        nextIdCursor: null,
        hasPrev: false,
        hasNext: false
      }
    };
  }
}
