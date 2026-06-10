import app from "./index";

const port = Number(process.env.PORT || 3999);

console.log(`[Bun] Starting Topo-Tracer Hono server on port ${port}...`);

const server = Bun.serve({
  fetch: app.fetch,
  port,
});

console.log(`[Bun] Hono server is running at ${server.url}`);
