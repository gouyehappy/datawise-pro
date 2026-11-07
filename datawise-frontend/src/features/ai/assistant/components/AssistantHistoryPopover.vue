<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {usePopoverEscape} from '@/core/composables/usePopoverEscape'
import {EmptyState, IconButton} from '@/core/components'
import {DwIcon} from '@/core/icons'
import type {AiChatSession} from '@/features/ai/types/session'
import {clampAssistantHistoryLimit} from '@/features/ai/chat/services/ai-chat-persistence.service'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'

const props = defineProps<{
  sessions: AiChatSession[]
  activeSessionId: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
  create: []
  delete: [id: string]
}>()

const {t} = useI18n()
const appConfig = useAppConfigStore()
const rootRef = ref<HTMLElement>()
const open = ref(false)

usePopoverEscape(open, () => {
  open.value = false
}, {
  containRefs: () => [rootRef.value],
})

const historyLimit = computed(() =>
    clampAssistantHistoryLimit(appConfig.aiPreferences.assistantHistoryLimit),
)

function hasUserTurn(session: AiChatSession) {
  return session.messages.some((msg) => msg.role === 'user' && !!msg.content?.trim())
}

const recentSessions = computed(() =>
    props.sessions.filter(hasUserTurn).slice(0, historyLimit.value),
)

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function previewText(session: AiChatSession) {
  const lastUser = [...session.messages].reverse().find((msg) => msg.role === 'user')
  return lastUser?.content?.trim() || ''
}

function select(id: string) {
  emit('select', id)
  open.value = false
}

function create() {
  emit('create')
  open.value = false
}

function remove(id: string) {
  emit('delete', id)
}
</script>

<template>
  <div ref="rootRef" class="assistant-history">
    <IconButton
        size="sm"
        :title="t('assistant.history')"
        :aria-expanded="open"
        aria-haspopup="dialog"
        @click="open = !open"
    >
      <DwIcon name="history" size="sm" :stroke-width="1.5"/>
    </IconButton>

    <div
        v-if="open"
        class="assistant-history__panel"
        role="dialog"
        :aria-label="t('assistant.history')"
    >
      <header class="assistant-history__head">
        <strong>{{ t('assistant.history') }}</strong>
        <span>{{ t('assistant.historyLimitHint', {count: historyLimit}) }}</span>
      </header>

      <EmptyState
          v-if="!recentSessions.length"
          embedded
          compact
          class="assistant-history__empty"
          :title="t('assistant.historyEmptyTitle')"
          :hint="t('assistant.historyEmptyHint')"
      >
        <template #icon>
          <DwIcon name="history" size="md" :stroke-width="1.5"/>
        </template>
        <template #actions>
          <button type="button" class="assistant-history__empty-cta" @click="create">
            <DwIcon name="plus" size="sm" :stroke-width="1.5"/>
            {{ t('assistant.newChat') }}
          </button>
        </template>
      </EmptyState>

      <ul v-else class="assistant-history__list">
        <li v-for="session in recentSessions" :key="session.id">
          <button
              type="button"
              class="assistant-history__item"
              :class="{ 'is-active': session.id === activeSessionId }"
              @click="select(session.id)"
          >
            <span class="assistant-history__item-title">{{ session.title }}</span>
            <span class="assistant-history__item-preview">{{ previewText(session) }}</span>
            <span class="assistant-history__item-time">{{ formatTime(session.updatedAt) }}</span>
          </button>
          <button
              type="button"
              class="assistant-history__delete"
              :title="t('ai.history.delete')"
              @click.stop="remove(session.id)"
          >
            <DwIcon name="x" size="sm" :stroke-width="1.5"/>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.assistant-history {
  position: relative;
}

.assistant-history__panel {
  position: absolute;
  top: calc(100% + 8px);
  right: -6px;
  z-index: 30;
  display: flex;
  flex-direction: column;
  width: 272px;
  max-height: min(340px, 50vh);
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--dw-border) 70%, transparent);
  border-radius: 12px;
  background:
      linear-gradient(
          180deg,
          color-mix(in srgb, var(--dw-bg) 28%, transparent),
          transparent 40%
      ),
      var(--dw-bg-panel);
  box-shadow:
      0 0 0 1px color-mix(in srgb, var(--dw-text) 3%, transparent),
      0 18px 40px color-mix(in srgb, #000 45%, transparent);
}

.assistant-history__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 12px 9px;
}

.assistant-history__head strong {
  font-size: var(--dw-text-sm);
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--dw-text);
}

.assistant-history__head span {
  flex-shrink: 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-2xs);
}

.assistant-history__empty {
  padding: 8px 16px 18px;
  min-height: 0;
}

.assistant-history__empty-cta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  padding: 6px 12px;
  border: 1px solid color-mix(in srgb, var(--dw-primary) 30%, var(--dw-border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--dw-primary) 12%, transparent);
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  cursor: pointer;
}

.assistant-history__empty-cta:hover {
  background: color-mix(in srgb, var(--dw-primary) 18%, transparent);
}

.assistant-history__list {
  margin: 0;
  padding: 6px;
  overflow: auto;
  list-style: none;
  border-top: 1px solid color-mix(in srgb, var(--dw-border) 55%, transparent);
}

.assistant-history__list li {
  position: relative;
  display: flex;
  align-items: stretch;
}

.assistant-history__list li + li {
  margin-top: 1px;
}

.assistant-history__item {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 9px 28px 9px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.assistant-history__item:hover {
  background: color-mix(in srgb, var(--dw-bg) 72%, transparent);
}

.assistant-history__item.is-active {
  background: color-mix(in srgb, var(--dw-primary) 13%, transparent);
}

.assistant-history__item-title {
  overflow: hidden;
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.assistant-history__item-preview {
  display: -webkit-box;
  overflow: hidden;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.assistant-history__item-time {
  margin-top: 1px;
  color: var(--dw-text-dim);
  font-size: var(--dw-text-2xs);
  font-variant-numeric: tabular-nums;
}

.assistant-history__delete {
  position: absolute;
  top: 8px;
  right: 6px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dw-text-muted);
  cursor: pointer;
  opacity: 0;
}

.assistant-history__list li:hover .assistant-history__delete {
  opacity: 1;
}

.assistant-history__delete:hover {
  background: color-mix(in srgb, var(--dw-danger, #ef4444) 14%, transparent);
  color: var(--dw-danger, #ef4444);
}
</style>
