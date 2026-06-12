import { promptForApiKey } from "./_helpers";

type DemoStep = {
  name: string;
  run: () => Promise<void>;
};

async function loadSteps(): Promise<DemoStep[]> {
  const [
    basic,
    asyncFanout,
    distributed,
    messageQueue,
    errorHandling,
  ] = await Promise.all([
    import("./basic"),
    import("./async-fanout"),
    import("./distributed/client"),
    import("./message-queue"),
    import("./error-handling"),
  ]);

  return [
    { name: "basic", run: basic.runBasicExample },
    { name: "async-fanout", run: asyncFanout.runAsyncFanoutExample },
    { name: "distributed-rpc", run: distributed.runDistributedClientExample },
    { name: "message-queue", run: messageQueue.runMessageQueueExample },
    { name: "error-handling", run: errorHandling.runErrorHandlingExample },
  ];
}

export async function runEndToEndDemo(): Promise<void> {
  const apiKey = await promptForApiKey();
  process.env.TOPO_TRACER_API_KEY = apiKey;

  console.log("[end-to-end-demo] sending traces to", process.env.TOPO_TRACER_URL ?? "http://localhost:3000");
  console.log("[end-to-end-demo] user comes from the API key on the server side");

  const steps = await loadSteps();

  for (const step of steps) {
    console.log(`[end-to-end-demo] start ${step.name}`);
    await step.run();
    console.log(`[end-to-end-demo] done ${step.name}`);
  }
}

if (import.meta.main) {
  runEndToEndDemo().catch((error) => {
    console.error("[end-to-end-demo] failed", error);
    process.exitCode = 1;
  });
}
