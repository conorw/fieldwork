<template>
  <div class="h-full overflow-y-auto p-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Settings & Storage</h1>
        <p class="text-sm text-gray-600">
          Manage app settings, data synchronization, and storage usage
        </p>
      </div>

      <div class="flex items-center space-x-4">
        <div class="text-sm">
          <span class="font-medium">Status:</span>
          <span :class="connectionStatusColor">{{ connectionStatus }}</span>
        </div>
        <button 
          @click="refreshStorageInfo"
          :disabled="loading"
          class="btn-secondary text-sm"
        >
          <svg class="w-4 h-4 mr-2" :class="{ 'animate-spin': loading }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>
    </div>

    <!-- Storage Overview -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-600">Total Storage</p>
            <p class="text-2xl font-bold text-gray-900">{{ formatBytes(storageSummary.totalSize) }}</p>
          </div>
          <div class="p-3 bg-blue-100 rounded-full">
            <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
          </div>
        </div>
        <p class="text-xs text-gray-500 mt-1">{{ storageSummary.totalItems }} items</p>
      </div>

      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-600">Database</p>
            <p class="text-2xl font-bold text-gray-900">{{ formatBytes(storageSummary.breakdown.database.size) }}</p>
          </div>
          <div class="p-3 bg-green-100 rounded-full">
            <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
          </div>
        </div>
        <p class="text-xs text-gray-500 mt-1">{{ storageSummary.breakdown.database.items }} tables</p>
      </div>

      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-600">Images</p>
            <p class="text-2xl font-bold text-gray-900">{{ formatBytes(storageSummary.breakdown.images.size) }}</p>
          </div>
          <div class="p-3 bg-purple-100 rounded-full">
            <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        </div>
        <p class="text-xs text-gray-500 mt-1">{{ storageSummary.breakdown.images.items }} collections</p>
      </div>

      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-600">Cache</p>
            <p class="text-2xl font-bold text-gray-900">{{ formatBytes(storageSummary.breakdown.cache.size) }}</p>
          </div>
          <div class="p-3 bg-yellow-100 rounded-full">
            <svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h1.586a1 1 0 01.707.293l1.414 1.414a1 1 0 00.707.293H19a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </div>
        </div>
        <p class="text-xs text-gray-500 mt-1">{{ storageSummary.breakdown.cache.items }} caches</p>
      </div>
    </div>

    <!-- Storage Breakdown -->
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-gray-900">Storage Breakdown</h2>
        <div class="flex space-x-2">
          <button 
            @click="clearAllCache"
            :disabled="loading"
            class="btn-secondary text-sm"
          >
            Clear Cache
          </button>
        </div>
      </div>

      <!-- Storage Type Breakdown -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div v-for="(breakdown, type) in storageSummary.breakdown" :key="type" 
             class="p-4 border border-gray-200 rounded-lg">
          <div class="flex items-center justify-between mb-2">
            <h3 class="font-medium text-gray-900 capitalize">{{ type }}</h3>
            <span class="text-sm text-gray-500">{{ breakdown.items }} items</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2 mb-2">
            <div 
              class="h-2 rounded-full"
              :class="getTypeColor(type)"
              :style="{ width: getPercentage(breakdown.size) + '%' }"
            ></div>
          </div>
          <p class="text-sm font-medium text-gray-900">{{ formatBytes(breakdown.size) }}</p>
        </div>
      </div>

      <!-- Detailed Storage Items -->
      <div class="space-y-2">
        <h3 class="font-medium text-gray-900 mb-3">Storage Details</h3>
        <div v-if="loading" class="text-center py-4">
          <div class="animate-spin inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          <p class="text-sm text-gray-500 mt-2">Loading storage information...</p>
        </div>
        <div v-else-if="storageSummary.items.length === 0" class="text-center py-4">
          <p class="text-sm text-gray-500">No storage data available</p>
        </div>
        <div v-else class="space-y-2">
          <div v-for="item in storageSummary.items" :key="item.name" 
               class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div class="flex items-center space-x-3">
              <div :class="getTypeIconClass(item.type)" class="p-2 rounded-full">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="getTypeIcon(item.type)" />
                </svg>
              </div>
              <div>
                <p class="font-medium text-gray-900">{{ item.name }}</p>
                <p class="text-sm text-gray-500">{{ item.description }}</p>
              </div>
            </div>
            <div class="flex items-center space-x-3">
              <span class="text-sm font-medium text-gray-900">{{ formatBytes(item.size) }}</span>
              <button 
                v-if="item.canClear"
                @click="clearStorageItem(item)"
                class="text-red-600 hover:text-red-800 text-sm"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Storage Tips -->
    <div class="card">
      <h2 class="text-lg font-semibold text-gray-900 mb-4">Storage Optimization Tips</h2>
      <div class="space-y-3">
        <div class="flex items-start space-x-3">
          <div class="p-1 bg-blue-100 rounded-full">
            <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p class="text-sm font-medium text-gray-900">Image Storage</p>
            <p class="text-sm text-gray-600">Images use hybrid storage with thumbnails and previews stored locally, full resolution in cloud storage.</p>
          </div>
        </div>
        <div class="flex items-start space-x-3">
          <div class="p-1 bg-green-100 rounded-full">
            <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p class="text-sm font-medium text-gray-900">Offline Database</p>
            <p class="text-sm text-gray-600">All plot and location data is stored locally for offline access and syncs when online.</p>
          </div>
        </div>
        <div class="flex items-start space-x-3">
          <div class="p-1 bg-yellow-100 rounded-full">
            <svg class="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div>
            <p class="text-sm font-medium text-gray-900">Cache Management</p>
            <p class="text-sm text-gray-600">Clear cache periodically to free up space. Map tiles and assets are cached for better performance.</p>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useOnline } from '@vueuse/core'
