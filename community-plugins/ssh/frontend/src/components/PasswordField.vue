<script setup lang="ts">
import { ref } from "vue";
import { Eye, EyeOff } from "@lucide/vue";

defineProps<{
  modelValue: string;
  placeholder?: string;
  disabled?: boolean;
  ariaInvalid?: boolean;
  t?: (key: string, values?: Record<string, string | number>) => string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  input: [];
  "keydown": [event: KeyboardEvent];
}>();

const show = ref(false);
</script>

<template>
  <div class="password-field">
    <input
      :type="show ? 'text' : 'password'"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-invalid="ariaInvalid ? 'true' : undefined"
      autocomplete="off"
      spellcheck="false"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value); emit('input')"
      @keydown="emit('keydown', $event)"
    />
    <button type="button" class="icon-button" :disabled="disabled" @click="show = !show">
      <EyeOff v-if="show" />
      <Eye v-else />
    </button>
  </div>
</template>

<style scoped>
.password-field {
  display: flex;
  align-items: center;
  gap: 4px;
}
.password-field input {
  flex: 1;
  min-width: 0;
}
</style>
