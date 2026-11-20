<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { CornerDownLeft, Search, X } from "@lucide/vue";
import { clampHistoryIndex } from "../lib/historyPanel";
import {
  filterPaletteCommands,
  groupPaletteCommands,
  resolveQuickPaletteKey,
  type PaletteCommand,
} from "../lib/commandPalette";

const props = defineProps<{
  commands: PaletteCommand[];
  t: (key: string, values?: Record<string, string | number>) => string;
}>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "run", command: PaletteCommand): void;
}>();

const query = ref("");
const index = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);

const filtered = computed(() => filterPaletteCommands(props.commands, query.value));
const grouped = computed(() => groupPaletteCommands(filtered.value));

watch(() => props.commands, () => { index.value = 0; });

function focusInput() {
  query.value = "";
  index.value = 0;
  void nextTick(() => inputEl.value?.focus());
}

function runAt(cmd: PaletteCommand) {
  emit("run", cmd);
}

function confirmSelection() {
  const item = filtered.value[index.value] as PaletteCommand | undefined;
  if (item) runAt(item);
}

function onKeydown(event: KeyboardEvent) {
  const resolved = resolveQuickPaletteKey(event);
  if (resolved.action === "ignore") return;
  event.preventDefault();
  if (resolved.action === "cancel") {
    emit("close");
    return;
  }
  if (resolved.action === "confirm" || resolved.action === "confirm-run") {
    confirmSelection();
    return;
  }
  index.value = clampHistoryIndex(filtered.value.length, index.value, resolved.delta);
}

defineExpose({ focusInput });
</script>

<template>
  <section
    class="history-overlay command-palette"
    role="dialog"
    :aria-label="t('commandPalette.title')"
    @keydown="onKeydown"
    @mousedown.stop
  >
    <div class="history-overlay-head">
      <Search />
      <input
        ref="inputEl"
        v-model="query"
        class="mono"
        :placeholder="t('commandPalette.search')"
        spellcheck="false"
        @input="index = 0"
      />
      <span class="history-overlay-badge">{{ t('commandPalette.title') }} · {{ filtered.length }}</span>
      <button :title="t('close')" class="icon-button" @click="emit('close')"><X /></button>
    </div>
    <div v-if="!filtered.length" class="empty compact">{{ t('commandPalette.empty') }}</div>
    <div v-else class="history-overlay-list command-palette-list">
      <div v-for="group in grouped" :key="group.group" class="command-palette-group">
        <div class="command-palette-group-label">{{ group.group }}</div>
        <div
          v-for="cmd in group.items"
          :key="cmd.id"
          class="history-item command-palette-item"
          :class="{ 'is-active': filtered[index]?.id === cmd.id }"
          :title="cmd.aliases || cmd.label"
          @mouseenter="index = filtered.indexOf(cmd)"
          @click="runAt(cmd)"
        >
          <span class="history-item-cmd">{{ cmd.label }}</span>
          <span v-if="cmd.shortcut" class="command-palette-shortcut mono">{{ cmd.shortcut }}</span>
        </div>
      </div>
    </div>
    <p class="history-overlay-hint">
      <kbd>↑</kbd><kbd>↓</kbd> {{ t('commandPalette.hintNavigate') }} ·
      <kbd><CornerDownLeft /></kbd> {{ t('commandPalette.hintRun') }} ·
      <kbd>Esc</kbd> {{ t('commandPalette.hintClose') }}
    </p>
  </section>
</template>
