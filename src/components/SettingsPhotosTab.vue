<template>
  <div class="space-y-3" data-testid="settings-photos-tab">
    <p class="text-sm text-gray-700">{{ t("settingsModal.photosTab.description") }}</p>

    <div class="flex items-start gap-3">
      <input
        id="settings-photos-auto-capture"
        v-model="autoCapture"
        type="checkbox"
        class="mt-1 h-4 w-4"
        :disabled="saving"
        data-testid="settings-photos-auto-capture-input"
        @change="save"
      />
      <label for="settings-photos-auto-capture" class="flex-1">
        <span class="block text-sm font-medium text-gray-800">{{ t("settingsModal.photosTab.autoCaptureLabel") }}</span>
        <span class="block text-xs text-gray-500 mt-0.5">{{ t("settingsModal.photosTab.autoCaptureHint") }}</span>
      </label>
    </div>

    <div v-if="loaded" class="flex items-center gap-3 text-xs">
      <span :class="statusColour" data-testid="settings-photos-status">{{ statusText }}</span>
    </div>

    <p v-if="errorMessage" class="text-sm text-red-700" role="alert" data-testid="settings-photos-error">{{ errorMessage }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { apiGet, apiPut } from "../utils/api";
import { API_ROUTES } from "../config/apiRoutes";

const { t } = useI18n();

const props = defineProps<{
  /** Bumped by the parent on modal open. Same pattern as Map tab —
   *  picks up out-of-band hand-edits to settings.json. */
  reloadToken: number;
}>();

const emit = defineEmits<{
  saved: [];
}>();

interface SettingsResponse {
  settings: {
    extraAllowedTools: string[];
    photoExif?: { autoCapture: boolean };
  };
}

const autoCapture = ref(true);
const stored = ref(true);
const loaded = ref(false);
const saving = ref(false);
const errorMessage = ref("");

const statusText = computed(() => {
  if (saving.value) return t("common.saving");
  if (errorMessage.value) return errorMessage.value;
  return stored.value ? t("settingsModal.photosTab.statusOn") : t("settingsModal.photosTab.statusOff");
});

const statusColour = computed(() => {
  if (saving.value) return "text-gray-500";
  if (errorMessage.value) return "text-red-600";
  return stored.value ? "text-green-600" : "text-gray-500";
});

async function load(): Promise<void> {
  errorMessage.value = "";
  const response = await apiGet<SettingsResponse>(API_ROUTES.config.base);
  if (!response.ok) {
    errorMessage.value = response.error || t("settingsModal.photosTab.loadError");
    return;
  }
  // Default true matches `isPhotoExifAutoCaptureEnabled` in
  // server/system/config.ts — a missing block means "on", so the
  // checkbox starts checked on a fresh workspace.
  const value = response.data.settings.photoExif?.autoCapture ?? true;
  stored.value = value;
  autoCapture.value = value;
  loaded.value = true;
}

async function save(): Promise<void> {
  if (saving.value) return;
  if (autoCapture.value === stored.value) return;
  saving.value = true;
  errorMessage.value = "";
  // Patch-style PUT: only `photoExif` is sent. The server's
  // /api/config/settings handler merges onto the on-disk state so
  // other tabs (Map / Tools) keep their fields untouched.
  const response = await apiPut<unknown>(API_ROUTES.config.settings, {
    photoExif: { autoCapture: autoCapture.value },
  });
  saving.value = false;
  if (!response.ok) {
    errorMessage.value = response.error || t("settingsModal.photosTab.saveError");
    // Rollback the checkbox so the visible state matches what's
    // actually persisted.
    autoCapture.value = stored.value;
    return;
  }
  stored.value = autoCapture.value;
  emit("saved");
}

watch(
  () => props.reloadToken,
  () => {
    void load();
  },
  { immediate: true },
);
</script>
