<template>
  <div id="app">
    <!-- Auth routes render without layout -->
    <router-view v-if="isAuthRoute" />
    
    <!-- All other routes use MainLayout -->
    <MainLayout v-else />
    
    <!-- PrimeVue Toast Notifications (available for all routes) -->
    <Toast />
  </div>
</template>

<script setup>
import { computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "primevue/usetoast";
import Toast from "primevue/toast";
import MainLayout from "./components/layouts/MainLayout.vue";
import { toastService } from "./services/toastService";

const route = useRoute();
const toast = useToast();

const isAuthRoute = computed(() => {
  return route.meta.hideNavbar === true;
});

// Initialize global toast service for use outside component contexts
onMounted(() => {
  toastService.init(toast.add.bind(toast));
});

// Note: Service worker is automatically registered by Vite PWA plugin
// The service worker provides offline functionality and caching
</script>
