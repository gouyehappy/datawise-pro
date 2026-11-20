<script setup lang="ts">
// Motty-aligned quick commands: list on the settings card; add/edit in a modal dialog.
import { computed, ref, watch } from "vue";
import { Pencil, Plus, Trash2 } from "@lucide/vue";
import QuickCommandEditorDialog from "./QuickCommandEditorDialog.vue";
import {
  QUICK_COMMANDS_LIMIT,
  canAddQuickCommandInScope,
  countQuickCommandsInScope,
  filterQuickCommands,
  groupQuickCommandsByConnection,
  otherScopedQuickCommands,
  shortenConnectionId,
  visibleQuickCommands,
  type QuickCommand,
} from "../lib/quickCommands";

const props = withDefaults(
  defineProps<{
    commands: QuickCommand[];
    connectionId: string;
    connected: boolean;
    saving?: boolean;
    allowRun?: boolean;
    /** Settings cards own the "Add" entry now; hide the duplicate inside the manage list. */
    showAddButton?: boolean;
    t: (key: string, values?: Record<string, string | number>) => string;
  }>(),
  {
    saving: false,
    allowRun: true,
    showAddButton: true,
  },
);

const emit = defineEmits<{
  save: [payload: { id?: string; name: string; command: string; group: string; scope: "global" | "connection" }];
  delete: [id: string];
  deleteConnection: [connectionId: string];
  makeGlobal: [item: QuickCommand];
  send: [item: QuickCommand];
  paste: [item: QuickCommand];
}>();

const search = ref("");
const editorOpen = ref(false);
const editingItem = ref<QuickCommand | null>(null);
const otherOpen = ref(false);

const visibleList = computed(() => visibleQuickCommands(props.commands, props.connectionId));
const filtered = computed(() => filterQuickCommands(visibleList.value, search.value));
const otherGroups = computed(() =>
  groupQuickCommandsByConnection(otherScopedQuickCommands(props.commands, props.connectionId)),
);
const otherCount = computed(() => otherGroups.value.reduce((sum, group) => sum + group.commands.length, 0));
const scopeCount = computed(() => countQuickCommandsInScope(props.commands, props.connectionId || null));
const canAddCurrentOrGlobal = computed(
  () =>
    canAddQuickCommandInScope(props.commands, props.connectionId || null) ||
    canAddQuickCommandInScope(props.commands, null),
);

function resetView() {
  search.value = "";
  editorOpen.value = false;
  editingItem.value = null;
  otherOpen.value = false;
}

function openEditor(item?: QuickCommand) {
  editingItem.value = item ?? null;
  editorOpen.value = true;
}

function closeEditor() {
  editorOpen.value = false;
  editingItem.value = null;
}

function onSaved() {
  closeEditor();
}

defineExpose({ resetView, onSaved, closeEditor });
</script>

