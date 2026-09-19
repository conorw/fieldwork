<template>
  <div v-if="images && images.length > 0" class="mb-3">
    <div class="flex space-x-2 overflow-x-auto">
      <div
        v-for="image in images.slice(0, maxThumbnails)"
        :key="image.id"
        class="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-surface-100 relative group"
      >
        <img
          v-if="resolveImageUrl(image)"
          :src="resolveImageUrl(image)"
          :alt="imageAlt || 'Photo'"
          class="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
          @click="handleImageClick(image)"
          @error="onImageError(image, $event)"
        />
        <div
          v-else
          class="w-full h-full flex items-center justify-center text-surface-400"
          title="Photo unavailable"
        >
          <i class="pi pi-image text-lg" />
        </div>

        <!-- Hover overlay for additional actions -->
        <div
          v-if="showHoverActions || showDeleteButton"
          class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-200 flex items-center justify-center pointer-events-none group-hover:pointer-events-auto"
        >
          <div
            class="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex space-x-2"
          >
            <!-- View/Expand button -->
            <button
              v-if="showHoverActions"
              @click.stop="handleImageClick(image)"
              class="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 transition-colors"
            >
              <svg
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            </button>

            <!-- Delete button -->
            <button
              v-if="showDeleteButton"
              @click.stop="handleDeleteClick(image)"
              class="bg-red-600 text-white p-2 rounded-full hover:bg-red-700 transition-colors"
            >
              <svg
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Show more indicator -->
      <div
        v-if="images.length > maxThumbnails"
        class="flex-shrink-0 w-16 h-16 rounded-lg border border-gray-200 flex items-center justify-center bg-gray-100"
      >
        <span class="text-xs text-gray-500"
          >+{{ images.length - maxThumbnails }}</span
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from "vue";
import { base64ToBlob } from "../powersync-schema";

interface ImageData {
  id: string;
  thumbnail_data?: string | null;
  cloud_url?: string | null;
  data?: string | null; // Legacy fallback
}

interface Props {
  images: ImageData[] | null | undefined;
  title?: string;
  maxThumbnails?: number;
  imageAlt?: string;
  showQualityIndicator?: boolean;
  showHoverActions?: boolean;
  showDeleteButton?: boolean;
  deleteConfirmMessage?: string;
}

interface Emits {
  (e: "imageClick", image: ImageData): void;
  (e: "imageHover", image: ImageData): void;
  (e: "imageDelete", image: ImageData): void;
}

const props = withDefaults(defineProps<Props>(), {
  title: "Photos",
  maxThumbnails: 3,
  imageAlt: "Photo",
  showQualityIndicator: true,
  showHoverActions: false,
  showDeleteButton: false,
  deleteConfirmMessage: "Are you sure you want to delete this image?",
});

const emit = defineEmits<Emits>();

/** Per-image source override after <img> error (e.g. fall back to cloud_url). */
const sourceOverrides = reactive<Record<string, string>>({});

const isUsableCloudUrl = (url: string | null | undefined): url is string => {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.includes("mock-storage.dev")) return false;
  return /^https?:\/\//i.test(trimmed);
};

const toDataUrl = (raw: string): string => {
  const value = raw.trim();
  if (!value) return "";
  if (value.startsWith("data:")) return value;
  // Strip accidental repeated prefixes
  const withoutPrefix = value.replace(/^(data:image\/[a-zA-Z+]+;base64,)+/i, "");
  if (!withoutPrefix) return "";
  return `data:image/jpeg;base64,${withoutPrefix}`;
};

const getCandidateUrls = (image: ImageData): string[] => {
  const urls: string[] = [];

  if (image.thumbnail_data) {
    const thumb = toDataUrl(image.thumbnail_data);
    if (thumb) urls.push(thumb);
  }

  if (isUsableCloudUrl(image.cloud_url)) {
    urls.push(image.cloud_url.trim());
  }

  if (image.data) {
    if (image.data.startsWith("data:")) {
      urls.push(image.data);
    } else {
      try {
        const blob = base64ToBlob(image.data, "image/jpeg");
        urls.push(URL.createObjectURL(blob));
      } catch (error) {
        console.error("ThumbnailViewer: Error creating image URL:", error);
      }
    }
  }

  return urls;
};

const resolveImageUrl = (image: ImageData): string => {
  if (!image?.id) return "";
  if (sourceOverrides[image.id]) return sourceOverrides[image.id];

  const candidates = getCandidateUrls(image);
  return candidates[0] || "";
};

const onImageError = (image: ImageData, event: Event) => {
  const failedSrc = (event.target as HTMLImageElement | null)?.src || "";
  const candidates = getCandidateUrls(image);
  const next = candidates.find((url) => url && url !== failedSrc);

  if (next) {
    console.warn("ThumbnailViewer: image source failed, trying fallback", {
      id: image.id,
      failedSrc: failedSrc.slice(0, 80),
      next: next.slice(0, 80),
    });
    sourceOverrides[image.id] = next;
    return;
  }

  console.warn("ThumbnailViewer: all image sources failed", {
    id: image.id,
    hasThumb: !!image.thumbnail_data,
    hasCloud: !!image.cloud_url,
    hasData: !!image.data,
  });
  sourceOverrides[image.id] = "";
};

const handleImageClick = (image: ImageData) => {
  emit("imageClick", image);
};

const handleDeleteClick = (image: ImageData) => {
  if (confirm(props.deleteConfirmMessage)) {
    emit("imageDelete", image);
  }
};
</script>
