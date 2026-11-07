<script setup lang="ts">
import {computed, nextTick, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, FormField, ModalActions, DwInlineAlert, DwInput} from '@/core/components'

const props = defineProps<{
    open: boolean
    fileName: string
    busy?: boolean
}>()

const emit = defineEmits<{
    'update:open': [value: boolean]
    confirm: [payload: {passphrase: string}]
}>()

const {t} = useI18n()
const passphrase = ref('')
const inputRef = ref<{ $el?: HTMLElement } | null>(null)

const canSubmit = computed(() => !props.busy && passphrase.value.length >= 4)

watch(
    () => props.open,
    async (isOpen) => {
        if (!isOpen) return
        passphrase.value = ''
        await nextTick()
        const el = inputRef.value?.$el
        if (el instanceof HTMLInputElement) el.focus()
    },
)

function close() {
    if (props.busy) return
    emit('update:open', false)
}

function submit() {
    if (!canSubmit.value) return
    emit('confirm', {passphrase: passphrase.value})
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('explorer.importConnectionTitle')"
      :subtitle="t('explorer.importConnectionSubtitle', {name: fileName})"
      width="420px"
      @close="close"
  >
    <form class="modal-form" @submit.prevent="submit" @keydown.enter.prevent="submit">
      <DwInlineAlert
          density="banner"
          variant="info"
          :message="t('explorer.importConnectionHint')"
      />
      <FormField :label="t('settings.configPortability.passphrase')">
        <template #default="{ id }">
          <DwInput
              :id="id"
              ref="inputRef"
              v-model="passphrase"
              type="password"
              autocomplete="current-password"
              :disabled="busy"
              :placeholder="t('explorer.importConnectionPassphraseHint')"
          />
        </template>
      </FormField>
    </form>

    <template #footer>
      <ModalActions
          :confirm-label="t('explorer.importConnections')"
          :confirm-disabled="!canSubmit"
          :confirm-loading="busy"
          @cancel="close"
          @confirm="submit"
      />
    </template>
  </AppModal>
</template>

<style scoped>
.modal-form {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
}
</style>
