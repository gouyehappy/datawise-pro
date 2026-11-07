<script setup lang="ts">
// Soft stub: full @file-viewer stack is disabled in the single-file pack
// (see filesStudioRenderers.ts). PreviewPane should prefer unavailable /
// media / text lanes via resolvePreview; this component only surfaces a
// clear bilingual fallback if a caller still boots the viewer path.
import { computed } from "vue";

export type FileViewerPreviewSource = Blob | File | string;

const props = withDefaults(
  defineProps<{
    source: FileViewerPreviewSource;
    fileName?: string;
    mime?: string;
    appearance?: DatawisePluginAppearance;
    class?: string;
    t?: (key: string, values?: Record<string, string | number>) => string;
  }>(),
  {
    fileName: undefined,
    mime: undefined,
    appearance: undefined,
    class: undefined,
    t: undefined,
  },
);

defineEmits<{
  (event: "error", error: unknown): void;
}>();

function label(key: string, fallback: string): string {
  const value = props.t?.(key);
  return value && value !== key ? value : fallback;
}

const title = computed(() =>
  label("previewDialog.viewerUnavailable", "Rich preview is unavailable in this build ({kind}).").replace(
    "{kind}",
    label("previewDialog.kindRich", "Office / PDF / decoded media"),
  ),
);
const hint = computed(() =>
  label("previewDialog.viewerUnavailableHint", "Download the file or open it with a local app."),
);
</script>

<template>
  <div class="ssh-file-viewer-stub" :class="props.class" role="status" data-test="file-viewer-stub">
    <p>{{ title }}</p>
    <p class="ssh-file-viewer-stub__hint">{{ hint }}</p>
    <p v-if="fileName" class="ssh-file-viewer-stub__name">{{ fileName }}</p>
  </div>
</template>

<style scoped>
.ssh-file-viewer-stub {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  color: var(--color-muted-foreground, #9ca3af);
  font-size: var(--dw-font-size);
}
.ssh-file-viewer-stub__hint {
  margin: 0;
}
.ssh-file-viewer-stub__name {
  color: var(--color-foreground, #e5e7eb);
  word-break: break-all;
}
</style>
