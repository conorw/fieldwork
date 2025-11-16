<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="bg-white rounded-lg shadow p-6">
      <h2 class="text-xl font-semibold text-gray-900 mb-4">Image Storage Migration</h2>
      <p class="text-sm text-gray-600 mb-4">
        Migrate existing images to the new hybrid storage system for better performance and reduced database size.
      </p>
      
      <!-- Statistics -->
      <div v-if="stats" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-blue-50 p-4 rounded-lg">
          <div class="text-2xl font-bold text-blue-600">{{ stats.total }}</div>
          <div class="text-sm text-blue-800">Total Images</div>
        </div>
        <div class="bg-green-50 p-4 rounded-lg">
          <div class="text-2xl font-bold text-green-600">{{ stats.hybrid }}</div>
          <div class="text-sm text-green-800">Hybrid Storage</div>
        </div>
        <div class="bg-yellow-50 p-4 rounded-lg">
          <div class="text-2xl font-bold text-yellow-600">{{ stats.legacy }}</div>
          <div class="text-sm text-yellow-800">Legacy Storage</div>
        </div>
        <div class="bg-purple-50 p-4 rounded-lg">
          <div class="text-2xl font-bold text-purple-600">{{ formatFileSize(stats.estimatedSavings) }}</div>
          <div class="text-sm text-purple-800">Est. Savings</div>
        </div>
      </div>
    </div>

    <!-- Migration Controls -->
    <div class="bg-white rounded-lg shadow p-6">
      <h3 class="text-lg font-medium text-gray-900 mb-4">Migration Controls</h3>
      
      <!-- Progress Bar -->
      <div v-if="migrationStatus.isRunning" class="mb-6">
        <div class="flex justify-between text-sm text-gray-600 mb-2">
          <span>Migrating images...</span>
          <span>{{ migrationStatus.progress.processed }} / {{ migrationStatus.progress.total }}</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-2">
          <div 
            class="bg-blue-600 h-2 rounded-full transition-all duration-300"
            :style="{ width: `${(migrationStatus.progress.processed / migrationStatus.progress.total) * 100}%` }"
          ></div>
        </div>
        <div class="mt-2 text-sm text-gray-600">
          <span class="text-green-600">{{ migrationStatus.progress.successful }} successful</span>
          <span class="mx-2">•</span>
          <span class="text-red-600">{{ migrationStatus.progress.failed }} failed</span>
        </div>
        <div v-if="migrationStatus.progress.currentImage" class="mt-2 text-sm text-gray-500">
          Currently processing: {{ migrationStatus.progress.currentImage }}
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex space-x-4">
        <button 
          @click="startMigration"
          :disabled="migrationStatus.isRunning || stats?.legacy === 0"
          class="btn-primary"
        >
          <svg v-if="migrationStatus.isRunning" class="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <svg v-else class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
          </svg>
          {{ migrationStatus.isRunning ? 'Migrating...' : 'Start Migration' }}
        </button>
        
        <button 
          @click="stopMigration"
          :disabled="!migrationStatus.isRunning"
          class="btn-secondary"
        >
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"></path>
          </svg>
          Stop Migration
        </button>
        
        <button 
          @click="refreshStats"
          :disabled="migrationStatus.isRunning"
          class="btn-secondary"
        >
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
          </svg>
          Refresh Stats
        </button>
      </div>
    </div>

    <!-- Error Log -->
    <div v-if="migrationStatus.progress.errors.length > 0" class="bg-white rounded-lg shadow p-6">
      <h3 class="text-lg font-medium text-gray-900 mb-4">Migration Errors</h3>
      <div class="space-y-2 max-h-64 overflow-y-auto">
        <div 
          v-for="(error, index) in migrationStatus.progress.errors" 
          :key="index"
          class="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800"
        >
          {{ error }}
        </div>
      </div>
    </div>

    <!-- Migration Options -->
    <div class="bg-white rounded-lg shadow p-6">
      <h3 class="text-lg font-medium text-gray-900 mb-4">Migration Options</h3>
      <div class="space-y-4">
        <div class="flex items-center">
          <input 
            id="skipExisting" 
            v-model="migrationOptions.skipExisting" 
            type="checkbox" 
            class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          >
          <label for="skipExisting" class="ml-2 text-sm text-gray-700">
            Skip images that are already migrated
          </label>
        </div>
        <div>
          <label for="batchSize" class="block text-sm font-medium text-gray-700 mb-1">
            Batch Size
          </label>
          <select 
            id="batchSize" 
            v-model="migrationOptions.batchSize" 
            class="input-field"
          >
            <option value="1">1 image at a time</option>
            <option value="3">3 images at a time</option>
            <option value="5">5 images at a time</option>
            <option value="10">10 images at a time</option>
          </select>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { usePowerSyncStore } from '../stores/powersync'
import { imageMigrationService } from '../utils/imageMigrationService'

const powerSyncStore = usePowerSyncStore()

// State
const stats = ref(null)
const migrationStatus = ref({
  isRunning: false,
  progress: {
    total: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    errors: []
  }
})

const migrationOptions = ref({
  skipExisting: true,
  batchSize: 5
})

// Methods
const refreshStats = async () => {
  if (!powerSyncStore.powerSync) return
  
  try {
    const { imageMigrationService } = await import('../utils/imageMigrationService')
    stats.value = await imageMigrationService.getImageStats(powerSyncStore.powerSync)
  } catch (error) {
    console.error('Error refreshing stats:', error)
  }
}

const startMigration = async () => {
  if (!powerSyncStore.powerSync) return
  
  try {
    const { imageMigrationService } = await import('../utils/imageMigrationService')
    
    await imageMigrationService.migrateImages(powerSyncStore.powerSync, {
      ...migrationOptions.value,
      onProgress: (progress) => {
        migrationStatus.value.progress = progress
      },
      onComplete: (progress) => {
        migrationStatus.value.isRunning = false
        migrationStatus.value.progress = progress
        refreshStats() // Refresh stats after completion
      },
      onError: (error) => {
        console.error('Migration error:', error)
      }
    })
  } catch (error) {
    console.error('Error starting migration:', error)
    migrationStatus.value.isRunning = false
  }
}

const stopMigration = () => {
  const { imageMigrationService } = require('../utils/imageMigrationService')
  imageMigrationService.stop()
  migrationStatus.value.isRunning = false
}

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// Initialize
onMounted(() => {
  refreshStats()
})
</script>
