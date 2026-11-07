<script setup lang="ts">
import {onMounted, watch} from 'vue'
import {DwInlineAlert} from '@/core/components'
import {QueryResultPane} from '@/features/workspace/components'
import type {WorkspaceTab} from '@/core/types'
import {useViewModelDataView} from '@/features/workspace/composables/useViewModelDataView'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {isProductionEnvironment} from '@/features/connection/services/connection-environment.service'

const props = defineProps<{ tab: WorkspaceTab }>()
const explorer = useExplorerStore()

const {
  columns,
  rows,
  loading,
  cursorLoading,
  hasMore,
  cursorTrimmedRows,
  productionPerfActive,
  errorMessage,
  refresh,
  loadMore,
  executeQuery,
} = useViewModelDataView(props.tab)

const exportSuggestMask = () => {
  const connId = props.tab.connectionId
  if (!connId) return false
  const node = explorer.findNode(connId)
  return isProductionEnvironment(node?.env, node?.envCustom)
}

onMounted(() => {
  void executeQuery(false)
})

watch(
    () => [props.tab.viewModelSql, props.tab.connectionId, props.tab.database] as const,
    () => {
      void executeQuery(false)
    },
)
</script>

<template>
  <div class="view-model-data dw-workbench-page" data-wb-recipe="wb-extension">
    <DwInlineAlert :message="errorMessage"/>
    <QueryResultPane
        :columns="columns"
        :rows="rows"
        :total="rows.length"
        :result-label="tab.viewModelName ?? tab.title"
        :export-name="`${tab.viewModelName ?? 'view-model'}.csv`"
        :export-suggest-mask="exportSuggestMask()"
        :result-has-more="hasMore"
        :loading="loading"
        :cursor-loading="cursorLoading"
        :cursor-trimmed-rows="cursorTrimmedRows"
        :production-perf-active="productionPerfActive"
        @refresh="refresh"
        @load-more="loadMore"
    />
  </div>
</template>

<style scoped>
.view-model-data {
  min-height: 0;
  min-width: 0;
}
</style>
