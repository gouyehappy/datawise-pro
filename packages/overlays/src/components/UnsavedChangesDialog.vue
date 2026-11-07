<script setup lang="ts">
import {computed} from 'vue'
import {DwButton, useDwI18n} from '@datawise/ui'
import AppModal from './AppModal.vue'

const props = defineProps<{
  open: boolean
  title: string
  message: string
  discardLabel?: string
  cancelLabel?: string
  saveLabel?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: []
  discard: []
  cancel: []
}>()

const t = useDwI18n()

const resolvedDiscardLabel = computed(() => props.discardLabel ?? t('unsaved.discard'))
const resolvedCancelLabel = computed(() => props.cancelLabel ?? t('common.cancel'))
const resolvedSaveLabel = computed(() => props.saveLabel ?? t('unsaved.save'))

function onSave() {
  emit('update:open', false)
  emit('save')
}

function onDiscard() {
  emit('update:open', false)
  emit('discard')
}

function onCancel() {
  emit('update:open', false)
  emit('cancel')
}
</script>

<template>
  <AppModal :open="open" :title="title" width="420px" @close="onCancel">
    <p class="modal-message">{{ message }}</p>

    <template #footer>
      <DwButton variant="ghost" type="button" @click="onDiscard">
        {{ resolvedDiscardLabel }}
      </DwButton>
      <DwButton variant="ghost" type="button" @click="onCancel">
        {{ resolvedCancelLabel }}
      </DwButton>
      <DwButton variant="primary" type="button" @click="onSave">
        {{ resolvedSaveLabel }}
      </DwButton>
    </template>
  </AppModal>
</template>
