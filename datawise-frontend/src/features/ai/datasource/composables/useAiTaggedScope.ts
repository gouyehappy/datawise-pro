import {computed, onMounted, onUnmounted, ref, watch} from 'vue'
import {storeToRefs} from 'pinia'
import {
    buildAiTaggedScopeGroups,
    buildAiTargetFromTaggedTable,
    buildAiTargetsFromTaggedCatalog,
    matchesTaggedScopeSearch,
} from '@/features/ai/tag/services/ai-tagged-scope.service'
import {AI_TABLE_TAGS_CHANGED_EVENT} from '@/features/ai/tag/services/ai-table-tag.events'
import {fetchAiTableTagCatalog} from '@/features/ai/tag/services/ai-table-tag.service'
import type {AiTableTagCatalogItem, AiTaggedScopeGroup} from '@/features/ai/tag/types/ai-table-tag.types'
import type {AiDatabaseTarget} from '@/features/ai/shared/utils/database-targets'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {isUnauthorizedApiError} from '@/features/auth/services/auth-session.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {t} from '@/i18n'

export function useAiTaggedScope() {
    const explorer = useExplorerStore()
    const appConfig = useAppConfigStore()
    const {tree} = storeToRefs(explorer)
    const catalog = ref<AiTableTagCatalogItem[]>([])
    const loading = ref(false)
    const error = ref<string | null>(null)
    const unavailable = ref(false)

    async function reload() {
        loading.value = true
        error.value = null
        unavailable.value = false
        try {
            catalog.value = await fetchAiTableTagCatalog()
        } catch (err) {
            catalog.value = []
            if (isUnauthorizedApiError(err)) {
                unavailable.value = true
            } else {
                error.value = resolveCaughtApiErrorMessage(err, t, 'ai.databasePanel.schemaPreviewFailed')
            }
        } finally {
            loading.value = false
        }
    }

    onMounted(() => {
        void reload()
        window.addEventListener(AI_TABLE_TAGS_CHANGED_EVENT, reload)
    })

    onUnmounted(() => {
        window.removeEventListener(AI_TABLE_TAGS_CHANGED_EVENT, reload)
    })

    watch(
        () => appConfig.aiPreferences.sideActivePanel,
        (panel) => {
            if (panel === 'scope') void reload()
        },
    )

    // Connection delete/recreate: refresh catalog so orphan tags disappear from Agent scope.
    watch(
        () => {
            const ids: string[] = []
            const walk = (nodes: typeof tree.value) => {
                for (const node of nodes) {
                    if (node.type === 'connection') ids.push(node.id)
                    if (node.children?.length) walk(node.children)
                }
            }
            walk(tree.value)
            return ids.sort().join('|')
        },
        () => {
            void reload()
        },
    )

    const groups = computed<AiTaggedScopeGroup[]>(() =>
        buildAiTaggedScopeGroups(catalog.value, tree.value),
    )

    const allTargets = computed<AiDatabaseTarget[]>(() =>
        buildAiTargetsFromTaggedCatalog(catalog.value, tree.value),
    )

    function filterGroups(search: string) {
        const query = search.trim()
        if (!query) return groups.value
        return groups.value
            .map((group) => ({
                ...group,
                tables: group.tables.filter((tableName) => matchesTaggedScopeSearch(group, tableName, query)),
            }))
            .filter((group) => group.tables.length > 0)
    }

    function targetForTable(group: AiTaggedScopeGroup, tableName: string) {
        return buildAiTargetFromTaggedTable(group, tableName)
    }

    return {
        catalog,
        groups,
        allTargets,
        loading,
        error,
        unavailable,
        reload,
        filterGroups,
        targetForTable,
    }
}
