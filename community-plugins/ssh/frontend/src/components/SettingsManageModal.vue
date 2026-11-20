<script setup lang="ts">
/**
 * Shared shell for "manage X" settings dialogs (startup commands, assistant models,
 * quick commands, keyword highlights). Each resource keeps its own dialog — title,
 * hint, list body and an optional footer action — instead of sharing one tabbed surface.
 */
import { X } from "@lucide/vue";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";

const props = defineProps<{
  open: boolean;
  title: string;
  hint?: string;
  doneLabel: string;
  closeLabel: string;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

function close() {
  emit("update:open", false);
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(value) => emit('update:open', value)">
    <DialogContent
      class="modal settings-form-modal manage-modal"
      @escape-key-down.prevent
      @pointer-down-outside.prevent
      @interact-outside.prevent
    >
      <header>
        <div class="settings-form-heading">
          <DialogTitle>{{ props.title }}</DialogTitle>
          <p v-if="props.hint" class="muted">{{ props.hint }}</p>
        </div>
        <button type="button" class="icon-button" :title="props.closeLabel" @click="close"><X /></button>
      </header>
      <div class="settings-form-body">
        <slot />
      </div>
      <footer>
        <slot name="actions" />
        <button type="button" @click="close">{{ props.doneLabel }}</button>
      </footer>
    </DialogContent>
  </Dialog>
</template>
