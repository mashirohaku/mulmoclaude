<template>
  <div class="p-2 text-sm">
    <div class="font-medium text-gray-700 truncate mb-1">
      {{ title }}
    </div>
    <div v-if="previewUrl" class="thumb-wrapper">
      <img :src="previewUrl" :alt="title" data-testid="present-svg-thumb" class="thumb" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { ToolResultComplete } from "gui-chat-protocol/vue";
import type { PresentSvgData } from "./index";
import { svgPreviewUrlFor } from "../../composables/useContentDisplay";
import { useFileChange } from "../../composables/useFileChange";

const props = defineProps<{ result: ToolResultComplete<PresentSvgData> }>();

const { t } = useI18n();

const data = computed(() => props.result.data);
const title = computed(() => data.value?.title ?? t("pluginPresentSvg.untitled"));
const filePath = computed(() => data.value?.filePath ?? null);
const { version: previewVersion } = useFileChange(filePath);
const previewUrl = computed(() => {
  const base = svgPreviewUrlFor(filePath.value);
  if (!base) return null;
  return previewVersion.value > 0 ? `${base}?v=${previewVersion.value}` : base;
});
</script>

<style scoped>
.thumb-wrapper {
  margin-top: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fafafa;
  border: 1px solid #eee;
  border-radius: 4px;
  padding: 0.25rem;
  max-height: 9rem;
  overflow: hidden;
}

.thumb {
  max-width: 100%;
  max-height: 8.5rem;
  width: auto;
  height: auto;
  display: block;
}
</style>
