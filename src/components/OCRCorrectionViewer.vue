<template>
  <Card>
    <template #title>
      <div class="flex items-center justify-between">
        <span>OCR Results & Corrections</span>
        <Button
          icon="pi pi-times"
          text
          rounded
          @click="$emit('close')"
        />
      </div>
    </template>
    <template #content>
      <div class="space-y-4">
        <!-- Image with OCR overlay -->
        <div class="relative border border-surface-200 rounded-lg overflow-hidden bg-surface-50">
          <img
            :src="imageSrc"
            alt="Headstone image"
            ref="imageRef"
            class="w-full h-auto"
            @load="onImageLoad"
          />
          <!-- Canvas overlay for bounding boxes -->
          <canvas
            ref="canvasRef"
            class="absolute top-0 left-0 w-full h-auto pointer-events-none"
            :style="{ imageRendering: 'pixelated' }"
          />
        </div>

        <!-- OCR Results List -->
        <div class="space-y-2">
          <div class="flex items-center justify-between mb-2">
            <h3 class="font-semibold">Detected Text Regions</h3>
            <div class="text-sm text-surface-600">
              {{ ocrResults.length }} region(s)
              <span v-if="lowConfidenceCount > 0" class="text-yellow-600">
                • {{ lowConfidenceCount }} need review
              </span>
            </div>
          </div>

          <div
            v-for="(result, index) in ocrResults"
            :key="index"
            class="p-3 border rounded-lg"
            :class="{
              'border-yellow-300 bg-yellow-50': result.flaggedForReview,
              'border-surface-200': !result.flaggedForReview,
            }"
          >
            <div class="flex items-start gap-3">
              <!-- Confidence indicator -->
              <div class="flex-shrink-0">
                <div
                  class="w-12 h-12 rounded-full flex items-center justify-center text-xs font-semibold"
                  :class="{
                    'bg-yellow-100 text-yellow-800': result.flaggedForReview,
                    'bg-green-100 text-green-800': !result.flaggedForReview,
                  }"
                >
                  {{ Math.round(result.confidence * 100) }}%
                </div>
              </div>

              <!-- Editable text -->
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-xs text-surface-500">Region {{ index + 1 }}</span>
                  <Tag
                    v-if="result.flaggedForReview"
                    severity="warning"
                    value="Low Confidence"
                  />
                </div>
                <InputText
                  v-model="result.text"
                  class="w-full"
                  :class="{
                    'border-yellow-300': result.flaggedForReview,
                  }"
                  @blur="onTextChange(index, result.text)"
                />
                <div class="text-xs text-surface-500 mt-1">
                  Confidence: {{ (result.confidence * 100).toFixed(1) }}%
                </div>
              </div>

              <!-- Actions -->
              <div class="flex-shrink-0 flex gap-1">
                <Button
                  icon="pi pi-check"
                  text
                  rounded
                  severity="success"
                  v-tooltip="'Mark as correct'"
                  @click="markAsCorrect(index)"
                />
                <Button
                  icon="pi pi-times"
                  text
                  rounded
                  severity="danger"
                  v-tooltip="'Remove this region'"
                  @click="removeRegion(index)"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex gap-2 pt-4 border-t border-surface-200">
          <Button
            label="Save Corrections"
            icon="pi pi-save"
            @click="saveCorrections"
            :disabled="!hasChanges"
          />
          <Button
            label="Export Training Data"
            icon="pi pi-download"
            severity="secondary"
            outlined
            @click="exportTrainingData"
          />
          <Button
            label="Cancel"
            icon="pi pi-times"
            severity="secondary"
            outlined
            @click="$emit('close')"
          />
        </div>
      </div>
    </template>
  </Card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from "vue";
import Card from "primevue/card";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Tag from "primevue/tag";
import type { OCRResult } from "../services/ocrService";

interface Props {
  imageSrc: string;
  ocrResults: OCRResult[];
  modelVersion?: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  close: [];
  save: [corrections: OCRResult[]];
  export: [data: any];
}>();

const imageRef = ref<HTMLImageElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const originalResults = ref<OCRResult[]>([]);
const editedResults = ref<OCRResult[]>([...props.ocrResults]);

