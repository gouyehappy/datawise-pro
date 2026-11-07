import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {auditPluginCatalogConsistency} from '@/features/plugin/services/plugin-catalog-audit.service'
import {
    auditPluginCatalogMetadata,
    buildPluginCatalogRegistryDiffRows,
    downloadPluginCatalogRegistryDiffCsv,
} from '@/features/plugin/services/plugin-catalog-metadata.service'
import {buildPluginMatrixRows, downloadPluginMatrixCsv} from '@/features/plugin/services/plugin-matrix.service'
import {
    copyConnectorCapabilityDocPath,
    listExplorerPluginCrossRefs,
} from '@/features/plugin/services/plugin-connector-crossref.service'
import {
    clearPluginUsageStats,
    listPluginUsageLeaderboard,
} from '@/features/plugin/services/plugin-usage.service'
import {listRegisteredPluginHooks} from '@/features/plugin/services/plugin-hook.service'
import {
    copyPluginHookTemplate,
    type PluginHookTemplateId,
} from '@/features/plugin/services/plugin-hook-template.service'
import type {PluginHookName} from '@/features/plugin/types/plugin-hook.types'
import {isKnownPluginId, type PluginId} from '@/features/plugin/services/plugin-registry.service'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {useDatasourceCatalogStore} from '@/features/datasource/stores/datasource-catalog'
import {useAppToast} from '@/features/layout/composables/useAppToast'
const HOOK_TEMPLATE_IDS: PluginHookTemplateId[] = ['full', 'beforeExecute', 'afterResult', 'renderGrid']

/** 插件开发者工具页：矩阵 / 统计 / JAR / 审计 / Hook 数据与操作 */
export function usePluginDeveloperTools() {
    const {t, te} = useI18n()
    const pluginStore = usePluginStore()
    const catalogStore = useDatasourceCatalogStore()
    const toast = useAppToast()
    const usageRevision = ref(0)
    const registeredHooks = ref(listRegisteredPluginHooks())

    const matrixRows = computed(() => buildPluginMatrixRows(pluginStore.items))
    const explorerCrossRefs = computed(() => listExplorerPluginCrossRefs())

    const usageLeaderboard = computed(() => {
        void usageRevision.value
        return listPluginUsageLeaderboard(10)
    })

    const catalogMetadataIssues = computed(() =>
        auditPluginCatalogMetadata(pluginStore.catalogItems),
    )

    const catalogRegistryDiffRows = computed(() =>
        buildPluginCatalogRegistryDiffRows(pluginStore.catalogItems),
    )

    const catalogAuditIssues = computed(() =>
        auditPluginCatalogConsistency(pluginStore.catalogItems, registeredHooks.value),
    )

    const catalogAllIssueCount = computed(
        () => catalogAuditIssues.value.length + catalogMetadataIssues.value.length,
    )

    const connectorJarCount = computed(
        () => catalogStore.loadedPluginJars.length + catalogStore.pluginLoadFailures.length,
    )

    const hookRows = computed(() => {
        const rows: { hook: PluginHookName; pluginId: string; known: boolean }[] = []
        for (const hook of ['beforeExecute', 'afterResult', 'renderGrid'] as const) {
            for (const pluginId of registeredHooks.value[hook]) {
                rows.push({hook, pluginId, known: isKnownPluginId(pluginId)})
            }
        }
        return rows.sort((a, b) => a.pluginId.localeCompare(b.pluginId) || a.hook.localeCompare(b.hook))
    })

    function requiredPluginLabel(id: PluginId): string {
        const key = `plugin.items.${id}.name`
        return te(key) ? t(key) : id
    }

    function catalogAuditKindLabel(kind: string): string {
        return t(`plugin.catalogAudit.kind.${kind}`)
    }

    function catalogMetadataKindLabel(kind: string): string {
        return t(`plugin.catalogAudit.metadataKind.${kind}`)
    }

    function hookLabel(hook: PluginHookName): string {
        return t(`plugin.hooks.hookNames.${hook}`)
    }

    function hookTemplateLabel(id: PluginHookTemplateId): string {
        if (id === 'full') return t('plugin.hooks.copyTemplate')
        return t('plugin.hooks.copyTemplateHook', {hook: hookLabel(id)})
    }

    function refreshRegisteredHooks() {
        registeredHooks.value = listRegisteredPluginHooks()
    }

    async function copyCrossRefDoc(path: string) {
        const ok = await copyConnectorCapabilityDocPath(path)
        if (ok) toast.success(t('plugin.crossref.copySuccess'))
        else toast.error(t('plugin.crossref.copyFailed'))
    }

    async function copyHookTemplate(id: PluginHookTemplateId = 'full') {
        const ok = await copyPluginHookTemplate(id)
        if (ok) toast.success(t('plugin.hooks.copySuccess'))
        else toast.error(t('plugin.hooks.copyFailed'))
    }

    function exportPluginMatrixCsv() {
        downloadPluginMatrixCsv(matrixRows.value)
        toast.success(t('plugin.matrix.exportSuccess'))
    }

    function exportCatalogRegistryDiffCsv() {
        downloadPluginCatalogRegistryDiffCsv(catalogRegistryDiffRows.value)
        toast.success(t('plugin.catalogAudit.exportDiffSuccess'))
    }

    function clearUsageStats() {
        clearPluginUsageStats()
        usageRevision.value += 1
        toast.success(t('plugin.usage.clearSuccess'))
    }

    onMounted(() => {
        void catalogStore.ensureLoaded().catch(() => undefined)
        refreshRegisteredHooks()
    })

    return {
        matrixRows,
        explorerCrossRefs,
        usageLeaderboard,
        hookRows,
        hookTemplateIds: HOOK_TEMPLATE_IDS,
        catalogLoading: computed(() => catalogStore.loading),
        catalogError: computed(() => catalogStore.error),
        loadedPluginJars: computed(() => catalogStore.loadedPluginJars),
        pluginLoadFailures: computed(() => catalogStore.pluginLoadFailures),
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
    }
}
