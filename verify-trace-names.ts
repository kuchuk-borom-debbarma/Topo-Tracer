import { Tracer } from "./sdks/node-js/src";
import { randomUUID } from "crypto";

async function verify() {
  console.log("🚀 Starting E2E Trace Name Verification...");

  const ENDPOINT = process.env.BACKEND_URL || "http://localhost:3333";
  const USER_ID = "test-user-e2e";
  const API_KEY = "test-api-key";

  const tracer = new Tracer({
    endpoint: ENDPOINT,
    apiKey: API_KEY,
    userId: USER_ID,
    batchSize: 1,
    flushInterval: 0,
  });

  // 1. Send named trace
  const namedTraceId = randomUUID();
  const traceName = "E2E Verification Trace " + namedTraceId.slice(0, 8);
  console.log("📡 Sending named trace: " + traceName + " (" + namedTraceId + ")");
  
  await tracer.trace("Root Op", async () => {
    // No-op
  }, { traceName });
  await tracer.flush();

  // 2. Send unnamed trace
  const unnamedTraceId = randomUUID();
  console.log("📡 Sending unnamed trace: (" + unnamedTraceId + ")");
  
  await tracer.trace("Unnamed Root", async () => {
    // No-op
  });
  await tracer.flush();

  console.log("⏳ Waiting for materialization (5s)...");
  await new Promise(r => setTimeout(r, 5000));

  // 3. Verify via API
  console.log("🔍 Fetching traces from " + ENDPOINT + "...");
  try {
    const response = await fetch(ENDPOINT + "/api/v1/traces", {
      headers: {
        "X-API-Key": API_KEY,
        "X-User-Id": USER_ID,
      }
    });

    if (!response.ok) {
      throw new Error("API failed: " + response.statusText);
    }

    const data = await response.json();
    const traces = data.traces || [];

    const foundNamed = traces.find(t => t.traceId === namedTraceId);
    const foundUnnamed = traces.find(t => t.traceId === unnamedTraceId);

    if (foundNamed) {
      console.log("✅ Named trace found! Name: " + foundNamed.name);
      if (foundNamed.name !== traceName) {
        console.error("❌ Name mismatch! Expected: " + traceName + ", Got: " + foundNamed.name);
      }
    } else {
      console.warn("⚠️ Named trace not found yet (materialization might be slow)");
    }

    if (foundUnnamed) {
      console.log("✅ Unnamed trace found! Name fallback: " + foundUnnamed.name);
      if (foundUnnamed.name !== unnamedTraceId) {
        console.error("❌ Fallback mismatch! Expected: " + unnamedTraceId + ", Got: " + foundUnnamed.name);
      }
    } else {
      console.warn("⚠️ Unnamed trace not found yet");
    }

    console.log("\n✨ E2E Verification Script Finished.");
  } catch (err) {
    console.error("❌ Verification failed:", err.message);
    console.log("Note: This script requires a running backend at http://localhost:3333");
  }
}

verify();
