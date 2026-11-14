<script setup lang="ts">
/**
 * Global ConfirmDialog host so services can await askAppConfirm() without window.confirm.
 */
import {onBeforeUnmount, onMounted} from 'vue'
import ConfirmDialog from '@/core/components/ConfirmDialog.vue'
import {useConfirmDialog} from '@/core/composables/useConfirmDialog'
import {setAppConfirmHandler} from '@/core/services/app-confirm.service'

const {
  open,
  title,
  message,
  confirmLabel,
  confirmVariant,
  confirmLoading,
  ask,
  onConfirm,
  onOpenUpdate,
} = useConfirmDialog('danger')

onMounted(() => {
  setAppConfirmHandler((request) => ask(request))
})

onBeforeUnmount(() => {
  setAppConfirmHandler(null)
})
</script>

<template>
  <!-- Mount only while open — avoids idle DialogRoot/reka FocusScope trapping the shell. -->
  <ConfirmDialog
      v-if="open"
      :open="open"
      :title="title"
      :message="message"
      :confirm-label="confirmLabel"
      :confirm-variant="confirmVariant"
      :confirm-loading="confirmLoading"
      @update:open="onOpenUpdate"
      @confirm="onConfirm"
  />
</template>
