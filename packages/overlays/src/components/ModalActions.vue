<script setup lang="ts">
import {DwButton, useDwI18n} from '@datawise/ui'

withDefaults(
  defineProps<{
    cancelLabel?: string
    confirmLabel?: string
    confirmDisabled?: boolean
    confirmLoading?: boolean
    confirmVariant?: 'primary' | 'danger'
    showCancel?: boolean
  }>(),
  {confirmDisabled: false, confirmLoading: false, confirmVariant: 'primary', showCancel: true},
)

const emit = defineEmits<{
  cancel: []
  confirm: []
}>()

const t = useDwI18n()
</script>

<template>
  <DwButton v-if="showCancel" variant="ghost" type="button" @click="emit('cancel')">
    {{ cancelLabel ?? t('common.cancel') }}
  </DwButton>
  <DwButton
    :variant="confirmVariant"
    type="button"
    :disabled="confirmDisabled"
    :loading="confirmLoading"
    @click="emit('confirm')"
  >
    {{ confirmLabel ?? t('common.save') }}
  </DwButton>
</template>
