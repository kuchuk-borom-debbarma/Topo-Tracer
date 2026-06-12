import { createTracer, flushTracer, sleep } from "./_helpers";

const tracer = createTracer("error-example-service");

export async function runErrorHandlingExample(): Promise<void> {
  try {
    await tracer.trace(
      "payment-root",
      async (span) => {
        span.setAttribute("payment.id", "pay_demo_001");

        await tracer.trace("payment-authorize", async (childSpan) => {
          childSpan.setAttribute("provider", "fake-gateway");
          await sleep(15);
          throw new Error("simulated authorization decline");
        });
      },
      {
        traceName: "Payment Failure Demo",
        importanceLabels: {
          0: "request",
          1: "critical-step",
          2: "detail",
        },
      },
    );
  } catch (error) {
    console.error("[error-handling example] expected failure", error);
  } finally {
    await flushTracer(tracer);
  }
}

if (import.meta.main) {
  runErrorHandlingExample().catch(async (error) => {
    console.error("[error-handling example] unexpected failure", error);
    await flushTracer(tracer);
  });
}
