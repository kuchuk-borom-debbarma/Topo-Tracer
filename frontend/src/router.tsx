import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
} from "@tanstack/react-router";
import { isAuthenticated } from "./auth";

const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: () => (
    <main className="route-error">
      <span>404</span>
      <h1>This route is not in the trace.</h1>
      <a href="/traces">Return to explorer</a>
    </main>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({
      to: isAuthenticated() ? "/traces" : "/login",
      search: isAuthenticated() ? { page: 1 } : undefined,
    });
  },
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: () => {
    if (isAuthenticated()) {
      throw redirect({ to: "/traces", search: { page: 1 } });
    }
  },
  component: lazyRouteComponent(() => import("./ui/LoginPage"), "LoginPage"),
});

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "authenticated",
  beforeLoad: () => {
    if (!isAuthenticated()) throw redirect({ to: "/login" });
  },
  component: lazyRouteComponent(() => import("./ui/AppShell"), "AppShell"),
});

const tracesRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/traces",
  validateSearch: (search: Record<string, unknown>) => ({
    page: positiveInteger(search.page, 1),
  }),
  component: lazyRouteComponent(() => import("./ui/TraceListPage"), "TraceListPage"),
});

const traceDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/traces/$traceId",
  validateSearch: (search: Record<string, unknown>) => ({
    threshold: nonNegativeInteger(search.threshold, 0),
    cursor: typeof search.cursor === "string" && search.cursor ? search.cursor : undefined,
  }),
  component: lazyRouteComponent(() => import("./ui/TraceDetailPage"), "TraceDetailPage"),
});

const apiKeysRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/settings/api-keys",
  component: lazyRouteComponent(() => import("./ui/ApiKeysPage"), "ApiKeysPage"),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
    authenticatedRoute.addChildren([
      tracesRoute,
      traceDetailRoute,
      apiKeysRoute,
    ]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}
