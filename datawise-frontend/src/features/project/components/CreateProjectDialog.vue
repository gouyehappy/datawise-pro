<script setup lang="ts">
import {computed, nextTick, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, FormField, ModalActions, DwInlineAlert, DwInput, DwSelect} from '@/core/components'
import type {SelectOption} from '@/core/components/select.types'
import type {ProjectTemplateId} from '@/features/project/services/project-api'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: [payload: {name: string; templateId: ProjectTemplateId}]
}>()

const {t} = useI18n()
const name = ref('')
const templateId = ref<ProjectTemplateId>('blank')
const error = ref('')
const inputRef = ref<{ $el?: HTMLElement } | null>(null)

const templateOptions = computed<SelectOption[]>(() => [
  {value: 'blank', label: t('app.titleBar.projectSwitcher.templates.blank')},
  {value: 'ecommerce', label: t('app.titleBar.projectSwitcher.templates.ecommerce')},
  {value: 'data-platform', label: t('app.titleBar.projectSwitcher.templates.dataPlatform')},
])

watch(
    () => props.open,
    async (isOpen) => {
      if (!isOpen) return
      name.value = ''
      templateId.value = 'blank'
      error.value = ''
      await nextTick()
      const el = inputRef.value?.$el
      if (el instanceof HTMLInputElement) {
        el.focus()
        el.select()
      }
    },
)

function close() {
  emit('update:open', false)
}

function submit() {
  const text = name.value.trim()
  if (!text) {
    error.value = t('app.titleBar.projectSwitcher.newNameRequired')
    return
  }
  error.value = ''
  emit('confirm', {name: text, templateId: templateId.value})
  close()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    submit()
  }
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('app.titleBar.projectSwitcher.newProjectTitle')"
      width="420px"
      @close="close"
  >
    <form class="modal-form" @submit.prevent="submit">
      <FormField :label="t('app.titleBar.projectSwitcher.newNamePrompt')">
        <template #default="{ id }">
          <DwInput
              :id="id"
              ref="inputRef"
              v-model="name"
              type="text"
              :placeholder="t('app.titleBar.projectSwitcher.newNamePlaceholder')"
              @keydown="onKeydown"
          />
        </template>
      </FormField>
      <FormField :label="t('app.titleBar.projectSwitcher.templateLabel')">
        <DwSelect v-model="templateId" :options="templateOptions"/>
      </FormField>
      <DwInlineAlert :message="error"/>
    </form>

    <template #footer>
      <ModalActions
          :confirm-label="t('common.confirm')"
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
  gap: var(--dw-space-3);
}
</style>
