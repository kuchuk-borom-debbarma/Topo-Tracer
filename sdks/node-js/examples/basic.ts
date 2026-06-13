import { createTracer, flushTracer, sleep } from "./_helpers";
import { NodeType, Importance } from "../src";

const tracer = createTracer("basic-example-service");

export async function runBasicExample(): Promise<void> {
  await tracer.trace(
    "checkout-request",
    async (rootSpan) => {
      rootSpan.setAttribute("trace.kind", "basic");
      rootSpan.setAttribute("customer.id", "cust_demo_001");

      await tracer.trace(
        "load-cart-db",
        async (childSpan) => {
          childSpan.setAttribute("storage.kind", "cache");
          tracer.log("Cart found in cache", { cartId: "cart_123" });
          await sleep(25);
        },
        { type: NodeType.DB_CALL },
      );

      const manualSpan = tracer.createSpan("manual-discount-check", {
        type: NodeType.METHOD,
        importanceLevel: Importance.MEDIUM,
      });
      manualSpan.setAttribute("discount.code", "SUMMER-FAKE");
      tracer.log("Checked discount applicability", Importance.HIGH);
      await sleep(15);
      manualSpan.end("manual span completed");
    },
    {
      type: NodeType.CONTROLLER,
      traceName: "Checkout Flow Demo",
      importanceLabels: {
        0: "request",
        1: "work",
        2: "detail",
      },
    },
  );

  await flushTracer(tracer);
}

if (import.meta.main) {
  runBasicExample().catch(async (error) => {
    console.error("[basic example] failed", error);
    await flushTracer(tracer);
  });
}
