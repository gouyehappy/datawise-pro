<script setup lang="ts">
import {ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, FormField, ModalActions, DwInlineAlert, DwSecretInput} from '@/core/components'
import {authApi} from '@/api'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const props = withDefaults(defineProps<{
  open: boolean
  /** When true, dialog cannot be dismissed until password is changed. */
  forced?: boolean
}>(), {
  forced: false,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  success: []
}>()

const {t} = useI18n()

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const error = ref('')
const saving = ref(false)

watch(
    () => props.open,
    (isOpen) => {
      if (!isOpen) return
      currentPassword.value = ''
      newPassword.value = ''
      confirmPassword.value = ''
      error.value = ''
    },
)

function close() {
  if (props.forced) return
  emit('update:open', false)
}

async function submit() {
  const current = currentPassword.value
  const next = newPassword.value.trim()
  const confirm = confirmPassword.value.trim()

  if (!current || !next || !confirm) {
    error.value = t('profile.changePasswordRequired')
    return
  }
  if (next.length < 6) {
    error.value = t('profile.changePasswordTooShort')
    return
  }
  if (next !== confirm) {
    error.value = t('profile.changePasswordMismatch')
    return
  }

  saving.value = true
  error.value = ''
  try {
    await authApi.changePassword(current, next)
    emit('success')
    emit('update:open', false)
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'profile.changePasswordFailed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppModal
      :open="open"
      :title="forced ? t('profile.changePasswordForcedTitle') : t('profile.changePasswordTitle')"
      :subtitle="forced ? t('profile.changePasswordForcedSubtitle') : t('profile.changePasswordSubtitle')"
      :close-on-backdrop="!forced"
      :close-on-escape="!forced"
      :show-close="!forced"
      @close="close"
  >
    <form class="modal-form" @submit.prevent="submit">
      <FormField :label="t('profile.currentPassword')" input-id="change-password-current">
        <template #default="{ id }">
          <DwSecretInput
              :id="id"
              v-model="currentPassword"
              autocomplete="current-password"
          />
        </template>
      </FormField>

      <FormField :label="t('profile.newPassword')" input-id="change-password-new">
        <template #default="{ id }">
          <DwSecretInput
              :id="id"
              v-model="newPassword"
              autocomplete="new-password"
          />
        </template>
      </FormField>

      <FormField :label="t('profile.confirmPassword')" input-id="change-password-confirm">
        <template #default="{ id }">
          <DwSecretInput
              :id="id"
              v-model="confirmPassword"
              autocomplete="new-password"
          />
        </template>
      </FormField>

      <DwInlineAlert :message="error"/>
    </form>

    <template #footer>
      <ModalActions
          :confirm-label="saving ? t('profile.changePasswordSaving') : t('profile.changePassword')"
          :confirm-disabled="saving"
          :show-cancel="!forced"
          @cancel="close"
          @confirm="submit"
      />
    </template>
  </AppModal>
</template>
