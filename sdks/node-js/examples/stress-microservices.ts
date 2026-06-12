import type { Tracer } from "../src";
import { createTracer, flushTracer, promptForApiKey } from "./_helpers";

const IMPORTANCE_LABELS = {
  0: "critical-path",
  1: "request",
  2: "service-hop",
  3: "fanout",
  4: "io",
  5: "cache",
  6: "analytics",
  7: "audit",
  8: "noise-floor",
} satisfies Record<number, string>;

async function runSpan(
  tracer: Tracer,
  name: string,
  options: {
    type: string;
    importanceLevel: number;
    data?: Record<string, string>;
    traceName?: string;
    importanceLabels?: Record<number, string>;
  },
  fn?: () => Promise<void>,
): Promise<void> {
  const span = tracer.startNode({
    name,
    type: options.type,
    importanceLevel: options.importanceLevel,
    data: options.data,
    traceName: options.traceName,
    importanceLabels: options.importanceLabels,
  });

  await tracer.run(span, async () => {
    try {
      if (fn) {
        await fn();
      }
      span.end("ok");
    } catch (error) {
      span.end(error instanceof Error ? error.message : String(error));
      throw error;
    }
  });
}

async function simulateOrder(tracer: Tracer, orderIndex: number): Promise<void> {
  const orderId = `ord_stress_${String(orderIndex).padStart(3, "0")}`;
  const region = ["us-east", "eu-west", "ap-south"][orderIndex % 3]!;

  await runSpan(tracer, `checkout.order.${orderId}`, {
    type: "order-request",
    importanceLevel: 1,
    data: {
      orderId,
      region,
    },
  }, async () => {
    await runSpan(tracer, "validate.session", {
      type: "auth",
      importanceLevel: 2,
      data: { orderId },
    });

    await runSpan(tracer, "load.customer-profile", {
      type: "profile-read",
      importanceLevel: 3,
      data: { orderId },
    });

    await runSpan(tracer, "load.cart-state", {
      type: "cart-read",
      importanceLevel: 3,
      data: { orderId },
    });

    for (const service of [
      "pricing.catalog",
      "pricing.promotions",
      "pricing.tax",
      "pricing.currency",
      "pricing.contracts",
      "pricing.bundle-rules",
      "pricing.loyalty",
      "pricing.finalize",
    ]) {
      await runSpan(tracer, service, {
        type: "pricing-call",
        importanceLevel: 3,
        data: { orderId, service },
      });
    }

    for (const warehouse of [
      "iad-a",
      "iad-b",
      "dub-c",
      "sin-d",
      "bom-e",
      "fra-f",
    ]) {
      await runSpan(tracer, `inventory.reserve.${warehouse}`, {
        type: "inventory-call",
        importanceLevel: 2,
        data: { orderId, warehouse },
      });
    }

    for (const model of [
      "fraud.velocity",
      "fraud.identity",
      "fraud.geo",
      "fraud.device",
    ]) {
      await runSpan(tracer, model, {
        type: "fraud-model",
        importanceLevel: 4,
        data: { orderId, model },
      });
    }

    for (const paymentStep of [
      "payment.tokenize",
      "payment.authorize",
      "payment.capture-prep",
    ]) {
      await runSpan(tracer, paymentStep, {
        type: "payment-call",
        importanceLevel: paymentStep === "payment.authorize" ? 0 : 2,
        data: { orderId, paymentStep },
      });
    }

    for (const carrier of [
      "shipping.quote.ups",
      "shipping.quote.fedex",
      "shipping.quote.dhl",
      "shipping.quote.local",
    ]) {
      await runSpan(tracer, carrier, {
        type: "shipping-call",
        importanceLevel: 4,
        data: { orderId, carrier },
      });
    }

    for (const recommender of [
      "recs.home-feed",
      "recs.cross-sell",
      "recs.upsell",
      "recs.risk-exclusions",
    ]) {
      await runSpan(tracer, recommender, {
        type: "recommendation-call",
        importanceLevel: 6,
        data: { orderId, recommender },
      });
    }

    for (const persistence of [
      "db.write.order",
      "db.write.line-items",
      "db.write.payment-intent",
      "stream.publish.order-created",
    ]) {
      await runSpan(tracer, persistence, {
        type: "persistence-step",
        importanceLevel: 2,
        data: { orderId, persistence },
      });
    }

    for (const auditTask of [
      "audit.customer-journey",
      "audit.inventory-reservation",
      "audit.payment-envelope",
      "analytics.checkout-kpi",
    ]) {
      await runSpan(tracer, auditTask, {
        type: "audit-step",
        importanceLevel: 7,
        data: { orderId, auditTask },
      });
    }
  });
}

export async function runStressMicroservicesExample(apiKey?: string): Promise<void> {
  const effectiveApiKey = apiKey ?? process.env.TOPO_TRACER_API_KEY ?? await promptForApiKey();
  const tracer = createTracer("stress-microservices-service", { apiKey: effectiveApiKey });

  try {
    await runSpan(tracer, "checkout.megaflow.day-batch", {
      type: "batch-root",
      importanceLevel: 0,
      traceName: "Marketplace Checkout Megaflow",
      importanceLabels: IMPORTANCE_LABELS,
      data: {
        scenario: "500-node-stress",
        tenant: "marketplace-demo",
      },
    }, async () => {
      for (const rootTask of [
        "bootstrap.feature-flags",
        "bootstrap.exchange-rates",
        "bootstrap.catalog-snapshot",
        "bootstrap.inventory-topology",
        "bootstrap.payment-routing",
        "bootstrap.fraud-thresholds",
        "bootstrap.delivery-sla-cache",
      ]) {
        await runSpan(tracer, rootTask, {
          type: "bootstrap-task",
          importanceLevel: 5,
          data: { rootTask },
        });
      }

      for (let orderIndex = 1; orderIndex <= 12; orderIndex += 1) {
        await simulateOrder(tracer, orderIndex);
      }
    });
  } finally {
    await flushTracer(tracer);
  }
}

if (import.meta.main) {
  runStressMicroservicesExample().catch((error) => {
    console.error("[stress-microservices example] failed", error);
    process.exitCode = 1;
  });
}
