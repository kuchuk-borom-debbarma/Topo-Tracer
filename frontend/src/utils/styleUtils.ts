export interface StylePalette {
  base: string;
  glowing: string;
  border: string;
  bgTint: string;
}

/**
 * Deterministic consistent hashing to map a string to a vibrant, dark-mode optimized HSL color palette.
 */
export function getStringColorHash(str: string): StylePalette {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  // Keep saturation and lightness in highly readable, premium dark-mode ranges
  const saturation = 70 + (Math.abs(hash) % 15); // 70% to 85%
  const lightness = 52 + (Math.abs(hash) % 10);  // 52% to 62%
  
  return {
    base: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
    glowing: `hsla(${hue}, ${saturation}%, ${lightness}%, 0.15)`,
    border: `hsla(${hue}, ${saturation}%, ${lightness}%, 0.35)`,
    bgTint: `hsla(${hue}, ${saturation}%, ${lightness}%, 0.025)`
  };
}

/**
 * Standard container palettes matching the primary accent colors.
 */
const PRE_MAPPED_CONTAINERS: Record<string, StylePalette> = {
  'container-order-api': {
    base: 'var(--accent-purple)',
    glowing: 'rgba(139, 92, 246, 0.15)',
    border: 'rgba(139, 92, 246, 0.35)',
    bgTint: 'rgba(139, 92, 246, 0.025)'
  },
  'container-payment-svc': {
    base: 'var(--accent-pink)',
    glowing: 'rgba(236, 72, 153, 0.15)',
    border: 'rgba(236, 72, 153, 0.35)',
    bgTint: 'rgba(236, 72, 153, 0.025)'
  },
  'container-inventory-worker': {
    base: 'var(--accent-orange)',
    glowing: 'rgba(249, 115, 22, 0.15)',
    border: 'rgba(249, 115, 22, 0.35)',
    bgTint: 'rgba(249, 115, 22, 0.025)'
  },
  'container-reporting-batch': {
    base: 'var(--accent-teal)',
    glowing: 'rgba(20, 184, 166, 0.15)',
    border: 'rgba(20, 184, 166, 0.35)',
    bgTint: 'rgba(20, 184, 166, 0.025)'
  }
};

/**
 * Resolves container style dynamically based on standard maps, keyword matching, or hash fallbacks.
 */
export function getContainerStyle(containerId: string): StylePalette {
  const normalized = containerId.toLowerCase();
  
  if (PRE_MAPPED_CONTAINERS[normalized]) {
    return PRE_MAPPED_CONTAINERS[normalized];
  }
  
  // Keyword-based mappings for dynamic containers
  if (normalized.includes('api') || normalized.includes('gateway')) {
    return {
      base: 'var(--accent-purple)',
      glowing: 'rgba(139, 92, 246, 0.15)',
      border: 'rgba(139, 92, 246, 0.35)',
      bgTint: 'rgba(139, 92, 246, 0.025)'
    };
  }
  if (normalized.includes('payment') || normalized.includes('billing') || normalized.includes('charge')) {
    return {
      base: 'var(--accent-pink)',
      glowing: 'rgba(236, 72, 153, 0.15)',
      border: 'rgba(236, 72, 153, 0.35)',
      bgTint: 'rgba(236, 72, 153, 0.025)'
    };
  }
  if (normalized.includes('worker') || normalized.includes('consumer') || normalized.includes('listener')) {
    return {
      base: 'var(--accent-orange)',
      glowing: 'rgba(249, 115, 22, 0.15)',
      border: 'rgba(249, 115, 22, 0.35)',
      bgTint: 'rgba(249, 115, 22, 0.025)'
    };
  }
  if (normalized.includes('batch') || normalized.includes('cron') || normalized.includes('report') || normalized.includes('scheduler')) {
    return {
      base: 'var(--accent-teal)',
      glowing: 'rgba(20, 184, 166, 0.15)',
      border: 'rgba(20, 184, 166, 0.35)',
      bgTint: 'rgba(20, 184, 166, 0.025)'
    };
  }
  if (normalized.includes('db') || normalized.includes('database') || normalized.includes('sql') || normalized.includes('clickhouse') || normalized.includes('redis') || normalized.includes('mongo')) {
    return {
      base: 'var(--accent-teal)',
      glowing: 'rgba(20, 184, 166, 0.15)',
      border: 'rgba(20, 184, 166, 0.35)',
      bgTint: 'rgba(20, 184, 166, 0.025)'
    };
  }
  
  // Deterministic HSL Hash for custom container types
  return getStringColorHash(containerId);
}

