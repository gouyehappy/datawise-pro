<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwConfirmAlert, DwInlineAlert, ModalActions} from '@/core/components'
import type {SessionKillMode} from '@/features/workspace/services/session-kill.service'

const props = defineProps<{
  open: boolean
  mode: SessionKillMode
  loading?: boolean
  error?: string
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const {t} = useI18n()

const isConnectionKill = computed(() => props.mode === 'connection')

const title = computed(() =>
    isConnectionKill.value
        ? t('console.cancelExecution.dialogTitleConnection')
        : t('console.cancelExecution.dialogTitleQuery'),
)

const message = computed(() =>
    isConnectionKill.value
        ? t('console.cancelExecution.dialogBodyConnection')
        : t('console.cancelExecution.dialogBodyQuery'),
)
</script>

<template>
  <AppModal
      :open="open"
      :title="title"
      width="480px"
      @close="emit('cancel')"
  >
    <DwConfirmAlert
        :variant="isConnectionKill ? 'danger' : 'warning'"
        :message="message"
        :hint="isConnectionKill ? t('console.cancelExecution.dialogHintConnection') : null"
    />
    <DwInlineAlert density="banner" :message="error"/>

    <template #footer>
      <ModalActions
          :confirm-label="loading ? t('console.cancelExecution.cancelling') : t('console.cancelExecution.confirmAction')"
          confirm-variant="danger"
          :confirm-disabled="loading"
          @cancel="emit('cancel')"
          @confirm="emit('confirm')"
      />
    </template>
  </AppModal>
</template>
