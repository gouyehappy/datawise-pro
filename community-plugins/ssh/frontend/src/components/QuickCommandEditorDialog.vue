<script setup lang="ts">
/**
 * Quick command add/edit form. Shared by the settings card "Add" row and the list rows
 * inside the quick-command manage dialog, so both paths use one form.
 */
import { computed, reactive, watch } from "vue";
import { X } from "@lucide/vue";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Switch } from "./ui/switch";
import {
  QUICK_COMMAND_GROUP_MAX_LENGTH,
  QUICK_COMMANDS_LIMIT,
  canAddQuickCommandInScope,
  countQuickCommandsInScope,
  type QuickCommand,
} from "../lib/quickCommands";

const props = withDefaults(
  defineProps<{
    open: boolean;
    commands: QuickCommand[];
    connectionId: string;
    saving?: boolean;
    item?: QuickCommand | null;
    t: (key: string, values?: Record<string, string | number>) => string;
  }>(),
  {
    saving: false,
    item: null,
  },
);

const emit = defineEmits<{
  save: [payload: { id?: string; name: string; command: string; group: string; scope: "global" | "connection" }];
  "update:open": [value: boolean];
}>();

const draft = reactive<{ id?: string; name: string; command: string; group: string; scope: "global" | "connection" }>({
  name: "",
  command: "",
  group: "",
  scope: "connection",
});

function initDraft(item: QuickCommand | null) {
  draft.id = item?.id;
  draft.name = item?.name ?? "";
  draft.command = item?.command ?? "";
  draft.group = item?.group ?? "";
  if (item) {
    draft.scope = item.connectionId?.trim() ? "connection" : "global";
  } else {
    draft.scope = props.connectionId ? "connection" : "global";
  }
}

watch(
  () => [props.open, props.item] as const,
  ([open]) => {
    if (open) initDraft(props.item ?? null);
  },
  { immediate: true },
);

const draftScopeId = computed(() => (draft.scope === "connection" ? props.connectionId : ""));
const draftScopeCount = computed(() => countQuickCommandsInScope(props.commands, draftScopeId.value || null));
const draftCanAdd = computed(() => {
  if (draft.id) {
    const existing = props.commands.find((item) => item.id === draft.id);
    const sameScope = (existing?.connectionId?.trim() ?? "") === (draftScopeId.value || "");
    if (sameScope) return true;
  }
  return canAddQuickCommandInScope(props.commands, draftScopeId.value || null);
});

function setDraftBound(bound: boolean | undefined) {
  draft.scope = bound === true && props.connectionId ? "connection" : "global";
}

function close() {
  emit("update:open", false);
}

function submit() {
  if (!draft.command.trim() || props.saving || !draftCanAdd.value) return;
  emit("save", {
    id: draft.id,
    name: draft.name,
    command: draft.command,
    group: draft.group,
    scope: draft.scope,
  });
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(value) => emit('update:open', value)">
    <DialogContent
      class="modal settings-form-modal quick-command-modal"
      @escape-key-down.prevent
      @pointer-down-outside.prevent
      @interact-outside.prevent
    >
      <header>
        <DialogTitle>{{ draft.id ? t("quickCommandsEdit") : t("quickCommandsNew") }}</DialogTitle>
        <button type="button" :title="t('cancel')" class="icon-button" @click="close"><X /></button>
      </header>
      <div class="settings-form-body">
        <label class="settings-field">
          <span>{{ t("quickCommandsName") }}</span>
          <input v-model="draft.name" :placeholder="t('quickCommandsName')" :maxlength="60" autofocus />
        </label>
        <label class="settings-field">
          <span>{{ t("quickCommands.groupPlaceholder") }}</span>
          <input v-model="draft.group" :placeholder="t('quickCommands.groupPlaceholder')" :maxlength="QUICK_COMMAND_GROUP_MAX_LENGTH" />
        </label>
        <div class="settings-pref">
          <div class="settings-pref-copy">
            <span class="settings-pref-label">{{ t("quickCommands.bindCurrent") }}</span>
            <span class="settings-pref-hint">{{ connectionId ? t("quickCommands.scope.connection") : t("quickCommands.scope.global") }}</span>
          </div>
          <div class="settings-pref-control">
            <Switch size="sm" :model-value="draft.scope === 'connection'" :disabled="!connectionId" @update:model-value="setDraftBound" />
          </div>
        </div>
        <label class="settings-field">
          <span>{{ t("quickCommandsCommand") }}</span>
          <textarea v-model="draft.command" class="mono" rows="4" :placeholder="t('quickCommandsCommand')" :maxlength="500" @keydown.ctrl.enter="submit" />
        </label>
        <p class="muted settings-note">{{ t("quickCommandsTemplateHint") }}</p>
        <p class="muted settings-note">{{ t("quickCommands.limitScope", { count: draftScopeCount, limit: QUICK_COMMANDS_LIMIT }) }}</p>
      </div>
      <footer>
        <button type="button" @click="close">{{ t("cancel") }}</button>
        <button type="button" class="primary-button" :disabled="saving || !draft.command.trim() || !draftCanAdd" @click="submit">
          {{ draft.id ? t("save") : t("quickCommandsAdd") }}
        </button>
      </footer>
    </DialogContent>
  </Dialog>
</template>
