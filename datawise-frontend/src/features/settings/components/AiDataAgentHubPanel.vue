<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useLayoutStore} from '@/features/layout/stores/layout'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsSegmentTabs from '@/features/settings/components/SettingsSegmentTabs.vue'
import DataAgentSettingsPanel from '@/features/settings/components/DataAgentSettingsPanel.vue'
import AiKnowledgeSettingsPanel from '@/features/settings/components/AiKnowledgeSettingsPanel.vue'

type HubTab = 'pipeline' | 'glossary' | 'rag'

const {t} = useI18n()
const layout = useLayoutStore()
const activeTab = ref<HubTab>('pipeline')

const tabs = computed(() => [
    {id: 'pipeline' as const, label: t('settings.dataAgent.tabs.pipeline')},
    {id: 'glossary' as const, label: t('settings.dataAgent.tabs.glossary')},
    {id: 'rag' as const, label: t('settings.dataAgent.tabs.rag')},
])

function syncTabFromSection(section: string) {
    if (section === 'knowledge') {
        activeTab.value = 'glossary'
    }
}

watch(() => layout.settingsSection, syncTabFromSection, {immediate: true})

function selectTab(tab: HubTab) {
    activeTab.value = tab
    if (layout.settingsSection === 'knowledge') {
        layout.setSettingsSection('dataAgent')
    }
}
</script>

<template>
  <SettingsPageShell
      :title="t('settings.dataAgent.hubTitle')"
      :subtitle="t('settings.dataAgent.hubSubtitle')"
  >
    <div class="settings-tab-strip">
      <SettingsSegmentTabs
          :model-value="activeTab"
          :tabs="tabs"
          stretch
          :aria-label="t('settings.dataAgent.hubTitle')"
          @update:model-value="selectTab($event as HubTab)"
      />
    </div>

    <div class="data-agent-hub__body">
      <DataAgentSettingsPanel v-if="activeTab === 'pipeline'" embedded/>
      <AiKnowledgeSettingsPanel v-else-if="activeTab === 'glossary'" view="glossary" embedded/>
      <AiKnowledgeSettingsPanel v-else view="rag" embedded/>
    </div>
  </SettingsPageShell>
</template>
