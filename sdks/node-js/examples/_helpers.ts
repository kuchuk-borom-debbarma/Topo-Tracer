import { Tracer } from "../src";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const DEFAULT_ENDPOINT = process.env.TOPO_TRACER_URL ?? "http://localhost:3000";

export function createTracer(
  serviceName: string,
  overrides?: {
    apiKey?: string;
    userId?: string;
  },
): Tracer {
  return new Tracer({
    endpoint: DEFAULT_ENDPOINT,
    apiKey: overrides?.apiKey ?? process.env.TOPO_TRACER_API_KEY ?? "dev-key",
    userId: overrides?.userId ?? process.env.TOPO_TRACER_USER_ID,
    serviceName,
    batchSize: 50,
    flushInterval: 0,
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function requireContext(context: {
  traceId?: string;
  spanId?: string;
}): {
  traceId: string;
  spanId: string;
} {
  if (!context.traceId || !context.spanId) {
    throw new Error("missing active trace context");
  }

  return {
    traceId: context.traceId,
    spanId: context.spanId,
  };
}

export async function flushTracer(tracer: Tracer): Promise<void> {
  await tracer.flush();
}

export async function promptForApiKey(): Promise<string> {
  const rl = readline.createInterface({ input, output });

  try {
    const apiKey = (await rl.question("Topo-Tracer API key: ")).trim();
    if (!apiKey) {
      throw new Error("API key is required");
    }

    return apiKey;
  } finally {
    rl.close();
  }
}
