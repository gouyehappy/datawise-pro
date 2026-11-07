<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwPanelState} from '@/core/components'
import DataSourceTree from '@/features/explorer/components/DataSourceTree.vue'
import {useAiTaggedScopeTree} from '@/features/ai/datasource/composables/useAiTaggedScopeTree'
import {useAiTaggedScopeContext} from '@/features/ai/datasource/composables/ai-tagged-scope.context'

const selectedIds = defineModel<string[]>('selectedIds', {required: true})
const search = defineModel<string>('search', {required: true})

const {t} = useI18n()
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
</style>
