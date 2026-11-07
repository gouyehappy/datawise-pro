<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {ConfirmDialog, PromptDialog} from '@/core/components'
import {useWorkspaceActions} from '@/features/layout/composables/useWorkspaceActions'

const {t} = useI18n()
const {
    switching,
    confirmDialog,
    promptDialog,
    closeConfirmDialog,
    closePromptDialog,
    handleConfirmDialog,
    handlePromptDialog,
} = useWorkspaceActions()
</script>

<template>
  <ConfirmDialog
      :open="confirmDialog !== null"
      :title="confirmDialog?.title ?? ''"
      :message="confirmDialog?.message ?? ''"
      :confirm-label="confirmDialog?.confirmLabel"
      :confirm-loading="switching"
      @update:open="(value) => { if (!value) closeConfirmDialog() }"
      @confirm="handleConfirmDialog"
  />

  <PromptDialog
      :open="promptDialog !== null"
      :title="promptDialog?.title ?? ''"
      :subtitle="promptDialog?.subtitle"
      :label="promptDialog?.label ?? ''"
      :default-value="promptDialog?.defaultValue"
      :confirm-label="t('common.confirm')"
      @update:open="(value) => { if (!value) closePromptDialog() }"
      @confirm="handlePromptDialog"
  />
</template>
