import { createRouter, createWebHistory } from "vue-router";
import MapView from "../views/MapView.vue";
import PlotsView from "../views/PlotsView.vue";
import PlotDetail from "../views/PlotDetail.vue";
import LocationsView from "../views/Locations.vue";
import Settings from "../views/Settings.vue";
import Auth from "../views/Auth.vue";
import AuthCallback from "../views/AuthCallback.vue";
import Onboarding from "../views/Onboarding.vue";
import { useAuthStore } from "../stores/auth";

const routes = [
  {
    path: "/auth",
    name: "Auth",
    component: Auth,
    meta: { requiresAuth: false, hideNavbar: true },
  },
  {
    path: "/auth/callback",
    name: "AuthCallback",
    component: AuthCallback,
    meta: { requiresAuth: false, hideNavbar: true },
  },
  {
    path: "/onboarding",
    name: "Onboarding",
    component: Onboarding,
    meta: { requiresAuth: true, requiresLocation: false },
  },
  {
    path: "/",
    name: "Map",
    component: MapView,
    meta: { requiresAuth: true, requiresLocation: true },
  },
  {
    path: "/plots",
    name: "Plots",
    component: PlotsView,
    meta: { requiresAuth: true, requiresLocation: true },
  },
  {
    path: "/plots/:id",
    name: "PlotDetail",
    component: PlotDetail,
    props: true,
    meta: { requiresAuth: true, requiresLocation: true },
  },
  {
    path: "/locations",
    name: "Locations",
    component: LocationsView,
    meta: { requiresAuth: true },
  },
  {
    path: "/locations/:id/settings",
    name: "LocationSettings",
    component: () => import("../views/LocationSettings.vue"),
    props: true,
    meta: { requiresAuth: true },
  },
  {
    path: "/settings",
    name: "Settings",
    component: Settings,
    meta: { requiresAuth: true, requiresLocation: true },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Navigation guard
router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore();

  // Ensure auth is initialized (this should already be done in main.ts, but ensure it here too)
  await authStore.init();

  // Check if route requires authentication
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next({ name: "Auth", query: { redirect: to.fullPath } });
    return;
  }

  // Redirect authenticated users away from auth page
  if (to.name === "Auth" && authStore.isAuthenticated) {
    const hasLocations = await authStore.checkUserHasLocations();
    next(hasLocations ? "/" : "/onboarding");
    return;
  }

  // Check if route requires location membership
  if (to.meta.requiresLocation && authStore.isAuthenticated) {
    const hasLocations = await authStore.checkUserHasLocations();
    if (!hasLocations) {
      next("/onboarding");
      return;
    }
  }

  next();
});

export default router;