<template>
  <div class="quick-commands-settings">
    <label v-if="visibleList.length" class="settings-field">
      <span>{{ t("quickCommandsSearch") }}</span>
      <input v-model="search" :placeholder="t('quickCommandsSearch')" spellcheck="false" />
    </label>

    <p v-if="!visibleList.length" class="muted settings-note">{{ t("quickCommandsEmpty") }}</p>
    <p v-else-if="!filtered.length" class="muted settings-note">{{ t("quickCommandsNoMatch") }}</p>
    <ul v-else class="settings-list">
      <li v-for="item in filtered" :key="item.id">
        <div class="settings-list-main">
          <strong>
            {{ item.name }}
            <span class="quick-command-scope-badge" :data-scope="item.connectionId ? 'connection' : 'global'">{{
              item.connectionId ? t("quickCommands.badge.connection") : t("quickCommands.badge.global")
            }}</span>
          </strong>
          <span class="mono muted" :title="item.command">{{ item.command }}</span>
          <span v-if="item.group" class="muted quick-command-group-meta">{{ item.group }}</span>
        </div>
        <div class="settings-list-actions">
          <button
            v-if="allowRun"
            type="button"
            class="settings-secondary-button settings-secondary-button--compact"
            :disabled="!connected"
            @click="emit('send', item)"
          >{{ t("quickCommandRun") }}</button>
          <button
            v-if="allowRun"
            type="button"
            class="settings-secondary-button settings-secondary-button--compact"
            :disabled="!connected"
            @click="emit('paste', item)"
          >{{ t("quickCommandPaste") }}</button>
          <button type="button" class="icon-button" :title="t('quickCommandsEdit')" @click="openEditor(item)"><Pencil /></button>
          <button type="button" class="icon-button" :title="t('delete')" @click="emit('delete', item.id)"><Trash2 /></button>
        </div>
      </li>
    </ul>

    <div v-if="otherCount" class="quick-commands-other">
      <button type="button" class="quick-commands-other-toggle" :aria-expanded="otherOpen" @click="otherOpen = !otherOpen">
        {{ t("quickCommands.otherConnections", { count: otherCount }) }}
      </button>
      <ul v-if="otherOpen" class="settings-list">
        <li v-for="group in otherGroups" :key="group.connectionId" class="quick-commands-other-group">
          <div class="settings-list-main">
            <strong class="mono" :title="group.connectionId">{{ shortenConnectionId(group.connectionId) }}</strong>
            <span class="muted">{{ group.commands.length }}</span>
          </div>
          <div class="settings-list-actions">
            <button type="button" class="link-button" @click="emit('deleteConnection', group.connectionId)">{{ t("quickCommands.deleteConnection") }}</button>
          </div>
          <div class="quick-commands-other-rows">
            <div v-for="item in group.commands" :key="item.id" class="quick-commands-other-row">
              <span class="quick-commands-other-name" :title="item.command">{{ item.name }}</span>
              <button type="button" class="link-button" @click="emit('makeGlobal', item)">{{ t("quickCommands.makeGlobal") }}</button>
              <button type="button" class="icon-button" :title="t('delete')" @click="emit('delete', item.id)"><Trash2 /></button>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <div class="settings-toolbar">
      <span class="settings-toolbar-count muted">{{ t("quickCommands.limitScope", { count: scopeCount, limit: QUICK_COMMANDS_LIMIT }) }}</span>
      <button v-if="showAddButton" type="button" class="settings-secondary-button" :disabled="!canAddCurrentOrGlobal" @click="openEditor()">
        <Plus />{{ t("quickCommandsNew") }}
      </button>
    </div>

    <QuickCommandEditorDialog
      :open="editorOpen"
      :commands="commands"
      :connection-id="connectionId"
      :saving="saving"
      :item="editingItem"
      :t="t"
      @save="(payload) => emit('save', payload)"
      @update:open="(open) => { if (!open) closeEditor(); }"
    />
  </div>
</template>

<style>
.quick-commands-settings {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.settings-workspace .quick-commands-settings > .settings-field,
.settings-workspace .quick-commands-settings > .settings-note,
.settings-workspace .quick-commands-settings > .muted.settings-note {
  margin-left: 18px;
  margin-right: 18px;
}

.settings-workspace .quick-commands-settings > .settings-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
  margin-bottom: 10px;
  min-height: 0;
  padding: 0;
  border: 0;
}

.settings-workspace .quick-commands-settings > .settings-list {
  margin-top: 4px;
  margin-bottom: 8px;
}

.settings-workspace .quick-commands-settings > .settings-toolbar {
  margin-top: 2px;
}

.quick-commands-settings .settings-list-main strong {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.quick-command-scope-badge {
  flex: 0 0 auto;
  border: 0;
  border-radius: 999px;
  padding: 1px 6px;
  font-size: var(--dw-text-2xs);
  font-weight: 500;
  line-height: 1.35;
}
.quick-command-scope-badge[data-scope="global"] {
  background: color-mix(in srgb, var(--muted-foreground) 14%, transparent);
  color: var(--muted-foreground);
}
.quick-command-scope-badge[data-scope="connection"] {
  background: color-mix(in srgb, var(--primary) 18%, transparent);
  color: var(--primary);
}

.quick-command-group-meta {
  font-size: var(--dw-text-2xs);
}

.settings-secondary-button--compact {
  min-height: 26px;
  padding: 0 8px;
  font-size: var(--dw-text-2xs);
}

.quick-commands-other {
  margin: 4px 18px 8px;
}

.quick-commands-other-toggle {
  display: flex;
  width: 100%;
  align-items: center;
  border: 0;
  padding: 6px 0;
  background: transparent;
  color: var(--muted-foreground);
  font-size: var(--dw-text-xs);
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}

.quick-commands-other-toggle:hover {
  color: var(--foreground);
}

.quick-commands-other .settings-list {
  margin: 0;
}

.quick-commands-other-group {
  flex-wrap: wrap;
}

.quick-commands-other-rows {
  flex: 1 1 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
}

.quick-commands-other-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
}

.quick-commands-other-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: var(--dw-text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
