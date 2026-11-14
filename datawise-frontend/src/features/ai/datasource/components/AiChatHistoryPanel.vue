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

const {t, locale} = useI18n()
const teamStore = useTeamStore()
const search = ref('')

const canShareToTeam = computed(() => !!teamStore.activeTeamId)

const filteredSessions = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return props.sessions
  return props.sessions.filter((session) => session.title.toLowerCase().includes(query))
})

const relativeTime = computed(() =>
    new Intl.RelativeTimeFormat(locale.value, {numeric: 'auto', style: 'short'}),
)
const shortDate = computed(() =>
    new Intl.DateTimeFormat(locale.value, {month: 'numeric', day: 'numeric'}),
)

/** Recent sessions read as relative time; older ones fall back to a localized short date. */
function formatTime(timestamp: number) {
  const elapsed = Date.now() - timestamp
  if (elapsed < 60_000) return t('ai.history.justNow')
  const minutes = Math.round(elapsed / 60_000)
  if (minutes < 60) return relativeTime.value.format(-minutes, 'minute')
  const hours = Math.round(elapsed / 3_600_000)
  if (hours < 24) return relativeTime.value.format(-hours, 'hour')
  const days = Math.round(elapsed / 86_400_000)
  if (days <= 7) return relativeTime.value.format(-days, 'day')
  return shortDate.value.format(new Date(timestamp))
}

function previewText(session: AiChatSession) {
  const lastUser = [...session.messages].reverse().find((msg) => msg.role === 'user')
  if (lastUser) return lastUser.content
  return t('ai.history.emptyPreview')
}
</script>

<template>
  <SidePanel
      class="agent-history"
      :title="embedded ? '' : t('ai.history.title')"
      :border="props.border"
  >
    <template v-if="!embedded" #head>
      <div class="agent-history__head">
        <DwIcon name="history" size="sm" :stroke-width="1.7"/>
        <h2>{{ t('ai.history.title') }}</h2>
      </div>
    </template>

    <template #toolbar>
      <div class="agent-history__tools">
        <DwButton variant="primary" block size="sm" class="agent-history__new" @click="emit('create')">
          <DwIcon name="plus" size="sm" :stroke-width="2"/>
          {{ t('ai.history.newChat') }}
        </DwButton>
        <SearchInput
            v-model="search"
            size="sm"
            class="agent-history__search"
            :placeholder="t('ai.history.search')"
        />
      </div>
    </template>

    <div v-if="!filteredSessions.length" class="agent-history__empty">
      <span class="agent-history__empty-icon" aria-hidden="true">
        <DwIcon name="bot" size="md" :stroke-width="1.4"/>
      </span>
      <p class="agent-history__empty-title">
        {{ search ? t('ai.history.noMatch') : t('ai.history.empty') }}
      </p>
      <p v-if="!search" class="agent-history__empty-hint">{{ t('ai.history.emptyPreview') }}</p>
    </div>

    <ul v-else class="agent-history__list">
      <li v-for="session in filteredSessions" :key="session.id" class="agent-history__item">
        <button
            class="agent-history__card"
            :class="{ 'is-active': session.id === activeSessionId }"
            type="button"
            @click="emit('select', session.id)"
        >
          <span class="agent-history__card-icon" aria-hidden="true">
            <DwIcon name="bot" size="xs" :stroke-width="1.6"/>
          </span>
          <span class="agent-history__card-main">
            <span class="agent-history__card-row">
              <span class="agent-history__title">{{ session.title }}</span>
              <span class="agent-history__time">{{ formatTime(session.updatedAt) }}</span>
            </span>
            <span class="agent-history__preview">{{ previewText(session) }}</span>
          </span>
        </button>

        <div class="agent-history__actions">
          <button
              v-if="canShareToTeam"
              class="agent-history__action"
              type="button"
              :title="t('ai.history.share')"
              :aria-label="t('ai.history.share')"
              @click.stop="emit('share', session.id)"
          >
            <DwIcon name="open-external" size="xs" :stroke-width="1.6"/>
          </button>
          <button
              class="agent-history__action agent-history__action--danger"
              type="button"
              :title="t('ai.history.delete')"
              :aria-label="t('ai.history.delete')"
              @click.stop="emit('delete', session.id)"
          >
            <DwIcon name="delete" size="xs" :stroke-width="1.6"/>
          </button>
        </div>
      </li>
    </ul>
  </SidePanel>
</template>

<style scoped>
.agent-history__head {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  color: var(--dw-primary);
}

.agent-history__head h2 {
  margin: 0;
  color: var(--dw-text);
  font-size: var(--dw-text-md);
  font-weight: 600;
}

.agent-history__tools {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-3);
}

.agent-history__new {
  justify-content: center;
  gap: var(--dw-gap-sm);
  border-radius: var(--dw-control-radius);
}

.agent-history__search {
  display: block;
}

.agent-history__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--dw-space-2);
  padding: var(--dw-space-9) var(--dw-space-5);
  text-align: center;
}

.agent-history__empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin-bottom: var(--dw-space-2);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg);
  color: var(--dw-text-secondary);
}

.agent-history__empty-title {
  margin: 0;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
  font-weight: 600;
}

.agent-history__empty-hint {
  margin: 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.agent-history__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: var(--dw-space-3);
  list-style: none;
}

.agent-history__item {
  position: relative;
}

.agent-history__card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--dw-gap-sm);
  width: 100%;
  padding: var(--dw-space-3) 30px var(--dw-space-3) var(--dw-space-3);
  border: 1px solid transparent;
  border-radius: var(--dw-control-radius);
  background: transparent;
  color: var(--dw-text);
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.agent-history__card:hover {
  background: var(--dw-bg-hover);
}

.agent-history__card.is-active {
  background: color-mix(in srgb, var(--dw-primary) 12%, transparent);
  border-color: color-mix(in srgb, var(--dw-primary) 28%, transparent);
}

.agent-history__card.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 2px;
  border-radius: 0 2px 2px 0;
  background: var(--dw-primary);
}

.agent-history__card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  margin-top: 1px;
  border-radius: var(--dw-control-radius-sm);
  background: color-mix(in srgb, var(--dw-text-muted) 12%, transparent);
  color: var(--dw-text-secondary);
}

.agent-history__card.is-active .agent-history__card-icon {
  background: color-mix(in srgb, var(--dw-primary) 18%, transparent);
  color: var(--dw-primary);
}

.agent-history__card-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.agent-history__card-row {
  display: flex;
  align-items: baseline;
  gap: var(--dw-gap-sm);
  min-width: 0;
}

.agent-history__title {
  flex: 1;
  min-width: 0;
  font-size: var(--dw-text-sm);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-history__card.is-active .agent-history__title {
  color: var(--dw-primary);
}

.agent-history__time {
  flex-shrink: 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  white-space: nowrap;
  transition: opacity 0.12s ease;
}

.agent-history__preview {
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-snug);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-history__actions {
  position: absolute;
  top: var(--dw-space-3);
  right: 6px;
  display: flex;
  gap: 2px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

.agent-history__item:hover .agent-history__actions,
.agent-history__actions:focus-within {
  opacity: 1;
  pointer-events: auto;
}

.agent-history__item:hover .agent-history__time {
  opacity: 0;
}

.agent-history__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: var(--dw-text-muted);
  cursor: pointer;
}

.agent-history__action:hover {
  background: var(--dw-bg);
  color: var(--dw-primary);
}

.agent-history__action--danger:hover {
  background: color-mix(in srgb, var(--dw-danger) 14%, transparent);
  color: var(--dw-danger);
}
</style>
