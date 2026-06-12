import { createTracer, flushTracer, sleep } from "./_helpers";

const tracer = createTracer("async-fanout-service");

async function loadBranch(branchName: string, delayMs: number, importanceLevel: number): Promise<void> {
  const span = tracer.startNode({
    name: `fanout:${branchName}`,
    type: "fanout-task",
    importanceLevel,
  });

  await tracer.run(span, async () => {
    try {
      span.setAttribute("branch", branchName);
      span.setAttribute("delay.ms", delayMs);

      await sleep(delayMs);

      await tracer.trace(
        `fanout:${branchName}:post-process`,
        async (childSpan) => {
          childSpan.setAttribute("branch", branchName);
          await sleep(10);
        },
      );
      span.end("fanout branch done");
    } catch (error) {
      span.end(error instanceof Error ? error.message : String(error));
      throw error;
    }
  });
}

export async function runAsyncFanoutExample(): Promise<void> {
  await tracer.trace(
    "async-root",
    async (rootSpan) => {
      rootSpan.setAttribute("fanout.count", 3);

      await Promise.all([
        loadBranch("inventory", 30, 1),
        loadBranch("pricing", 45, 1),
        loadBranch("recommendations", 20, 2),
      ]);
    },
    {
      traceName: "Async Fanout Demo",
      importanceLabels: {
        0: "request",
        1: "parallel-work",
        2: "detail",
      },
    },
  );

  await flushTracer(tracer);
}

if (import.meta.main) {
  runAsyncFanoutExample().catch(async (error) => {
    console.error("[async-fanout example] failed", error);
    await flushTracer(tracer);
  });
}
