<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ArrowUp, File as FileIcon, Folder, HardDrive, Loader2, Upload } from "@lucide/vue";
import { workbenchMessage } from "../lib/i18n";

interface BrowseEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number;
}
interface BrowseResult {
  path: string;
  parent?: string | null;
  entries: BrowseEntry[];
}

export type LocalUploadEntry = { name: string; path: string; size: number };

const props = defineProps<{
  locale: string;
  canUpload: boolean;
}>();
const emit = defineEmits<{
  upload: [entries: LocalUploadEntry[]];
}>();

const t = (key: string, values: Record<string, string | number> = {}) => workbenchMessage(props.locale, key, values);

const current = ref<BrowseResult | null>(null);
const drives = ref<string[] | null>(null);
const drivesAvailable = ref(false);
const error = ref("");
const loading = ref(false);
/** Absolute paths of selected files (dirs are never selected). */
const selected = ref<Set<string>>(new Set());

const selectedEntries = computed(() => {
  const entries = current.value?.entries ?? [];
  return entries.filter((entry) => !entry.is_dir && selected.value.has(entry.path));
});

const atDriveRoot = computed(() => !!current.value && !current.value.parent);

function clearSelection() {
  selected.value = new Set();
}

async function browse(path?: string) {
  loading.value = true;
  error.value = "";
  drives.value = null;
  clearSelection();
  try {
    const data = await window.datawisePlugin.invoke<BrowseResult>(
      "local/fs/browse",
      path ? { path, includeFiles: true } : { includeFiles: true },
    );
    current.value = data;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    loading.value = false;
  }
}

async function showDrives() {
  loading.value = true;
  error.value = "";
  clearSelection();
  try {
    const result = await window.datawisePlugin.invoke<{ drives: string[] }>("local/fs/drives", {});
    if (Array.isArray(result.drives) && result.drives.length) {
      drivesAvailable.value = true;
      drives.value = result.drives;
      current.value = null;
      loading.value = false;
    } else {
      drivesAvailable.value = false;
      await browse();
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
    loading.value = false;
  }
}

function toggleSelect(entry: BrowseEntry, event: MouseEvent) {
  if (entry.is_dir) return;
  const next = new Set(selected.value);
  if (event.ctrlKey || event.metaKey) {
    if (next.has(entry.path)) next.delete(entry.path);
    else next.add(entry.path);
  } else if (event.shiftKey && next.size) {
    // Simple range select within the current file list.
    const files = (current.value?.entries ?? []).filter((row) => !row.is_dir);
    const anchor = files.findIndex((row) => next.has(row.path));
    const target = files.findIndex((row) => row.path === entry.path);
    if (anchor >= 0 && target >= 0) {
      const [from, to] = anchor < target ? [anchor, target] : [target, anchor];
      for (let i = from; i <= to; i += 1) next.add(files[i].path);
    } else {
      next.add(entry.path);
    }
  } else {
    if (next.size === 1 && next.has(entry.path)) next.clear();
    else {
      next.clear();
      next.add(entry.path);
    }
  }
  selected.value = next;
}

function onEntry(entry: BrowseEntry, event: MouseEvent) {
  if (entry.is_dir) {
    void browse(entry.path);
    return;
  }
  toggleSelect(entry, event);
}

function uploadSelected() {
  if (!props.canUpload || !selectedEntries.value.length) return;
  emit(
    "upload",
    selectedEntries.value.map((entry) => ({
      name: entry.name,
      path: entry.path,
      size: typeof entry.size === "number" ? entry.size : 0,
    })),
  );
}

function uploadOne(entry: BrowseEntry) {
  if (!props.canUpload || entry.is_dir) return;
  emit("upload", [{ name: entry.name, path: entry.path, size: typeof entry.size === "number" ? entry.size : 0 }]);
}

function goUp() {
  if (drives.value) return;
  if (atDriveRoot.value && drivesAvailable.value) {
    void showDrives();
    return;
  }
  if (current.value?.parent) void browse(current.value.parent);
}

onMounted(() => {
  void showDrives();
});
</script>

<template>
  <div class="local-browse-panel">
    <div class="local-browse-head">
      <HardDrive />
      <span>{{ t("localPane.title") }}</span>
      <button
        type="button"
        :title="t('folderPicker.parentDir')"
        :disabled="!!drives || (!current?.parent && !(atDriveRoot && drivesAvailable))"
        @click="goUp"
      >
        <ArrowUp />
      </button>
    </div>
    <p class="local-browse-path mono" :title="drives ? t('folderPicker.thisPC') : current?.path">
      {{ drives ? t("folderPicker.thisPC") : (current?.path || "…") }}
    </p>
    <div v-if="loading" class="empty compact"><Loader2 class="spinning" />{{ t("loading") }}</div>
    <p v-else-if="error" class="local-browse-error">{{ error }}</p>
    <ul v-else class="local-browse-list">
      <template v-if="drives">
        <li v-for="drive in drives" :key="drive">
          <button type="button" class="local-browse-row" :title="drive" @click="browse(drive)">
            <HardDrive />
            <span class="mono">{{ drive }}</span>
          </button>
        </li>
      </template>
      <template v-else>
        <li v-for="entry in current?.entries ?? []" :key="entry.path">
          <button
            type="button"
            class="local-browse-row"
            :class="{ 'is-selected': selected.has(entry.path) }"
            :title="entry.path"
            @click="onEntry(entry, $event)"
            @dblclick="!entry.is_dir && uploadOne(entry)"
          >
            <Folder v-if="entry.is_dir" />
            <FileIcon v-else />
            <span class="mono">{{ entry.name }}</span>
          </button>
        </li>
        <li v-if="!(current?.entries ?? []).length" class="empty compact">{{ t("localPane.empty") }}</li>
      </template>
    </ul>
    <div class="local-browse-footer">
      <button
        type="button"
        class="local-browse-upload"
        :disabled="!canUpload || !selectedEntries.length"
        :title="t('localPane.uploadSelected')"
        @click="uploadSelected"
      >
        <Upload />
        <span>{{ t("localPane.uploadSelected") }}{{ selectedEntries.length ? ` (${selectedEntries.length})` : "" }}</span>
      </button>
    </div>
  </div>
</template>
