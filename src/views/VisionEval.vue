<template>
  <div class="max-w-3xl mx-auto p-4 space-y-6">
    <div>
      <h1 class="text-2xl font-semibold mb-1">Vision eval harness</h1>
      <p class="text-sm text-surface-600">
        Dev-only: load FastVLM, run a fixture or your own photo, inspect
        reasoning JSON. Not shown to cemetery staff.
      </p>
    </div>

    <Message v-if="caps" :severity="caps.canRunOfflineAi ? 'info' : 'warn'" :closable="false">
      {{ caps.staffMessage }} (backend: {{ caps.backend }})
    </Message>

    <Card>
      <template #title>Model</template>
      <template #content>
        <div class="space-y-3">
          <div class="flex flex-wrap gap-2">
            <Button
              label="Load stock FastVLM"
              :loading="loading"
              :disabled="!caps?.canRunOfflineAi"
              @click="loadStock"
            />
            <Button
              label="Reset"
              severity="secondary"
              outlined
              @click="reset"
            />
          </div>
          <p class="text-xs text-surface-500">
            State:
            {{
              state.isLoaded
                ? `ready (${state.modelUrl})`
                : state.isLoading
                  ? `loading ${state.loadProgress.toFixed(0)}%`
                  : state.error || "idle"
            }}
          </p>
        </div>
      </template>
    </Card>

    <Card>
      <template #title>Analyze</template>
      <template #content>
        <div class="space-y-3">
          <input type="file" accept="image/*" @change="onFile" />
          <div v-if="preview" class="max-h-64 overflow-hidden rounded">
            <img :src="preview" alt="Preview" class="max-h-64 object-contain" />
          </div>
          <Button
            label="Run analysis"
            :disabled="!file || !state.isLoaded"
            :loading="analyzing"
            @click="run"
          />
          <pre
            v-if="output"
            class="text-xs bg-surface-100 p-3 rounded overflow-auto max-h-96 whitespace-pre-wrap"
            >{{ output }}</pre
          >
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import Card from "primevue/card";
import Button from "primevue/button";
import Message from "primevue/message";
import { localLLMService } from "@/services/localLLMService";
import { ensureStockModelForEval } from "@/services/adapterInstallService";
import {
  detectDeviceAiCapabilities,
  type DeviceAiCapabilities,
} from "@/utils/deviceAiCapabilities";
import { parseReasoningJson } from "@/utils/reasoningMapper";

const caps = ref<DeviceAiCapabilities | null>(null);
const state = ref(localLLMService.getState());
const loading = ref(false);
const analyzing = ref(false);
const file = ref<File | null>(null);
const preview = ref<string | null>(null);
const output = ref("");

onMounted(async () => {
  caps.value = await detectDeviceAiCapabilities();
  state.value = localLLMService.getState();
});

async function loadStock() {
  loading.value = true;
  try {
    await ensureStockModelForEval();
  } catch (e) {
    output.value = e instanceof Error ? e.message : String(e);
  } finally {
    state.value = localLLMService.getState();
    loading.value = false;
  }
}

function reset() {
  localLLMService.reset();
  state.value = localLLMService.getState();
  output.value = "";
}

function onFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0] || null;
  file.value = f;
  if (preview.value) URL.revokeObjectURL(preview.value);
  preview.value = f ? URL.createObjectURL(f) : null;
}

async function run() {
  if (!file.value) return;
  analyzing.value = true;
  output.value = "";
  try {
    const result = await localLLMService.analyzeImage(file.value);
    const target = parseReasoningJson(result.raw_analysis || "");
    output.value = JSON.stringify(
      {
        success: result.success,
        persons: result.persons.map((p) => ({
          full_name: p.full_name,
          date_of_birth: p.date_of_birth,
          date_of_death: p.date_of_death,
        })),
        transcription: result.full_text_transcription,
        reasoning: target,
        metadata: result.metadata,
      },
      null,
      2,
    );
  } catch (e) {
    output.value = e instanceof Error ? e.message : String(e);
  } finally {
    analyzing.value = false;
    state.value = localLLMService.getState();
  }
}
</script>
