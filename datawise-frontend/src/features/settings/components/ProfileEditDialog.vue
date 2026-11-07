<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, FormField, ModalActions, DwInlineAlert, DwInput} from '@/core/components'

const props = defineProps<{
  open: boolean
  name: string
  email: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [payload: { name: string; email: string }]
}>()

const {t} = useI18n()

const formName = ref('')
const formEmail = ref('')
const error = ref('')

const avatarLetter = computed(() => {
  const letter = formName.value.trim().charAt(0)
  return letter ? letter.toUpperCase() : '?'
})

watch(
    () => props.open,
    (isOpen) => {
      if (!isOpen) return
      formName.value = props.name
      formEmail.value = props.email
      error.value = ''
    },
)

function close() {
  emit('update:open', false)
}

function submit() {
  const name = formName.value.trim()
  const email = formEmail.value.trim()
  if (!name || !email) {
    error.value = t('profile.editDialogRequired')
    return
  }
  emit('save', {name, email})
  close()
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('profile.editDialogTitle')"
      :subtitle="t('profile.editDialogSubtitle')"
      @close="close"
  >
    <div class="modal-preview-row">
      <div class="modal-preview-avatar">{{ avatarLetter }}</div>
      <div class="modal-preview-text">
        <span class="modal-preview-name">{{ formName.trim() || t('profile.defaultName') }}</span>
        <span class="modal-preview-email">{{ formEmail.trim() || '—' }}</span>
      </div>
    </div>

    <form class="modal-form" @submit.prevent="submit">
      <FormField :label="t('profile.displayNamePrompt')" input-id="profile-edit-name">
        <template #default="{ id }">
          <DwInput
              :id="id"
              v-model="formName"
              type="text"
              autocomplete="name"
              :placeholder="t('profile.defaultName')"
          />
        </template>
      </FormField>

      <FormField :label="t('profile.emailPrompt')" input-id="profile-edit-email">
        <template #default="{ id }">
          <DwInput
              :id="id"
              v-model="formEmail"
              type="email"
              autocomplete="email"
              placeholder="user@datawise.local"
          />
        </template>
      </FormField>

      <DwInlineAlert :message="error"/>
    </form>

    <template #footer>
      <ModalActions @cancel="close" @confirm="submit"/>
    </template>
  </AppModal>
</template>
