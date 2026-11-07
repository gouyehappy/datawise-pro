<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {StatusPill} from '@/core/components'
import {useSqlEditorShortcutsStore} from '@/features/settings/stores/sql-editor-shortcuts-store'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import type {SqlSnippetLayerId} from '@/features/plugin/services/plugin-registry.service'

const {t} = useI18n()
const store = useSqlEditorShortcutsStore()
const pluginStore = usePluginStore()

const snippetLayers: { id: SqlSnippetLayerId; pluginId: string }[] = [
  {id: 'bundled', pluginId: 'p-sql-snippets'},
  {id: 'team', pluginId: 'p-sql-snippets-team'},
  {id: 'personal', pluginId: 'p-sql-snippets-personal'},
]

function layerPluginName(pluginId: string): string {
  return t(`plugin.items.${pluginId}.name`)
}

function isLayerEnabled(layer: SqlSnippetLayerId): boolean {
  return pluginStore.isSnippetLayerEnabled(layer)
}
</script>

<template>
  <section class="setting-block sql-snippets-sources">
    <h3 class="setting-block__title">{{ t('settings.sqlSnippets.sourcesTitle') }}</h3>
    <p class="setting-block__hint">{{ t('settings.sqlSnippets.sourcesHint') }}</p>

    <div class="sql-snippets-sources__layers">
      <div
          v-for="layer in snippetLayers"
          :key="layer.id"
          class="sql-snippets-sources__layer"
      >
        <span class="sql-snippets-sources__layer-name">{{ layerPluginName(layer.pluginId) }}</span>
        <StatusPill :variant="isLayerEnabled(layer.id) ? 'success' : 'neutral'">
          {{ isLayerEnabled(layer.id) ? t('plugin.enabled') : t('plugin.disabled') }}
        </StatusPill>
      </div>
    </div>

    <div class="sql-snippets-sources__meta">
      <div class="sql-snippets-sources__counts">
        <span class="count-badge">
          {{ t('settings.sqlEditor.pluginCount', {count: store.pluginSnippetCount}) }}
        </span>
        <span class="count-badge">
          {{ t('settings.sqlEditor.sharedCount', {count: store.sharedSnippetCount}) }}
        </span>
        <span class="count-badge">
          {{ t('settings.sqlSnippets.personalCount', {count: store.personalSnippetCount}) }}
        </span>
      </div>
    </div>
  </section>
</template>
