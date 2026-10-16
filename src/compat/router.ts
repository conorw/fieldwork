import { goto } from "$app/navigation";
import { page } from "$app/state";

type Query = Record<string, string | string[] | null | undefined>;

interface RouteTarget {
  name?: string;
  path?: string;
  params?: Record<string, string | undefined>;
  query?: Query;
}

interface RouteMeta {
  requiresAuth: boolean;
  requiresLocation: boolean;
  hideNavbar: boolean;
  name: string;
}

const ROUTES: Array<RouteMeta & { pattern: RegExp; build: (params: Record<string, string | undefined>) => string }> = [
  { pattern: /^\/auth\/callback$/, name: "AuthCallback", requiresAuth: false, requiresLocation: false, hideNavbar: true, build: () => "/auth/callback" },
  { pattern: /^\/auth$/, name: "Auth", requiresAuth: false, requiresLocation: false, hideNavbar: true, build: () => "/auth" },
  { pattern: /^\/onboarding$/, name: "Onboarding", requiresAuth: true, requiresLocation: false, hideNavbar: false, build: () => "/onboarding" },
  { pattern: /^\/plots\/[^/]+$/, name: "PlotDetail", requiresAuth: true, requiresLocation: true, hideNavbar: false, build: (params) => `/plots/${params.id || ""}` },
  { pattern: /^\/plots$/, name: "Plots", requiresAuth: true, requiresLocation: true, hideNavbar: false, build: () => "/plots" },
  { pattern: /^\/locations\/[^/]+\/settings$/, name: "LocationSettings", requiresAuth: true, requiresLocation: false, hideNavbar: false, build: (params) => `/locations/${params.id || ""}/settings` },
  { pattern: /^\/locations$/, name: "Locations", requiresAuth: true, requiresLocation: false, hideNavbar: false, build: () => "/locations" },
  { pattern: /^\/settings$/, name: "Settings", requiresAuth: true, requiresLocation: true, hideNavbar: false, build: () => "/settings" },
  { pattern: /^\/dev\/vision-eval$/, name: "VisionEval", requiresAuth: true, requiresLocation: false, hideNavbar: false, build: () => "/dev/vision-eval" },
  { pattern: /^\/dev\/onboarding-demo$/, name: "OnboardingDemo", requiresAuth: false, requiresLocation: false, hideNavbar: true, build: () => "/dev/onboarding-demo" },
  { pattern: /^\/dev\/onboarding-fone-demo$/, name: "OnboardingFoneDemo", requiresAuth: false, requiresLocation: false, hideNavbar: true, build: () => "/dev/onboarding-fone-demo" },
  { pattern: /^\/dev\/usage-demo$/, name: "UsageScenariosDemo", requiresAuth: false, requiresLocation: false, hideNavbar: true, build: () => "/dev/usage-demo" },
  { pattern: /^\/$/, name: "Map", requiresAuth: true, requiresLocation: true, hideNavbar: false, build: () => "/" },
];

function matchRoute(pathname: string) {
  return ROUTES.find((route) => route.pattern.test(pathname)) || ROUTES[ROUTES.length - 1];
}

export function hideNavbar(pathname: string) {
  return matchRoute(pathname).hideNavbar;
}

function queryString(query?: Query) {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === "") continue;
    params.set(key, Array.isArray(value) ? value[0] : String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function resolveTarget(to: string | RouteTarget) {
  if (typeof to === "string") return to;
  let path = to.path;
  if (!path && to.name) {
    const named = ROUTES.find((route) => route.name === to.name);
    path = named ? named.build(to.params || {}) : "/";
  }
  if (!path) path = page.url.pathname;
  return path.split("?")[0] + queryString(to.query);
}

function liveRoute() {
  return {
    get path() {
      return page.url.pathname;
    },
    get fullPath() {
      return page.url.pathname + page.url.search;
    },
    get params() {
      return page.params;
    },
    get query() {
      return Object.fromEntries(page.url.searchParams.entries());
    },
    get meta() {
      return matchRoute(page.url.pathname);
    },
    get name() {
      return matchRoute(page.url.pathname).name;
    },
  };
}

export function useRoute() {
  return liveRoute();
}

export function useRouter() {
  return {
    push(to: string | RouteTarget) {
      return goto(resolveTarget(to));
    },
    replace(to: string | RouteTarget) {
      return goto(resolveTarget(to), { replaceState: true });
    },
    back() {
      history.back();
    },
    get currentRoute() {
      return { value: liveRoute() };
    },
  };
}

export async function routeGuard(
  pathname: string,
  search: string,
  authStore: {
    init: () => Promise<void>;
    isAuthenticated: boolean;
    checkUserHasLocations: () => Promise<boolean>;
  },
) {
  await authStore.init();
  const meta = matchRoute(pathname);
  if (meta.requiresAuth && !authStore.isAuthenticated) {
    return `/auth?redirect=${encodeURIComponent(pathname + search)}`;
  }
  if (pathname === "/auth" && authStore.isAuthenticated) {
    const hasLocations = await authStore.checkUserHasLocations();
    return hasLocations ? "/" : "/onboarding";
  }
  if (meta.requiresLocation && authStore.isAuthenticated) {
    const hasLocations = await authStore.checkUserHasLocations();
    if (!hasLocations) return "/onboarding";
  }
  return null;
}