// Computed
const lowConfidenceCount = computed(() =>
  editedResults.value.filter((r) => r.flaggedForReview).length,
);

const hasChanges = computed(() => {
  if (originalResults.value.length !== editedResults.value.length) {
    return true;
  }
  return editedResults.value.some(
    (result, index) =>
      result.text !== originalResults.value[index]?.text,
  );
});

// Initialize
onMounted(() => {
  originalResults.value = JSON.parse(JSON.stringify(props.ocrResults));
  editedResults.value = JSON.parse(JSON.stringify(props.ocrResults));
  nextTick(() => {
    drawBoundingBoxes();
  });
});

watch(
  () => props.ocrResults,
  (newResults) => {
    originalResults.value = JSON.parse(JSON.stringify(newResults));
    editedResults.value = JSON.parse(JSON.stringify(newResults));
    nextTick(() => {
      drawBoundingBoxes();
    });
  },
  { deep: true },
);

// Draw bounding boxes on canvas overlay
const drawBoundingBoxes = () => {
  if (!canvasRef.value || !imageRef.value) return;

  const canvas = canvasRef.value;
  const img = imageRef.value;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Set canvas size to match image
  canvas.width = img.offsetWidth;
  canvas.height = img.offsetHeight;

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Scale factor from image natural size to displayed size
  const scaleX = canvas.width / img.naturalWidth;
  const scaleY = canvas.height / img.naturalHeight;

  // Draw bounding boxes
  editedResults.value.forEach((result, index) => {
    if (!result.bbox || result.bbox.length < 4) return;

    // Scale bounding box coordinates
    const scaledBbox = result.bbox.map((pt) => [
      pt[0] * scaleX,
      pt[1] * scaleY,
    ]);

    // Draw box
    ctx.strokeStyle = result.flaggedForReview
      ? "#f59e0b"
      : "#10b981";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(scaledBbox[0][0], scaledBbox[0][1]);
    for (let i = 1; i < scaledBbox.length; i++) {
      ctx.lineTo(scaledBbox[i][0], scaledBbox[i][1]);
    }
    ctx.closePath();
    ctx.stroke();

    // Draw semi-transparent fill
    ctx.fillStyle = result.flaggedForReview
      ? "rgba(245, 158, 11, 0.1)"
      : "rgba(16, 185, 129, 0.1)";
    ctx.fill();

    // Draw region number
    const centerX =
      scaledBbox.reduce((sum, pt) => sum + pt[0], 0) / scaledBbox.length;
    const centerY =
      scaledBbox.reduce((sum, pt) => sum + pt[1], 0) / scaledBbox.length;

    ctx.fillStyle = result.flaggedForReview ? "#f59e0b" : "#10b981";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${index + 1}`, centerX, centerY);
  });
};

const onImageLoad = () => {
  nextTick(() => {
    drawBoundingBoxes();
  });
};

const onTextChange = (index: number, newText: string) => {
  if (editedResults.value[index]) {
    editedResults.value[index].text = newText;
  }
};

const markAsCorrect = (index: number) => {
  if (editedResults.value[index]) {
    editedResults.value[index].flaggedForReview = false;
    editedResults.value[index].confidence = Math.max(
      editedResults.value[index].confidence,
      0.8,
    );
    nextTick(() => {
      drawBoundingBoxes();
    });
  }
};

const removeRegion = (index: number) => {
  editedResults.value.splice(index, 1);
  nextTick(() => {
    drawBoundingBoxes();
  });
};

const saveCorrections = () => {
  emit("save", editedResults.value);
};

const exportTrainingData = () => {
  const trainingData = {
    imageSrc: props.imageSrc,
    modelVersion: props.modelVersion || "unknown",
    timestamp: new Date().toISOString(),
    corrections: editedResults.value.map((result, index) => ({
      index,
      originalText: originalResults.value[index]?.text || "",
      correctedText: result.text,
      bbox: result.bbox,
      confidence: result.confidence,
      wasFlagged: result.flaggedForReview,
    })),
  };
  emit("export", trainingData);
};
</script>

<style scoped>
canvas {
  pointer-events: none;
}
</style>
