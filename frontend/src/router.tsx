import { createRouter, createRoute, createRootRoute } from "@tanstack/react-router";
import { RootLayout } from "./layouts/RootLayout";
import { TracesListPage } from "./pages/TracesListPage";
import { TraceDetailPage } from "./pages/TraceDetailPage";

// ── Root route ────────────────────────────────────────────────
const rootRoute = createRootRoute({ component: RootLayout });

// ── Child routes ──────────────────────────────────────────────
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: TracesListPage,
});

export const traceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/trace/$traceId",
  component: TraceDetailPage,
});

// ── Route tree ────────────────────────────────────────────────
const routeTree = rootRoute.addChildren([indexRoute, traceRoute]);

// ── Router ────────────────────────────────────────────────────
export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
