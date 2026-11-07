<script setup lang="ts">
import {onMounted} from 'vue'
import {useI18n} from 'vue-i18n'
import PluginDeveloperToolsSection from '@/features/plugin/components/PluginDeveloperToolsSection.vue'
import {usePluginDeveloperTools} from '@/features/plugin/composables/usePluginDeveloperTools'
import {usePluginPresetSummary} from '@/features/plugin/composables/usePluginPresetSummary'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import '@/features/plugin/styles/plugin-dev-tools.css'

const {t, te} = useI18n()
const pluginStore = usePluginStore()
const toast = useAppToast()
const initialTab = pluginStore.consumeDevToolsTab() ?? undefined
const {referencePresetId, referencePresetConflictCount} = usePluginPresetSummary()

const {
    matrixRows,
    explorerCrossRefs,
    usageLeaderboard,
    hookRows,
    hookTemplateIds,
    catalogLoading,
    catalogError,
    loadedPluginJars,
    pluginLoadFailures,
    catalogAuditIssues,
    catalogMetadataIssues,
    catalogAllIssueCount,
    connectorJarCount,
    requiredPluginLabel,
    hookLabel,
    hookTemplateLabel,
    catalogAuditKindLabel,
    catalogMetadataKindLabel,
    refreshRegisteredHooks,
    copyCrossRefDoc,
    copyHookTemplate,
    exportPluginMatrixCsv,
    exportCatalogRegistryDiffCsv,
    clearUsageStats,
} = usePluginDeveloperTools()

function referencePresetLabel(): string {
    const key = `plugin.presets.${referencePresetId.value}.label`
    return te(key) ? t(key) : referencePresetId.value
}

function alignReferencePreset() {
    pluginStore.alignToReferencePreset()
}

function openPresetDiff() {
    pluginStore.openPluginPresetDiff()
}

onMounted(() => {
    if (!pluginStore.isDevToolsVisible) {
        pluginStore.openPackStore()
        toast.show(t('plugin.devTools.hiddenHint'))
    }
})
</script>

<template>
  <div class="module-page module-page--scroll plugin-dev-page">
    <div class="mp-page-wrap plugin-dev-page__wrap">
      <PluginDeveloperToolsSection
          class="plugin-dev--standalone"
          :initial-tab="initialTab"
          :matrix-rows="matrixRows"
          :explorer-cross-refs="explorerCrossRefs"
          :usage-leaderboard="usageLeaderboard"
          :hook-rows="hookRows"
          :hook-template-ids="hookTemplateIds"
          :catalog-loading="catalogLoading"
          :catalog-error="catalogError"
          :loaded-plugin-jars="loadedPluginJars"
          :plugin-load-failures="pluginLoadFailures"
          :catalog-audit-issues="catalogAuditIssues"
          :catalog-metadata-issues="catalogMetadataIssues"
          :catalog-all-issue-count="catalogAllIssueCount"
          :connector-jar-count="connectorJarCount"
          :reference-preset-mismatch-count="referencePresetConflictCount"
          :reference-preset-label="referencePresetLabel()"
          :required-plugin-label="requiredPluginLabel"
          :hook-label="hookLabel"
          :hook-template-label="hookTemplateLabel"
          :catalog-audit-kind-label="catalogAuditKindLabel"
          :catalog-metadata-kind-label="catalogMetadataKindLabel"
          @export-matrix-csv="exportPluginMatrixCsv"
          @export-catalog-diff-csv="exportCatalogRegistryDiffCsv"
          @clear-usage="clearUsageStats"
          @copy-cross-ref-doc="copyCrossRefDoc"
          @copy-hook-template="copyHookTemplate"
          @refresh-hooks="refreshRegisteredHooks"
          @align-reference-preset="alignReferencePreset"
          @open-preset-diff="openPresetDiff"
      />
    </div>
  </div>
</template>

<style scoped>
.plugin-dev-page__wrap {
    min-width: 0;
}
</style>
