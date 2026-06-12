import { createTracer, flushTracer, requireContext, sleep } from "./_helpers";

const producerTracer = createTracer("checkout-producer");
const workerTracer = createTracer("fulfillment-worker");

type FakeMessage = {
  context: {
    traceId: string;
    spanId: string;
  };
  payload: {
    shipmentId: string;
  };
};

async function publishFakeMessage(): Promise<FakeMessage> {
  await sleep(5);

  return {
    context: requireContext(producerTracer.extractContext()),
    payload: {
      shipmentId: "ship_demo_001",
    },
  };
}

async function consumeFakeMessage(message: FakeMessage): Promise<void> {
  const parentSpan = workerTracer.injectContext(message.context);

  await workerTracer.run(parentSpan, async () => {
    await workerTracer.trace("worker.consume-shipment", async (span) => {
      span.setAttribute("shipment.id", message.payload.shipmentId);

      await workerTracer.trace("worker.allocate-carrier", async (childSpan) => {
        childSpan.setAttribute("carrier", "fake-express");
        await sleep(20);
      });
    });
  });
}

export async function runMessageQueueExample(): Promise<void> {
  await producerTracer.trace(
    "checkout.publish-shipment",
    async (span) => {
      span.setAttribute("workflow", "message-queue");
      const message = await publishFakeMessage();
      await consumeFakeMessage(message);
    },
    {
      traceName: "Async Queue Demo",
      importanceLabels: {
        0: "request",
        1: "worker-hop",
        2: "detail",
      },
    },
  );

  await flushTracer(producerTracer);
  await flushTracer(workerTracer);
}

if (import.meta.main) {
  runMessageQueueExample().catch(async (error) => {
    console.error("[message-queue example] failed", error);
    await flushTracer(producerTracer);
    await flushTracer(workerTracer);
  });
}
