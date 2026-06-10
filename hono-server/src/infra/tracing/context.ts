/**
 * Context propagation primitives for W3C traceparent header support.
 * Following code-base.md guidelines:
 * - Keeps logic simple, boring, and highly readable.
 * - Restricts shared utility scope to tracing needs.
 */

export type TraceContext = {
  traceId: string; // 32-character hex string
  spanId: string;  // 16-character hex string
  sampled: boolean;
};

/**
 * Parses a standard W3C traceparent header.
 * Format: 00-{traceId}-{spanId}-{flags}
 */
// fallow-ignore-next-line complexity
export const parseTraceParent = (header: string): TraceContext | null => {
  const cleanHeader = header.trim();
  const match = cleanHeader.match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i);
  if (!match) return null;

  return {
    traceId: match[1].toLowerCase(),
    spanId: match[2].toLowerCase(),
    sampled: match[3] === "01",
  };
};

/**
 * Formats a TraceContext into a W3C traceparent header value.
 */
export const formatTraceParent = (ctx: TraceContext): string => {
  return `00-${ctx.traceId.toLowerCase()}-${ctx.spanId.toLowerCase()}-${ctx.sampled ? "01" : "00"}`;
};

/**
 * Converts a 32-character hex string into standard 36-character UUID format.
 * Example: f81d4fae7dec11d0a76500a0c91e6bf6 -> f81d4fae-7dec-11d0-a765-00a0c91e6bf6
 */
export const hexToUuid = (hex: string): string => {
  const cleanHex = hex.replace(/-/g, "").toLowerCase();
  if (cleanHex.length !== 32) {
    throw new Error(`Invalid hex length for UUID conversion: ${cleanHex.length}`);
  }

  return `${cleanHex.slice(0, 8)}-${cleanHex.slice(8, 12)}-${cleanHex.slice(12, 16)}-${cleanHex.slice(16, 20)}-${cleanHex.slice(20, 32)}`;
};

/**
 * Converts a 36-character UUID string back into a 32-character hex string.
 */
export const uuidToHex = (uuid: string): string => {
  return uuid.replace(/-/g, "").toLowerCase();
};

/**
 * Converts a 16-character hex spanId into a database-compatible UUID string by padding it.
 * Example: 1234567890abcdef -> 12345678-90ab-cdef-0000-000000000000
 */
export const spanIdToUuid = (spanId: string): string => {
  const cleanSpanId = spanId.replace(/-/g, "").toLowerCase();
  if (cleanSpanId.length !== 16) {
    throw new Error(`Invalid spanId length for UUID conversion: ${cleanSpanId.length}`);
  }

  const paddedHex = cleanSpanId.padEnd(32, "0");
  return hexToUuid(paddedHex);
};

/**
 * Extracts a 16-character hex spanId from a padded database UUID.
 */
// fallow-ignore-next-line unused-export
export const uuidToSpanId = (uuid: string): string => {
  const hex = uuidToHex(uuid);
  return hex.slice(0, 16);
};
