<script setup lang="ts">
/**
 * AI 聊天输入区（豆包式一体化卡片：输入 + 底部工具栏）
 */
import {nextTick, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import DbTypeIcon from '@/core/components/DbTypeIcon.vue'
import {DB_TYPE_ICON_SIZE} from '@/features/connection/constants/db-type-icon-sizes'
import {TagChip, DwInput} from '@/core/components'
import {DwIcon} from '@/core/icons'
import {createId} from '@/core/utils/id'
import AiModelSelect from '@/features/ai/shared/components/AiModelSelect.vue'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {currentLocale} from '@/i18n'
import type {AiDatabaseTarget} from '@/features/ai/shared/utils/database-targets'

import {
  buildPromptWithAttachments,
  isTextAttachment,
  TEXT_ATTACHMENT_ACCEPT,
  type ChatAttachment,
} from '@/features/ai/chat/services/chat-attachment.service'

interface BrowserSpeechRecognition {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: { results: { [index: number]: { [index: number]: { transcript?: string } } } }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
}

const props = defineProps<{
  modelValue: string
  sending: boolean
  quotaExhausted?: boolean
  selectedTargets: AiDatabaseTarget[]
  formatTargetLabel: (target: AiDatabaseTarget) => string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  send: [prompt: string]
  stop: []
  removeTarget: [id: string]
  keydown: [event: KeyboardEvent]
}>()

const {t} = useI18n()
const toast = useAppToast()
const inputRef = ref<{
  focus: () => void
  getNativeElement: () => HTMLTextAreaElement | HTMLInputElement | null
} | null>(null)
const textareaRef = ref<HTMLTextAreaElement>()
const fileInputRef = ref<HTMLInputElement>()
const attachments = ref<ChatAttachment[]>([])
const listening = ref(false)

function bindNativeTextarea() {
  const el = inputRef.value?.getNativeElement?.()
  textareaRef.value = el instanceof HTMLTextAreaElement ? el : undefined
}

function resizeTextarea() {
  bindNativeTextarea()
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 128)}px`
}

function onModelUpdate(value: string | number | undefined) {
  emit('update:modelValue', String(value ?? ''))
  void nextTick(() => resizeTextarea())
}

function notifySkippedAttachments(skipped: string[]) {
  if (!skipped.length) return
  toast.warning(t('ai.composer.attachmentSkipped', {names: skipped.join(', ')}))
}

async function buildSendPayload(prompt: string) {
  const {prompt: combined, skipped} = await buildPromptWithAttachments(prompt, attachments.value)
  notifySkippedAttachments(skipped)
  clearAttachments()
  return combined
}

function onKeydown(event: KeyboardEvent) {
  emit('keydown', event)
}

function focus() {
  bindNativeTextarea()
  inputRef.value?.focus()
  textareaRef.value?.focus()
}

function pickFiles() {
  fileInputRef.value?.click()
}

function onFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files?.length) return
  const skipped: string[] = []
  for (const file of files) {
    if (!isTextAttachment(file)) {
      skipped.push(file.name)
      continue
    }
    attachments.value.push({id: createId('file'), name: file.name, file})
  }
  notifySkippedAttachments(skipped)
  input.value = ''
}

function removeAttachment(id: string) {
  attachments.value = attachments.value.filter((item) => item.id !== id)
}

function clearAttachments() {
  attachments.value = []
}

function startVoiceInput() {
  if (listening.value) return
  const win = window as Window & {
    SpeechRecognition?: new () => BrowserSpeechRecognition
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition
  }
  const SpeechRecognitionCtor = win.SpeechRecognition ?? win.webkitSpeechRecognition

  if (!SpeechRecognitionCtor) {
    toast.warning(t('ai.composer.voiceUnsupported'))
    return
  }

  const recognition = new SpeechRecognitionCtor()
  recognition.lang = currentLocale.value === 'zh-CN' ? 'zh-CN' : 'en-US'
  recognition.interimResults = false
  recognition.maxAlternatives = 1
  listening.value = true

  recognition.onresult = (event: { results: { [index: number]: { [index: number]: { transcript?: string } } } }) => {
    const transcript = event.results[0]?.[0]?.transcript?.trim()
    if (transcript) {
      const next = props.modelValue.trim()
          ? `${props.modelValue.trimEnd()} ${transcript}`
          : transcript
      emit('update:modelValue', next)
      nextTick(resizeTextarea)
    }
  }

  recognition.onerror = () => {
    toast.error(t('ai.composer.voiceFailed'))
  }

  recognition.onend = () => {
    listening.value = false
  }

  recognition.start()
}

watch(
    () => props.modelValue,
    async () => {
      await nextTick()
      resizeTextarea()
    },
)

function handleSend() {
  if (props.sending) {
    emit('stop')
    return
  }
  if (props.quotaExhausted) return
  void buildSendPayload(props.modelValue.trim()).then((prompt) => {
    if (!prompt || props.quotaExhausted || props.sending) return
    emit('send', prompt)
  })
}

function getAttachments(): ChatAttachment[] {
  return [...attachments.value]
}

defineExpose({
  focus,
  textareaRef,
  clearAttachments,
  getAttachments,
  buildSendPayload,
})
</script>

<template>
  <footer class="composer-wrap">
    <div v-if="selectedTargets.length" class="composer-targets">
      <TagChip
          v-for="target in selectedTargets"
          :key="target.id"
          removable
          :remove-label="t('common.close')"
          @remove="emit('removeTarget', target.id)"
      >
        <template #icon>
          <DbTypeIcon :db-type="target.dbType" :size="DB_TYPE_ICON_SIZE.compact"/>
        </template>
        {{ formatTargetLabel(target) }}
      </TagChip>
    </div>

    <div class="composer-card" :class="{ 'is-sending': sending, 'is-listening': listening }">
      <div v-if="attachments.length" class="composer-attachments">
        <TagChip
            v-for="item in attachments"
            :key="item.id"
            removable
            :remove-label="t('common.close')"
            @remove="removeAttachment(item.id)"
        >
          <template #icon>
            <DwIcon name="file" size="sm" :stroke-width="1.4"/>
          </template>
          {{ item.name }}
        </TagChip>
      </div>

      <DwInput
          ref="inputRef"
          class="composer-input"
          multiline
          :rows="1"
          :model-value="modelValue"
          :placeholder="t('ai.composer.placeholder')"
          :disabled="sending"
          @update:model-value="onModelUpdate"
          @keydown="onKeydown"
      />

      <div class="composer-toolbar">
        <input
            ref="fileInputRef"
            class="composer-file-input"
            type="file"
            multiple
            :accept="TEXT_ATTACHMENT_ACCEPT"
            tabindex="-1"
            aria-hidden="true"
            @change="onFilesSelected"
        />

        <button
            class="tool-btn"
            type="button"
            :title="`${t('ai.composer.attach')} — ${t('ai.composer.attachmentHint')}`"
            :aria-label="t('ai.composer.attach')"
            :disabled="sending"
            @click="pickFiles"
        >
          <DwIcon name="plus" size="md" :stroke-width="1.6"/>
        </button>

        <AiModelSelect variant="composer"/>

        <div class="composer-toolbar__spacer"/>

        <div class="composer-toolbar__end">
          <button
              class="tool-btn"
              :class="{ 'tool-btn--active': listening }"
              type="button"
              :title="t('ai.composer.voice')"
              :aria-label="t('ai.composer.voice')"
              :disabled="sending"
              @click="startVoiceInput"
          >
            <DwIcon name="mic" size="md" :stroke-width="1.5"/>
          </button>

          <button
              class="send-btn"
              :class="{ 'send-btn--stop': sending }"
              type="button"
              :disabled="sending ? false : (quotaExhausted || !modelValue.trim())"
              :title="sending ? t('ai.composer.stop') : t('common.send')"
              :aria-label="sending ? t('ai.composer.stop') : t('common.send')"
              @click="handleSend"
          >
            <template v-if="sending">
              <DwIcon name="stop" size="sm"/>
              <span class="send-btn__label">{{ t('ai.composer.stop') }}</span>
            </template>
            <DwIcon v-else name="send" size="sm" filled/>
          </button>
        </div>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.composer-wrap {
  flex-shrink: 0;
  padding: var(--dw-space-6) var(--dw-space-10) var(--dw-space-8);
}

.composer-targets {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap);
  margin-bottom: var(--dw-space-5);
}

.composer-card {
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg);
  box-shadow: var(--dw-composer-shell-shadow);
  padding: var(--dw-space-7) var(--dw-space-7) var(--dw-space-5);
  transition: var(--dw-transition-shadow);
}

.composer-card:focus-within {
  border-color: color-mix(in srgb, var(--dw-border) 70%, var(--dw-text-muted));
  box-shadow: var(--dw-composer-shell-shadow);
}

.composer-card.is-listening {
  border-color: color-mix(in srgb, var(--dw-primary) 35%, var(--dw-border));
}

.composer-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-sm);
  margin-bottom: var(--dw-space-4);
}

.composer-input,
.composer-card :deep(.composer-input) {
  display: block;
  width: 100%;
  min-height: var(--dw-density-xl);
  max-height: 128px;
  padding: 0;
  margin: 0;
  border: none;
  outline: none;
  box-shadow: none;
  resize: none;
  background: transparent;
  color: var(--dw-text);
  font-size: var(--dw-text-xl);
  line-height: var(--dw-leading-loose);
  font-family: inherit;
}

.composer-card :deep(.composer-input::placeholder) {
  color: var(--dw-text-muted);
}

.composer-card :deep(.composer-input:disabled) {
  opacity: 0.65;
  cursor: not-allowed;
}

.composer-card :deep(.composer-input:focus),
.composer-card :deep(.composer-input:focus-visible) {
  outline: none;
  box-shadow: none;
  border: none;
}

.composer-toolbar {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-xs);
  margin-top: var(--dw-space-3);
  padding-top: var(--dw-space-4);
  border-top: 1px solid var(--dw-border-light);
  min-width: 0;
  min-height: var(--dw-control-h);
}

.composer-file-input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.composer-toolbar__spacer {
  flex: 1;
  min-width: 8px;
}

.composer-toolbar__end {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  flex-shrink: 0;
}

.tool-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: var(--dw-tab-height);
  padding: 0;
  border: none;
  border-radius: var(--dw-radius-pill);
  background: var(--dw-bg-muted);
  color: var(--dw-text-secondary);
  cursor: pointer;
  transition: background var(--dw-duration) var(--dw-ease), color var(--dw-duration) var(--dw-ease);
}

.tool-btn:hover:not(:disabled) {
  background: var(--dw-bg-hover);
  color: var(--dw-text);
}

.tool-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.tool-btn--active {
  background: color-mix(in srgb, var(--dw-primary) 12%, var(--dw-bg-muted));
  color: var(--dw-primary);
}

.send-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: var(--dw-tab-height);
  padding: 0;
  border: none;
  border-radius: var(--dw-radius-pill);
  background: var(--dw-text);
  color: var(--dw-bg);
  cursor: pointer;
  transition: opacity var(--dw-duration) var(--dw-ease), transform var(--dw-duration) var(--dw-ease);
}

.send-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: scale(1.04);
}

.send-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.send-btn--stop {
  width: auto;
  min-width: 32px;
  gap: 4px;
  padding: 0 10px;
  background: var(--dw-danger);
  color: var(--dw-on-accent);
  border-radius: var(--dw-control-radius);
}

.send-btn__label {
  font-size: var(--dw-text-xs);
  font-weight: 600;
  line-height: 1;
}

.send-btn__spin {
  width: var(--dw-icon-size-sm);
  height: var(--dw-icon-size-sm);
  border: 2px solid color-mix(in srgb, var(--dw-bg) 35%, transparent);
  border-top-color: var(--dw-bg);
  border-radius: 50%;
  animation: composer-spin 0.7s linear infinite;
}

@keyframes composer-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
