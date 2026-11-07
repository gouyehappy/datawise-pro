<script setup lang="ts">
import { reactive, ref } from "vue";
import { X } from "@lucide/vue";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { executeTask, validateTask } from "../lib/protocolSessions";

const props = defineProps<{
  open: boolean;
  connectionId: string;
  t: (key: string, values?: Record<string, string | number>) => string;
}>();
const emit = defineEmits<{ "update:open": [boolean] }>();

const form = reactive({
  command: "echo hello",
  cwd: "",
});
const busy = ref(false);
const result = ref("");
const error = ref("");

function taskEnvelope() {
  return {
    task: {
      triggerId: "manual",
      connectionId: props.connectionId,
      config: {
        command: form.command,
        working_directory: form.cwd || "",
      },
    },
  };
}

async function run() {
  if (!props.connectionId || busy.value) return;
  busy.value = true;
  error.value = "";
  result.value = "";
  try {
    const payload = taskEnvelope();
    await validateTask(payload);
    const out = await executeTask(payload);
    result.value = typeof out === "string" ? out : JSON.stringify(out, null, 2);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="modal small-modal task-runner-dialog" @escape-key-down.prevent>
      <header>
        <DialogTitle>{{ t("task.title") }}</DialogTitle>
        <button :title="t('close')" :aria-label="t('close')" class="icon-button" @click="emit('update:open', false)">
          <X />
        </button>
      </header>
      <label class="settings-field">
        <span>{{ t("task.command") }}</span>
        <textarea v-model="form.command" class="mono" rows="4" spellcheck="false" />
      </label>
      <label class="settings-field">
        <span>{{ t("task.cwd") }}</span>
        <input v-model="form.cwd" class="mono" spellcheck="false" :placeholder="t('task.cwdPlaceholder')" />
      </label>
      <p v-if="!connectionId" class="muted task-hint">{{ t("task.needsConnection") }}</p>
      <p v-if="error" class="task-error">{{ error }}</p>
      <pre v-if="result" class="mono task-result">{{ result }}</pre>
      <footer>
        <button @click="emit('update:open', false)">{{ t("cancel") }}</button>
        <button class="primary-button" :disabled="busy || !connectionId || !form.command.trim()" @click="run">
          {{ busy ? t("task.running") : t("task.run") }}
        </button>
      </footer>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.task-hint {
  margin: 0;
  font-size: var(--dw-font-size);
  line-height: 1.5;
}
.task-error {
  margin: 0;
  color: var(--destructive, #dc2626);
  font-size: var(--dw-font-size);
  line-height: 1.45;
}
.task-result {
  max-height: 180px;
  margin: 0;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 8px 10px;
  background: var(--background);
  font-size: var(--dw-text-xs);
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
.task-runner-dialog textarea {
  min-height: 88px;
  resize: vertical;
  line-height: 1.45;
}
</style>
