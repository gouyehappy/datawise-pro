<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwConfirmAlert, ModalActions} from '@/core/components'
import type {SessionKillMode} from '@/features/workspace/services/session-kill.service'

const props = defineProps<{
  open: boolean
  sessionId: string
  mode: SessionKillMode
  loading?: boolean
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const {t} = useI18n()

const isConnectionKill = computed(() => props.mode === 'connection')

const title = computed(() =>
    isConnectionKill.value
        ? t('shortcut.sessionKill.dialogTitleConnection')
        : t('shortcut.sessionKill.dialogTitleQuery'),
)

const message = computed(() =>
    isConnectionKill.value
        ? t('shortcut.sessionKill.dialogBodyConnection', {id: props.sessionId})
        : t('shortcut.sessionKill.dialogBodyQuery', {id: props.sessionId}),
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
        :hint="isConnectionKill ? t('shortcut.sessionKill.dialogHintConnection') : null"
    />

    <template #footer>
      <ModalActions
          :confirm-label="loading ? t('shortcut.sessionKill.killing') : t('shortcut.sessionKill.confirmAction')"
          confirm-variant="danger"
          :confirm-disabled="loading"
          @cancel="emit('cancel')"
          @confirm="emit('confirm')"
      />
    </template>
  </AppModal>
</template>
