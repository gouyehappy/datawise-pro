<script setup lang="ts">
/**
 * Thin host wrapper — SoT `@datawise/overlays` UnsavedChangesDialog.
 * Product copy via vue-i18n (`workspace.unsaved*`).
 */
import {useI18n} from 'vue-i18n'
import {UnsavedChangesDialog as PackageUnsavedChangesDialog} from '@datawise/overlays'

defineProps<{
  open: boolean
  title: string
  message: string
}>()

defineEmits<{
  'update:open': [value: boolean]
  save: []
  discard: []
  cancel: []
}>()

const {t} = useI18n()
</script>

<template>
  <PackageUnsavedChangesDialog
      :open="open"
      :title="title"
      :message="message"
      :discard-label="t('workspace.unsavedDiscard')"
      :cancel-label="t('common.cancel')"
      :save-label="t('workspace.unsavedSave')"
      @update:open="$emit('update:open', $event)"
      @save="$emit('save')"
      @discard="$emit('discard')"
      @cancel="$emit('cancel')"
  />
</template>
