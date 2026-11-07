<script setup lang="ts">
import {computed, onBeforeMount, ref, shallowRef} from 'vue'
import {useI18n} from 'vue-i18n'
import {SqlEditorSettingsShell} from '@datawise/sql-editor'
import type {SqlEditorShortcutsController} from '@datawise/sql-editor/composables/useSqlEditorShortcutsController'
import {getAppSqlEditorShortcutsController} from '@/features/settings/services/sql-editor-shortcuts.controller'
import {ensureSqlEditorPlugin} from '@/features/workspace/services/ensure-sql-editor-plugin'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsSegmentTabs from '@/features/settings/components/SettingsSegmentTabs.vue'
import SettingsTipsCard from '@/features/settings/components/SettingsTipsCard.vue'
import DwPanelState from '@/core/components/DwPanelState.vue'

type SqlEditorTab = 'behavior' | 'keybindings' | 'quick'

const {t} = useI18n()
const ready = ref(false)
const controller = shallowRef<SqlEditorShortcutsController | null>(null)
const activeTab = ref<SqlEditorTab>('behavior')

onBeforeMount(async () => {
    await ensureSqlEditorPlugin()
    const next = getAppSqlEditorShortcutsController()
    next.reloadFromPersistence()
    controller.value = next
    ready.value = true
})

const tabs = computed(() => [
  {id: 'behavior' as const, label: t('settings.sqlEditorBehavior.tabs.behavior')},
  {id: 'keybindings' as const, label: t('settings.sqlEditorBehavior.tabs.keybindings')},
  {id: 'quick' as const, label: t('settings.sqlEditorBehavior.tabs.quick')},
])
</script>

<template>
  <SettingsPageShell
      :title="t('settings.sqlEditorBehavior.title')"
      :subtitle="t('settings.sqlEditorBehavior.subtitle')"
  >
    <template #tips>
      <SettingsTipsCard
          :title="t('settings.sqlEditor.tipsTitle')"
          :content="t('settings.sqlEditor.tipsContent')"
          icon="terminal"
      />
    </template>

    <div v-if="ready && controller" class="settings-groups sql-editor-behavior-settings">
      <div class="settings-tab-strip">
        <SettingsSegmentTabs
            v-model="activeTab"
            stretch
            :tabs="tabs"
            :aria-label="t('settings.sqlEditorBehavior.title')"
        />
      </div>

      <SqlEditorSettingsShell
          layout="page"
          :show-nav="false"
          :initial-tab="activeTab"
          :controller="controller!"
          :visible-tabs="['behavior', 'keybindings', 'quick']"
          @update:active-tab="activeTab = $event as SqlEditorTab"
      />
    </div>
    <DwPanelState
        v-else
        status="loading"
        fill
        :message="t('common.editorLoading')"
    />
  </SettingsPageShell>
</template>
