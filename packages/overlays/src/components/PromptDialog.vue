<script setup lang="ts">
import {nextTick, ref, watch} from 'vue'
import {FormField, DwInlineAlert, DwInput} from '@datawise/ui'
import AppModal from './AppModal.vue'
import ModalActions from './ModalActions.vue'

const props = defineProps<{
  open: boolean
  title: string
  subtitle?: string
  label: string
  defaultValue?: string
  placeholder?: string
  requiredMessage?: string
  /** Return error text to keep dialog open; empty/null closes on confirm. */
  validate?: (value: string) => string | null | undefined
  confirmLabel?: string
  cancelLabel?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: [value: string]
}>()

const value = ref('')
const error = ref('')
const inputRef = ref<{ $el?: HTMLElement } | null>(null)

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return
    value.value = props.defaultValue ?? ''
    error.value = ''
    await nextTick()
    const el = inputRef.value?.$el
    if (el instanceof HTMLInputElement) {
      el.focus()
      el.select()
    }
  },
)

function close() {
  emit('update:open', false)
}

function submit() {
  const text = value.value.trim()
  if (!text) {
    error.value = props.requiredMessage ?? ''
    return
  }
  const invalid = props.validate?.(text)?.trim()
  if (invalid) {
    error.value = invalid
    return
  }
  error.value = ''
  emit('confirm', text)
  close()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    submit()
  }
}
</script>

<template>
  <AppModal :open="open" :title="title" :subtitle="subtitle" width="400px" @close="close">
    <form class="modal-form" @submit.prevent="submit">
      <FormField :label="label">
        <template #default="{ id }">
          <DwInput
              :id="id"
              ref="inputRef"
              v-model="value"
              type="text"
              :placeholder="placeholder"
              @keydown="onKeydown"
          />
        </template>
      </FormField>
      <DwInlineAlert :message="error"/>
    </form>

    <template #footer>
      <ModalActions
          :cancel-label="cancelLabel"
          :confirm-label="confirmLabel"
          @cancel="close"
          @confirm="submit"
      />
    </template>
  </AppModal>
</template>
