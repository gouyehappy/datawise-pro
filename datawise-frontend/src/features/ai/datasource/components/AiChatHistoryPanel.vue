<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {SearchInput, SidePanel, DwButton} from '@/core/components'
import {DwIcon} from '@/core/icons'
import type {AiChatSession} from '@/features/ai/stores/ai-chat'
import {useTeamStore} from '@/features/team/stores/team-store'

const props = withDefaults(
    defineProps<{
      sessions: AiChatSession[]
      activeSessionId: string | null
      border?: 'left' | 'right' | 'none'
      embedded?: boolean
    }>(),
    {border: 'right', embedded: false},
)

const emit = defineEmits<{
  select: [id: string]
  create: []
  delete: [id: string]
  share: [id: string]
}>()

const {t} = useI18n()
const teamStore = useTeamStore()
const search = ref('')

const canShareToTeam = computed(() => !!teamStore.activeTeamId)

const filteredSessions = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return props.sessions
  return props.sessions.filter((session) => session.title.toLowerCase().includes(query))
})

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
  if (lastUser) return lastUser.content
  return t('ai.history.emptyPreview')
}
</script>

<template>
  <SidePanel :title="embedded ? '' : t('ai.history.title')" :border="props.border">
    <template v-if="!embedded" #head>
      <div>
        <h2>{{ t('ai.history.title') }}</h2>
      </div>
    </template>

    <template #toolbar>
      <DwButton variant="secondary" block size="sm" class="new-chat-btn" @click="emit('create')">
        <DwIcon name="plus" size="sm" :stroke-width="1.5"/>
        {{ t('ai.history.newChat') }}
      </DwButton>
      <SearchInput v-model="search" class="history-search" :placeholder="t('ai.history.search')"/>
    </template>

    <div v-if="!filteredSessions.length" class="dw-empty">
      {{ search ? t('ai.history.noMatch') : t('ai.history.empty') }}
    </div>

    <ul v-else class="dw-list">
      <li v-for="session in filteredSessions" :key="session.id" class="dw-list-item-wrap">
        <button
            class="dw-list-item"
            :class="{ 'is-active': session.id === activeSessionId }"
            type="button"
            @click="emit('select', session.id)"
        >
          <span class="dw-list-item__title">{{ session.title }}</span>
          <span class="dw-list-item__meta">{{ previewText(session) }}</span>
          <span class="dw-list-item__time">{{ formatTime(session.updatedAt) }}</span>
        </button>
        <button
            class="dw-list-item__delete"
            type="button"
            :title="t('ai.history.delete')"
            @click.stop="emit('delete', session.id)"
        >
          ×
        </button>
        <button
            v-if="canShareToTeam"
            class="dw-list-item__share"
            type="button"
            :title="t('ai.history.share')"
            @click.stop="emit('share', session.id)"
        >
          ↗
        </button>
      </li>
    </ul>
  </SidePanel>
</template>

<style scoped>
.new-chat-btn {
  gap: var(--dw-gap-sm);
  margin-bottom: var(--dw-space-5);
  border-radius: var(--dw-control-radius);
}

.new-chat-btn:hover {
  border-color: var(--dw-primary-border);
  background: var(--dw-primary-soft);
  color: var(--dw-primary);
}

.history-search {
  display: block;
}

:deep(.dw-list-item-wrap) {
  position: relative;
}

:deep(.dw-list-item__share) {
  position: absolute;
  top: 8px;
  right: 28px;
  width: var(--dw-control-h-xs);
  height: var(--dw-control-h-xs);
  border: none;
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: var(--dw-text-muted);
  cursor: pointer;
  opacity: 0;
  transition: var(--dw-transition-colors), opacity var(--dw-duration-fast) var(--dw-ease);
}

:deep(.dw-list-item-wrap:hover .dw-list-item__share),
:deep(.dw-list-item__share:focus-visible) {
  opacity: 1;
}

:deep(.dw-list-item__share:hover) {
  background: var(--dw-primary-soft);
  color: var(--dw-primary);
}
</style>