/**
 * Mapped standard node colors based on nodeType.
 */
const PRE_MAPPED_NODES: Record<string, string> = {
  'http_server': 'var(--accent-green)',
  'http_client': 'var(--accent-blue)',
  'database': 'var(--accent-teal)',
  'pubsub': 'var(--accent-orange)',
  'queue': 'var(--accent-orange)',
  'message_producer': 'var(--accent-orange)',
  'message_consumer': 'var(--accent-purple)',
  'batch_job': 'var(--accent-teal)',
  'function': 'var(--accent-purple)',
  'internal': 'var(--text-muted)'
};

/**
 * Resolves node color dynamically based on standard maps, keyword matching, or hash fallbacks.
 */
export function getNodeColor(nodeType: string, isError: boolean): string {
  if (isError) return 'var(--accent-red)';
  const normalized = nodeType.toLowerCase();
  
  if (PRE_MAPPED_NODES[normalized]) {
    return PRE_MAPPED_NODES[normalized];
  }
  
  // Keyword-based fallback
  if (normalized.includes('server') || normalized.includes('http-in') || normalized.includes('api')) {
    return 'var(--accent-green)';
  }
  if (normalized.includes('client') || normalized.includes('http-out') || normalized.includes('fetch')) {
    return 'var(--accent-blue)';
  }
  if (normalized.includes('db') || normalized.includes('sql') || normalized.includes('query') || normalized.includes('mongo')) {
    return 'var(--accent-teal)';
  }
  if (normalized.includes('message') || normalized.includes('kafka') || normalized.includes('pub') || normalized.includes('sub') || normalized.includes('mq')) {
    return 'var(--accent-orange)';
  }
  
  // Fallback to consistent HSL hash color
  return getStringColorHash(nodeType).base;
}

/**
 * Mapped standard edge (wire arrow) palettes based on edgeType.
 */
const PRE_MAPPED_EDGES: Record<string, StylePalette> = {
  'http_request': {
    base: 'var(--accent-blue)',
    glowing: 'rgba(59, 130, 246, 0.15)',
    border: 'rgba(59, 130, 246, 0.35)',
    bgTint: 'rgba(59, 130, 246, 0.025)'
  },
  'http_client_request': {
    base: 'var(--accent-blue)',
    glowing: 'rgba(59, 130, 246, 0.15)',
    border: 'rgba(59, 130, 246, 0.35)',
    bgTint: 'rgba(59, 130, 246, 0.025)'
  },
  'kafka_message': {
    base: 'var(--accent-pink)',
    glowing: 'rgba(236, 72, 153, 0.15)',
    border: 'rgba(236, 72, 153, 0.35)',
    bgTint: 'rgba(236, 72, 153, 0.025)'
  },
  'sqs_message': {
    base: 'var(--accent-orange)',
    glowing: 'rgba(249, 115, 22, 0.15)',
    border: 'rgba(249, 115, 22, 0.35)',
    bgTint: 'rgba(249, 115, 22, 0.025)'
  }
};

/**
 * Resolves wire edge style dynamically based on standard maps, keyword matching, or hash fallbacks.
 */
export function getEdgeStyle(edgeType: string): StylePalette {
  const normalized = edgeType.toLowerCase();
  
  if (PRE_MAPPED_EDGES[normalized]) {
    return PRE_MAPPED_EDGES[normalized];
  }
  
  // Keyword-based fallback
  if (normalized.includes('http') || normalized.includes('rest') || normalized.includes('grpc')) {
    return PRE_MAPPED_EDGES['http_request'];
  }
  if (normalized.includes('kafka') || normalized.includes('pubsub') || normalized.includes('event')) {
    return PRE_MAPPED_EDGES['kafka_message'];
  }
  if (normalized.includes('sqs') || normalized.includes('queue') || normalized.includes('rabbit') || normalized.includes('message')) {
    return PRE_MAPPED_EDGES['sqs_message'];
  }
  
  // Default fallback HSL hash
  return getStringColorHash(edgeType);
}

/**
 * Cleans a string to be a safe CSS/SVG identifier.
 */
export function getSafeSvgId(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '-');
}