import { usePowerSyncStore } from '../stores/powersync'
import { storageAnalytics } from '../utils/storageAnalytics'
import type { StorageSummary } from '../utils/storageAnalytics'

const powerSyncStore = usePowerSyncStore()
const isOnline = useOnline()

// Storage analytics state
const loading = ref(false)
const storageSummary = ref<StorageSummary>({
  totalSize: 0,
  totalItems: 0,
  breakdown: {
    cache: { size: 0, items: 0 },
    database: { size: 0, items: 0 },
    assets: { size: 0, items: 0 },
    tiles: { size: 0, items: 0 },
    images: { size: 0, items: 0 },
    other: { size: 0, items: 0 }
  },
  items: []
})

// Computed properties
const connectionStatus = computed(() => {
  if (!isOnline.value) return 'Offline'
  if (!powerSyncStore.isInitialized) return 'Initializing'
  if (!powerSyncStore.powerSync) return 'Server Unavailable'
  return 'Connected'
})

const connectionStatusColor = computed(() => {
  if (!isOnline.value) return 'text-red-600'
  if (!powerSyncStore.isInitialized) return 'text-yellow-600'
  if (!powerSyncStore.powerSync) return 'text-yellow-600'
  return 'text-green-600'
})

// Storage analytics functions
const refreshStorageInfo = async () => {
  loading.value = true
  try {
    storageAnalytics.setPowerSyncStore(powerSyncStore)
    storageSummary.value = await storageAnalytics.getStorageSummary()
  } catch (error) {
    console.error('Error loading storage info:', error)
  } finally {
    loading.value = false
  }
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const getPercentage = (size: number): number => {
  if (storageSummary.value.totalSize === 0) return 0
  return Math.round((size / storageSummary.value.totalSize) * 100)
}

const getTypeColor = (type: string): string => {
  const colors = {
    cache: 'bg-yellow-500',
    database: 'bg-green-500',
    assets: 'bg-blue-500',
    tiles: 'bg-purple-500',
    images: 'bg-pink-500',
    other: 'bg-gray-500'
  }
  return colors[type as keyof typeof colors] || 'bg-gray-500'
}

const getTypeIconClass = (type: string): string => {
  const classes = {
    cache: 'bg-yellow-100 text-yellow-600',
    database: 'bg-green-100 text-green-600',
    assets: 'bg-blue-100 text-blue-600',
    tiles: 'bg-purple-100 text-purple-600',
    images: 'bg-pink-100 text-pink-600',
    other: 'bg-gray-100 text-gray-600'
  }
  return classes[type as keyof typeof classes] || 'bg-gray-100 text-gray-600'
}

const getTypeIcon = (type: string): string => {
  const icons = {
    cache: 'M5 8h14M5 8a2 2 0 110-4h1.586a1 1 0 01.707.293l1.414 1.414a1 1 0 00.707.293H19a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
    database: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4',
    assets: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z',
    tiles: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 4m0 13V4m-6 3l6-3',
    images: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
    other: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
  }
  return icons[type as keyof typeof icons] || icons.other
}

const clearStorageItem = async (item: any) => {
  if (confirm(`Are you sure you want to clear ${item.name}?`)) {
    try {
      await storageAnalytics.clearStorage(item.type)
      await refreshStorageInfo()
    } catch (error) {
      console.error('Error clearing storage:', error)
      alert('Failed to clear storage item')
    }
  }
}

const clearAllCache = async () => {
  if (confirm('Are you sure you want to clear all cache? This will remove cached assets and may affect performance.')) {
    try {
      await storageAnalytics.clearStorage('cache')
      await refreshStorageInfo()
    } catch (error) {
      console.error('Error clearing cache:', error)
      alert('Failed to clear cache')
    }
  }
}

onMounted(async () => {
  await refreshStorageInfo()
})
</script>