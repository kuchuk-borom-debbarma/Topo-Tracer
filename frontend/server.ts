const root = new URL(".", import.meta.url);
const port = Number(process.env.PORT || 5173);

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function typeFor(pathname: string) {
  const ext = pathname.match(/\.[^.]+$/)?.[0] || ".html";
  return contentTypes[ext] || "application/octet-stream";
}

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const fileUrl = new URL(`.${pathname}`, root);
    const file = Bun.file(fileUrl);

    if (!(await file.exists())) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(file, {
      headers: {
        "Content-Type": typeFor(pathname),
        "Cache-Control": "no-store",
      },
    });
  },
});

console.log(`Topo-Tracer web app running at http://localhost:${port}`);
