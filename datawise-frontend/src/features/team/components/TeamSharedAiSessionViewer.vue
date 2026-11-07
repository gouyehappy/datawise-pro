<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import AiMessageRow from '@/features/ai/chat/components/AiMessageRow.vue'
import {EmptyState} from '@/core/components'
import {extractSqlFromContent} from '@/features/ai/chat/services/ai-chat.service'
import {parseTeamAiSessionSharePayload} from '@/features/ai/chat/services/ai-session-share.service'
import type {TeamSharedAiSessionDetail} from '@/core/types'

const props = defineProps<{
  session: TeamSharedAiSessionDetail
}>()

const {t, tm} = useI18n()

const payload = computed(() => parseTeamAiSessionSharePayload(props.session.payloadJson))

const capabilities = computed(() => tm('ai.capabilities') as { title: string; desc: string }[])
</script>

<template>
  <div class="shared-ai-viewer">
    <header class="shared-ai-viewer__head">
      <h3>{{ session.title }}</h3>
      <p class="shared-ai-viewer__meta">
        {{ t('team.sharedAiSessions.sharedBy', {name: session.sharedByUserName}) }}
        ·
        {{ new Date(session.sharedAt).toLocaleString() }}
      </p>
    </header>

    <EmptyState v-if="!payload" embedded :title="t('team.sharedAiSessions.invalidPayload')"/>

    <div v-else class="shared-ai-viewer__messages">
      <AiMessageRow
          v-for="(message, index) in payload.messages"
          :key="`${message.role}-${index}`"
          :message="message"
          user-initial="?"
          :capabilities="capabilities"
          :extract-sql="extractSqlFromContent"
      />
    </div>
  </div>
</template>

<style scoped>
.shared-ai-viewer {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-6);
  min-height: 0;
}

.shared-ai-viewer__head h3 {
  margin: 0;
  font-size: var(--dw-text-xl);
  font-weight: 600;
}

.shared-ai-viewer__meta {
  margin: var(--dw-space-2) 0 0;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
}

.shared-ai-viewer__messages {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-6);
  overflow: auto;
  min-height: 0;
}
</style>
