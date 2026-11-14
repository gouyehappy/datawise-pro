<!--
  AI 模块左侧面板：会话历史 / 数据范围两段各自独立折叠，默认同时展开。
  互斥切换会让「选完范围回看历史」变成两次点击，这里按高频路径改成双段并排。
-->
<script setup lang="ts">
import {ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import AiChatHistoryPanel from '@/features/ai/datasource/components/AiChatHistoryPanel.vue'
import AiDatabasePanel from '@/features/ai/datasource/components/AiDatabasePanel.vue'
import AiSideStackSection from '@/features/ai/datasource/components/AiSideStackSection.vue'
import type {AiChatSession} from '@/features/ai/stores/ai-chat'
import type {AiDatabaseTarget} from '@/features/ai/shared/utils/database-targets'
import type {AiSidePanel} from '@/shared/config/app-config.types'

const props = defineProps<{
  sessions: AiChatSession[]
  activeSessionId: string | null
  selectedTargets: AiDatabaseTarget[]
  /** 外部请求聚焦某一段时自增：只展开目标段，不动另一段 */
  focusRequest?: { panel: AiSidePanel; seq: number }
}>()

const selectedIds = defineModel<string[]>('selectedIds', {required: true})

const emit = defineEmits<{
  select: [id: string]
  create: []
  delete: [id: string]
  share: [id: string]
}>()

const {t} = useI18n()

const historyOpen = ref(true)
const scopeOpen = ref(true)

watch(
    () => props.focusRequest,
    (request) => {
      if (!request) return
      if (request.panel === 'scope') scopeOpen.value = true
      else historyOpen.value = true
    },
)
</script>

<template>
  <section class="explorer">
    <div class="ai-side-stack">
      <AiSideStackSection
          class="ai-side-stack__history"
          position="top"
          icon="history"
          :expanded="historyOpen"
          :title="t('ai.history.title')"
          @toggle="historyOpen = !historyOpen"
      >
        <template #badge>
          <span v-if="sessions.length" class="dw-badge">{{ sessions.length }}</span>
        </template>
        <AiChatHistoryPanel
            embedded
            border="none"
            :sessions="sessions"
            :active-session-id="activeSessionId"
            @select="emit('select', $event)"
            @create="emit('create')"
            @delete="emit('delete', $event)"
            @share="emit('share', $event)"
        />
      </AiSideStackSection>

      <AiSideStackSection
          class="ai-side-stack__scope"
          position="bottom"
          icon="database"
          :expanded="scopeOpen"
          :title="t('ai.databasePanel.title')"
          :subtitle="t('ai.databasePanel.subtitle')"
          @toggle="scopeOpen = !scopeOpen"
      >
        <template #badge>
          <span v-if="selectedIds.length" class="dw-badge">{{ selectedIds.length }}</span>
        </template>
        <AiDatabasePanel
            v-model:selected-ids="selectedIds"
            embedded
            border="none"
            :selected-targets="selectedTargets"
        />
      </AiSideStackSection>
    </div>
  </section>
</template>

<style scoped>
.explorer {
  container-type: inline-size;
  container-name: ai-explorer;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  min-height: 0;
  height: 100%;
  border: 1px solid var(--dw-panel-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-panel);
  box-shadow: var(--dw-panel-shadow);
  overflow: hidden;
}

.ai-side-stack {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: var(--dw-space-1);
  padding: var(--dw-space-1);
}

.ai-side-stack__history,
.ai-side-stack__scope {
  min-height: 0;
  border-radius: var(--dw-control-radius-sm);
  overflow: hidden;
}
</style>
