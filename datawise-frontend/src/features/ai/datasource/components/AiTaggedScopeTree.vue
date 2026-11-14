<script setup lang="ts">
import {computed, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwPanelState} from '@/core/components'
import DataSourceTree from '@/features/explorer/components/DataSourceTree.vue'
import AiScopeSuggestion from '@/features/ai/datasource/components/AiScopeSuggestion.vue'
import {useAiTaggedScopeTree} from '@/features/ai/datasource/composables/useAiTaggedScopeTree'
import {useAiTaggedScopeContext} from '@/features/ai/datasource/composables/ai-tagged-scope.context'
import {useAiScopeSuggestions} from '@/features/ai/datasource/composables/useAiScopeSuggestions'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const selectedIds = defineModel<string[]>('selectedIds', {required: true})
const search = defineModel<string>('search', {required: true})

const {t} = useI18n()
const toast = useAppToast()
const {groups, loading, error, unavailable, reload, filterGroups} = useAiTaggedScopeContext()

const visibleGroups = computed(() => filterGroups(search.value))

const {
    flatNodes,
    allVisibleSelected,
    toggleExpand,
    isCheckable,
    isChecked,
    toggleCheck,
    selectAllVisible,
    clearVisible,
} = useAiTaggedScopeTree(visibleGroups, search, selectedIds)

const {
    scope: suggestionScope,
    tables: suggestedTables,
    loading: suggestionLoading,
    applying: applyingSuggestion,
    error: suggestionError,
    ensureLoaded: ensureSuggestionLoaded,
    apply: applySuggestionTables,
} = useAiScopeSuggestions()

/** 只有「真的一张表都没有」时才给推荐；搜索无结果仍走原空态文案 */
const showSuggestion = computed(
    () =>
        !groups.value.length
        && !search.value.trim()
        && (suggestionLoading.value || !!suggestionScope.value),
)

watch(
    () => [groups.value.length, loading.value, search.value.trim()] as const,
    ([groupCount, isLoading, query]) => {
      if (groupCount || isLoading || query) return
      void ensureSuggestionLoaded()
    },
    {immediate: true},
)

async function applySuggestion(tableNames: string[]) {
    try {
      const targetIds = await applySuggestionTables(tableNames)
      if (!targetIds.length) return
      selectedIds.value = targetIds
    } catch (err) {
      toast.error(resolveCaughtApiErrorMessage(err, t, 'ai.databasePanel.recommend.applyFailed'))
    }
}

const emptyText = computed(() => {
    if (!groups.value.length) return t('ai.databasePanel.empty')
    if (search.value.trim()) return t('ai.databasePanel.noMatch')
    return t('ai.databasePanel.empty')
})

defineExpose({
    allVisibleSelected,
    selectAllVisible,
    clearVisible,
    reload,
})
</script>

<template>
  <div class="ai-tagged-scope-tree">
    <DwPanelState
        v-if="loading"
        status="loading"
        :message="t('ai.databasePanel.loading')"
        compact
    />
    <DwPanelState
        v-else-if="unavailable"
        status="empty"
        :message="t('auth.serviceUnavailable')"
        compact
    />
    <DwPanelState
        v-else-if="error"
        status="error"
        :message="error"
        compact
    />
    <template v-else>
      <div v-if="showSuggestion && suggestionScope" class="ai-tagged-scope-tree__suggest">
        <AiScopeSuggestion
            :scope="suggestionScope"
            :tables="suggestedTables"
            :loading="suggestionLoading"
            :applying="applyingSuggestion"
            :error="suggestionError"
            @apply="applySuggestion"
        />
      </div>
      <DataSourceTree
          v-else
          compact
          selectable
          :show-table-comment="false"
          :show-column-comment="false"
          :flat-nodes="flatNodes"
          :empty-text="emptyText"
          :is-checkable="isCheckable"
          :is-checked="isChecked"
          @toggle-expand="toggleExpand"
          @toggle-check="toggleCheck"
      />
    </template>
  </div>
</template>

<style scoped>
.ai-tagged-scope-tree {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.ai-tagged-scope-tree :deep(.datasource-tree) {
  flex: 1;
  min-height: 0;
  padding: var(--dw-space-1) 0 var(--dw-space-3);
}

.ai-tagged-scope-tree__suggest {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--dw-space-3) var(--dw-space-4) var(--dw-space-5);
}
</style>
