<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {AppModal, DwSelect, DwInput, FormField, ModalActions} from '@/core/components'
import type {SelectOption} from '@/core/components/select.types'
import type {MyCommandMode} from '@/features/ssh/services/ssh-my-commands.service'
import type {SshConnectionProfile} from '@/features/ssh/services/ssh-connection-profile.service'

const props = defineProps<{
  open: boolean
  title: string
  subtitle?: string
  profile: SshConnectionProfile
  confirmLabel?: string
  cancelLabel?: string
  tabNoteLabel: string
  onConnectLabel: string
  onConnectModeLabel: string
  defaultCwdLabel: string
  runModeLabel: string
  pasteModeLabel: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: [profile: SshConnectionProfile]
}>()

const tabNote = ref('')
const onConnectCommand = ref('')
const onConnectMode = ref<MyCommandMode>('paste')
const defaultCwd = ref('')

const onConnectModeOptions = computed<SelectOption[]>(() => [
  {value: 'paste', label: props.pasteModeLabel},
  {value: 'run', label: props.runModeLabel},
])

watch(
    () => props.open,
    (isOpen) => {
      if (!isOpen) return
      tabNote.value = props.profile.tabNote ?? ''
      onConnectCommand.value = props.profile.onConnectCommand ?? ''
      onConnectMode.value = props.profile.onConnectMode ?? 'paste'
      defaultCwd.value = props.profile.defaultCwd ?? ''
    },
)

function close() {
  emit('update:open', false)
}

function submit() {
  emit('confirm', {
    tabNote: tabNote.value.trim() || undefined,
    onConnectCommand: onConnectCommand.value.trim() || undefined,
    onConnectMode: onConnectMode.value,
    defaultCwd: defaultCwd.value.trim() || undefined,
  })
  close()
}
</script>

<template>
  <AppModal :open="open" :title="title" :subtitle="subtitle" width="480px" @close="close">
    <form class="modal-form" @submit.prevent="submit">
      <FormField :label="tabNoteLabel">
        <template #default="{ id }">
          <DwInput :id="id" v-model="tabNote" type="text"/>
        </template>
      </FormField>
      <FormField :label="defaultCwdLabel">
        <template #default="{ id }">
          <DwInput :id="id" v-model="defaultCwd" type="text" placeholder="/var/log"/>
        </template>
      </FormField>
      <FormField :label="onConnectLabel">
        <template #default="{ id }">
          <DwInput
              :id="id"
              v-model="onConnectCommand"
              class="ssh-profile__textarea"
              :rows="3"
          />
        </template>
      </FormField>
      <FormField :label="onConnectModeLabel">
        <template #default="{ id }">
          <DwSelect
              :id="id"
              v-model="onConnectMode"
              :options="onConnectModeOptions"
              :searchable="false"
              :clearable="false"
          />
        </template>
      </FormField>
    </form>

    <template #footer>
      <ModalActions
          :confirm-label="confirmLabel"
          :cancel-label="cancelLabel"
          @confirm="submit"
          @cancel="close"
      />
    </template>
  </AppModal>
</template>

<style scoped>
.ssh-profile__textarea,
:deep(.ssh-profile__textarea) {
  min-height: 72px;
  resize: vertical;
  font-family: inherit;
}
</style>
