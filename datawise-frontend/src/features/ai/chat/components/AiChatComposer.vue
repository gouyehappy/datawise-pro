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
import {
  targetPrimaryLabel,
  type AiDatabaseTarget,
} from '@/features/ai/shared/utils/database-targets'

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
  /** 未选任何表且未进入通用问答模式：此时提问必然降质，需要先收敛范围 */
  needsScope?: boolean
  /** 用户显式选择的「通用问答」 */
  generalMode?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  send: [prompt: string]
  stop: []
  removeTarget: [id: string]
  keydown: [event: KeyboardEvent]
  openScope: []
  toggleGeneral: []
  scopeBlocked: []
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
  // 无范围时不做静默降级：交给上层提示并给出选表入口，附件也不会被清空
  if (props.needsScope) {
    emit('scopeBlocked')
    return
  }
  void buildSendPayload(props.modelValue.trim()).then((prompt) => {
    if (!prompt || props.quotaExhausted || props.sending) return
    emit('send', prompt)
  })
}

function getAttachments(): ChatAttachment[] {
  return [...attachments.value]
}

/** 输入区只显示表名；完整路径放 title，避免与顶部数据源重复。 */
function shortTargetLabel(target: AiDatabaseTarget): string {
  return targetPrimaryLabel(target)
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
      <span
          v-for="target in selectedTargets"
          :key="target.id"
          class="composer-target"
          :title="formatTargetLabel(target)"
      >
        <TagChip
            removable
            :remove-label="t('common.close')"
            @remove="emit('removeTarget', target.id)"
        >
          <template #icon>
            <DbTypeIcon :db-type="target.dbType" :size="DB_TYPE_ICON_SIZE.compact"/>
          </template>
          {{ shortTargetLabel(target) }}
        </TagChip>
      </span>
    </div>

    <div v-else class="composer-scope-gate">
      <button
          type="button"
          class="scope-chip"
          :class="{ 'is-general': generalMode }"
          :title="t('ai.scopeGate.pickTableTitle')"
          @click="emit('openScope')"
      >
        <DwIcon :name="generalMode ? 'info' : 'database'" size="xs" :stroke-width="1.6"/>
        {{ generalMode ? t('ai.scopeGate.generalChip') : t('ai.noDatabaseSelected') }}
      </button>
      <button type="button" class="scope-switch" @click="emit('toggleGeneral')">
        {{ generalMode ? t('ai.scopeGate.disableGeneral') : t('ai.scopeGate.enableGeneral') }}
      </button>
    </div>

    <div
        class="composer-card"
        :class="{ 'is-sending': sending, 'is-listening': listening, 'is-unscoped': needsScope }"
    >
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
          :placeholder="needsScope ? t('ai.scopeGate.placeholder') : t('ai.composer.placeholder')"
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

    <p
        v-if="!selectedTargets.length"
        class="composer-scope-note"
        :class="{ 'is-general': generalMode }"
    >
      {{ generalMode ? t('ai.scopeGate.generalHint') : t('ai.scopeGate.oneStepHint') }}
    </p>
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
  gap: var(--dw-gap-sm);
  margin-bottom: var(--dw-space-4);
}

.composer-scope-gate {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-gap);
  margin-bottom: var(--dw-space-4);
}

.scope-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-2);
  max-width: 100%;
  min-width: 0;
  padding: 3px var(--dw-space-3);
  border: 1px solid color-mix(in srgb, var(--dw-primary) 34%, var(--dw-border-light));
  border-radius: var(--dw-radius-pill);
  background: color-mix(in srgb, var(--dw-primary) 10%, transparent);
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  cursor: pointer;
  transition: background var(--dw-duration-fast) var(--dw-ease),
  border-color var(--dw-duration-fast) var(--dw-ease);
}

.scope-chip:hover {
  background: color-mix(in srgb, var(--dw-primary) 18%, transparent);
}

.scope-chip.is-general {
  border-color: color-mix(in srgb, var(--dw-warning) 42%, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-warning) 12%, transparent);
  color: var(--dw-warning-fg);
}

.scope-switch {
  padding: 0 var(--dw-space-2);
  border: none;
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-density-md);
  cursor: pointer;
}

.scope-switch:hover {
  color: var(--dw-primary);
  background: color-mix(in srgb, var(--dw-primary) 8%, transparent);
}

.composer-scope-note {
  margin: var(--dw-space-3) 0 0;
  padding-left: var(--dw-space-1);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-snug);
  color: var(--dw-text-muted);
}

.composer-scope-note.is-general {
  color: var(--dw-warning-fg);
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

/* 无范围：视觉上明确「还缺一步」，而不是让用户以为可以直接发 */
.composer-card.is-unscoped {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--dw-border) 90%, var(--dw-text-muted));
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
