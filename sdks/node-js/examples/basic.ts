import { createTracer, flushTracer, sleep } from "./_helpers";

const tracer = createTracer("basic-example-service");

export async function runBasicExample(): Promise<void> {
  await tracer.trace(
    "checkout-request",
    async (rootSpan) => {
      rootSpan.setAttribute("trace.kind", "basic");
      rootSpan.setAttribute("customer.id", "cust_demo_001");

      await tracer.trace(
        "load-cart",
        async (childSpan) => {
          childSpan.setAttribute("importance.label", "work");
          childSpan.setAttribute("storage.kind", "cache");
          await sleep(25);
        },
        {},
      );

      const manualSpan = tracer.createSpan("manual-discount-check", {
        type: "rule-engine",
        importanceLevel: 2,
      });
      manualSpan.setAttribute("discount.code", "SUMMER-FAKE");
      await sleep(15);
      manualSpan.end("manual span completed");
    },
    {
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
