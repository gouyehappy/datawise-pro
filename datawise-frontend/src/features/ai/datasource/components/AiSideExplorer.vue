<!--
  AI 模块左侧面板：会话历史 / 目标数据库互斥切换，始终有一块展开
-->
<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import AiChatHistoryPanel from '@/features/ai/datasource/components/AiChatHistoryPanel.vue'
import AiDatabasePanel from '@/features/ai/datasource/components/AiDatabasePanel.vue'
import AiSideStackSection from '@/features/ai/datasource/components/AiSideStackSection.vue'
import type {AiChatSession} from '@/features/ai/stores/ai-chat'
import type {AiDatabaseTarget} from '@/features/ai/shared/utils/database-targets'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import type {AiSidePanel} from '@/shared/config/app-config.types'

defineProps<{
  sessions: AiChatSession[]
  activeSessionId: string | null
  selectedTargets: AiDatabaseTarget[]
}>()

const selectedIds = defineModel<string[]>('selectedIds', {required: true})

const emit = defineEmits<{
  select: [id: string]
  create: []
  delete: [id: string]
  share: [id: string]
}>()

const {t} = useI18n()
const appConfig = useAppConfigStore()

const activePanel = computed({
  get: () => appConfig.aiPreferences.sideActivePanel,
  set: (panel: AiSidePanel) => appConfig.setAiSideActivePanel(panel),
})

const historyActive = computed(() => activePanel.value === 'history')
const scopeActive = computed(() => activePanel.value === 'scope')

function activate(panel: AiSidePanel) {
  activePanel.value = panel
}
</script>

<template>
  <section class="explorer">
    <div class="ai-side-stack">
      <AiSideStackSection
          class="ai-side-stack__history"
          position="top"
          icon="history"
          :active="historyActive"
          :title="t('ai.history.title')"
          @activate="activate('history')"
      >
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
          :active="scopeActive"
          :title="t('ai.databasePanel.title')"
          :subtitle="t('ai.databasePanel.subtitle')"
          @activate="activate('scope')"
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
