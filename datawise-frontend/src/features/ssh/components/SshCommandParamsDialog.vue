<script setup lang="ts">
import {nextTick, ref, watch} from 'vue'
import {AppModal, DwInlineAlert, DwInput, FormField, ModalActions} from '@/core/components'

const props = defineProps<{
  open: boolean
  title: string
  subtitle?: string
  params: string[]
  defaults?: Record<string, string>
  confirmLabel?: string
  cancelLabel?: string
  requiredMessage?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: [values: Record<string, string>]
}>()

const values = ref<Record<string, string>>({})
const error = ref('')
const inputRefs = ref<Array<{ $el?: HTMLElement } | null>>([])

watch(
    () => props.open,
    async (isOpen) => {
      if (!isOpen) return
      const next: Record<string, string> = {}
      for (const name of props.params) {
        next[name] = props.defaults?.[name] ?? ''
      }
      values.value = next
      error.value = ''
      inputRefs.value = []
      await nextTick()
      const el = inputRefs.value[0]?.$el
      if (el instanceof HTMLInputElement) el.focus()
    },
)

function close() {
  emit('update:open', false)
}

function submit() {
  for (const name of props.params) {
    if (!values.value[name]?.trim()) {
      error.value = props.requiredMessage ?? ''
      return
    }
  }
  emit('confirm', {...values.value})
  close()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    submit()
  }
}
</script>

<template>
  <AppModal :open="open" :title="title" :subtitle="subtitle" width="440px" @close="close">
    <form class="modal-form" @submit.prevent="submit">
      <FormField
          v-for="(name, index) in params"
          :key="name"
          :label="name"
      >
        <template #default="{ id }">
          <DwInput
              :id="id"
              :ref="(el) => { if (el) inputRefs[index] = el as { $el?: HTMLElement } }"
              v-model="values[name]"
              type="text"
              :placeholder="name"
              @keydown="onKeydown"
          />
        </template>
      </FormField>
      <DwInlineAlert :message="error"/>
    </form>

    <template #footer>
      <ModalActions
          :confirm-label="confirmLabel"
          :cancel-label="cancelLabel"
          @confirm="submit"
          @cancel="close"
      />
    </template>
  </AppModal>
</template>
