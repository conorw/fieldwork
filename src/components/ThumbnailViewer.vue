<template>
  <div v-if="images && images.length > 0" class="mb-3">
    <div class="flex space-x-2 overflow-x-auto">
      <div v-for="image in images.slice(0, maxThumbnails)" :key="image.id"
        class="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-gray-200 relative group">
        <img :src="getImageUrl(image)" :alt="imageAlt || 'Photo'"
          class="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
          @click="handleImageClick(image)" />


        <!-- Hover overlay for additional actions -->
        <div v-if="showHoverActions || showDeleteButton"
          class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 flex items-center justify-center">
          <div class="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex space-x-2">
            <!-- View/Expand button -->
            <button v-if="showHoverActions" @click.stop="handleImageClick(image)"
              class="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </button>

            <!-- Delete button -->
            <button v-if="showDeleteButton" @click.stop="handleDeleteClick(image)"
              class="bg-red-600 text-white p-2 rounded-full hover:bg-red-700 transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Show more indicator -->
      <div v-if="images.length > maxThumbnails"
        class="flex-shrink-0 w-16 h-16 rounded-lg border border-gray-200 flex items-center justify-center bg-gray-100">
        <span class="text-xs text-gray-500">+{{ images.length - maxThumbnails }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { base64ToBlob } from '../powersync-schema'

interface ImageData {
  id: string
  thumbnail_data?: string
  cloud_url?: string
  data?: string // Legacy fallback
}

interface Props {
  images: ImageData[] | null | undefined
  title?: string
  maxThumbnails?: number
  imageAlt?: string
  showQualityIndicator?: boolean
  showHoverActions?: boolean
  showDeleteButton?: boolean
  deleteConfirmMessage?: string
}

interface Emits {
  (e: 'imageClick', image: ImageData): void
  (e: 'imageHover', image: ImageData): void
  (e: 'imageDelete', image: ImageData): void
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Photos',
  maxThumbnails: 3,
  imageAlt: 'Photo',
  showQualityIndicator: true,
  showHoverActions: false,
  showDeleteButton: false,
  deleteConfirmMessage: 'Are you sure you want to delete this image?'
})

const emit = defineEmits<Emits>()

const getImageUrl = (image: ImageData): string => {
  if (!image) return ''

  // Priority 1: Use thumbnail_data if available (fastest, smallest)
  if (image.thumbnail_data) {
    return `data:image/jpeg;base64,${image.thumbnail_data}`
  }

  // Priority 2: Use cloud_url as thumbnail fallback (if no thumbnail_data)
  // This ensures images are still visible even if thumbnail generation failed
  if (image.cloud_url) {
    return image.cloud_url
  }

  // Priority 3: Fallback to legacy data field
  if (image.data) {
    if (image.data.startsWith('data:')) {
      return image.data
    }
    try {
      const blob = base64ToBlob(image.data, 'image/jpeg')
      return URL.createObjectURL(blob)
    } catch (error) {
      console.error('Error creating image URL:', error)
      return ''
    }
  }

  return ''
}

const handleImageClick = (image: ImageData) => {
  emit('imageClick', image)
}

const handleDeleteClick = (image: ImageData) => {
  if (confirm(props.deleteConfirmMessage)) {
    emit('imageDelete', image)
  }
}
</script>
