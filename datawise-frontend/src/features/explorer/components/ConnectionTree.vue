<!--
  连接树：Explorer 单选模式（无复选框）
-->
<script setup lang="ts">
import {computed, nextTick, onMounted, onUnmounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {ContextMenuHost} from '@/core/context-menu'
import {PromptDialog, ConfirmDialog} from '@/core/components'
import {
  clearExplorerNodeScroll,
  registerExplorerNodeScroll,
} from '@/core/shortcuts/action-registry'
import DataSourceTree from '@/features/explorer/components/DataSourceTree.vue'
import RecentSqlPickerDialog from '@/features/explorer/components/RecentSqlPickerDialog.vue'
import SqlExportWizardDialog from '@/features/explorer/components/SqlExportWizardDialog.vue'
import RestoreWizardDialog from '@/features/explorer/components/RestoreWizardDialog.vue'
import {useConnectionTree} from '@/features/explorer/composables/useConnectionTree'
import {canMoveConnectionToGroup} from '@/features/explorer/services/explorer-move-connection.service'
import {useTeamExplorerHighlight} from '@/features/team/composables/useTeamExplorerHighlight'
import {
  EXPLORER_TREE_ROW_HEIGHT,
  resolveLastFlatNodeIndex,
} from '@/features/explorer/composables/useTreeVirtualWindow'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {canMutateConnectionCatalog} from '@/features/auth/services/feature-permission.service'
import {useDatasourceCatalogStore} from '@/features/datasource/stores/datasource-catalog'
import type {DbType} from '@/core/types'

const {t} = useI18n()
const workspace = useWorkspaceStore()
const auth = useAuthStore()
const catalog = useDatasourceCatalogStore()
const {highlightNodeIds} = useTeamExplorerHighlight()
const {
  explorer,
  flatNodes,
  menuVisible,
  menuPos,
  menuItems,
  showDeleteSqlDialog,
  deleteSqlMessage,
  showDeleteProjectFileDialog,
  deleteProjectFileMessage,
  showRecentSqlDialog,
  recentSqlContext,
  treeInline,
  onSelect,
  onOpen,
  onContextMenu,
  closeMenu,
  onMenuSelect,
  onTreeInlineInput,
  commitTreeInlineEdit,
  cancelTreeInlineEdit,
  beginCreateRootGroup,
  confirmDeleteSqlFile,
  confirmDeleteProjectFile,
  confirmTableAction,
  showTableActionDialog,
  pendingTableAction,
  confirmDeleteDatabase,
  showDeleteDatabaseDialog,
  pendingDeleteDatabase,
  showDeleteCatalogDialog,
  deleteCatalogTitle,
  deleteCatalogMessage,
  deleteCatalogConfirmLabel,
  confirmDeleteCatalogNode,
  showSqlExportWizard,
  sqlExportWizardContext,
  sqlExportWizardExporting,
  sqlExportWizardMaxRowsDefault,
  sqlExportWizardVariant,
  sqlExportWizardIsProduction,
  sqlExportWizardActionError,
  confirmSqlExportWizardExport,
  showRestoreWizard,
  restoreWizardContext,
  restoreWizardFileState,
  restoreWizardLoadingFile,
  restoreWizardExecuting,
  restoreWizardCanWrite,
  restoreWizardCanDdl,
  restoreWizardProductionApprovalTeams,
  restoreWizardApprovalError,
  restoreWizardApprovalSubmitting,
  restoreWizardActionError,
  pickRestoreWizardFile,
  confirmRestoreWizardExecute,
  submitRestoreWizardProductionApproval,
  showRenameViewModelDialog,
  renameViewModelDefaultName,
  showDeleteViewModelDialog,
  deleteViewModelMessage,
  showMigrateViewModelDialog,
  migrateViewModelTargetTable,
  confirmRenameViewModel,
  confirmDeleteViewModel,
  confirmMigrateViewModel,
  showRenameSshScriptRecordDialog,
  renameSshScriptRecordDefaultName,
  showDeleteSshScriptRecordDialog,
  deleteSshScriptRecordMessage,
  confirmRenameSshScriptRecord,
  confirmDeleteSshScriptRecord,
  connectionDragEnabled,
  performReorderCatalog,
} = useConnectionTree()

defineExpose({beginCreateRootGroup})

const dataSourceTreeRef = ref<InstanceType<typeof DataSourceTree> | null>(null)

const hasSearch = computed(() => Boolean(explorer.searchQuery.trim()))
const isTrulyEmpty = computed(() => explorer.connectionCount === 0 && !hasSearch.value)
const treeEmptyText = computed(() =>
    hasSearch.value || explorer.connectionCount > 0
        ? t('explorer.treeFilteredEmpty')
        : t('explorer.treeEmpty'),
)
const treeEmptyHint = computed(() => (isTrulyEmpty.value ? t('explorer.treeEmptyHint') : undefined))
const treeEmptyActionLabel = computed(() =>
    isTrulyEmpty.value && canMutateConnectionCatalog(auth.isGuest)
        ? t('explorer.treeEmptyAction')
        : undefined,
)

function onTreeEmptyAction() {
  const firstType = (catalog.primaryItems[0]?.id ?? catalog.items[0]?.id ?? 'mysql') as DbType
  workspace.openConnectionForm(firstType)
}

function scrollNodeIntoView(nodeId: string) {
  void nextTick().then(() => {
    requestAnimationFrame(() => {
      const container = document.querySelector('.explorer-body') as HTMLElement | null
      const el = container?.querySelector(`[data-tree-node-id="${CSS.escape(nodeId)}"]`)
      if (el) {
        el.scrollIntoView({block: 'nearest', behavior: 'smooth'})
        return
      }
      const index = resolveLastFlatNodeIndex(flatNodes.value, nodeId)
      if (index < 0) return
      dataSourceTreeRef.value?.scrollToFlatIndex(index, 'smooth')
      requestAnimationFrame(() => {
        const retry = container?.querySelector(`[data-tree-node-id="${CSS.escape(nodeId)}"]`)
        if (retry) {
          retry.scrollIntoView({block: 'nearest', behavior: 'smooth'})
          return
        }
        container?.scrollTo({
          top: Math.max(0, index * EXPLORER_TREE_ROW_HEIGHT - container.clientHeight / 3),
          behavior: 'smooth',
        })
      })
    })
  })
}

onMounted(() => {
  registerExplorerNodeScroll(scrollNodeIntoView)
})

onUnmounted(() => {
  clearExplorerNodeScroll()
})
</script>

<template>
  <DataSourceTree
      ref="dataSourceTreeRef"
      :flat-nodes="flatNodes"
      :empty-text="treeEmptyText"
      :empty-hint="treeEmptyHint"
      :empty-action-label="treeEmptyActionLabel"
      :selected-node-id="explorer.selectedNodeId"
      :flash-node-id="explorer.flashNodeId"
      :highlight-node-ids="highlightNodeIds"
      :loading-node-ids="explorer.loadingNodeIds"
      :pinned-node-ids="explorer.pinnedNodeIds"
      :connection-health="explorer.connectionDisplayHealthById"
      :show-column-comment="explorer.showColumnComment"
      :show-table-comment="explorer.showTableComment"
      :connection-drag-enabled="connectionDragEnabled"
      :explorer-tree="explorer.tree"
      :can-move-connection-to-group="(connectionId, groupId) => canMoveConnectionToGroup(explorer.tree, connectionId, groupId)"
      :inline-edit-node-id="treeInline?.nodeId ?? null"
      :inline-edit-value="treeInline?.value ?? ''"
      :inline-edit-as-file-name="treeInline?.kind === 'create-project-file' || treeInline?.kind === 'rename-project-file'"
      @select="onSelect"
      @open="onOpen"
      @contextmenu="onContextMenu"
      @toggle-expand="explorer.toggleExpand"
      @reorder-catalog="performReorderCatalog"
      @empty-action="onTreeEmptyAction"
      @draft-input="onTreeInlineInput"
      @draft-commit="commitTreeInlineEdit"
      @draft-cancel="cancelTreeInlineEdit"
  />

  <ContextMenuHost
      :visible="menuVisible"
      :items="menuItems"
      :x="menuPos.x"
      :y="menuPos.y"
      @select="onMenuSelect"
      @close="closeMenu"
  />

  <RecentSqlPickerDialog
      v-model:open="showRecentSqlDialog"
      :context="recentSqlContext"
  />

  <SqlExportWizardDialog
      v-model:open="showSqlExportWizard"
      :context="sqlExportWizardContext"
      :max-rows-default="sqlExportWizardMaxRowsDefault"
      :exporting="sqlExportWizardExporting"
      :variant="sqlExportWizardVariant"
      :is-production="sqlExportWizardIsProduction"
      :action-error="sqlExportWizardActionError"
      @export="confirmSqlExportWizardExport"
  />

  <RestoreWizardDialog
      v-model:open="showRestoreWizard"
      :context="restoreWizardContext"
      :file-state="restoreWizardFileState"
      :loading-file="restoreWizardLoadingFile"
      :executing="restoreWizardExecuting"
      :can-write="restoreWizardCanWrite"
      :can-ddl="restoreWizardCanDdl"
      :production-approval-teams="restoreWizardProductionApprovalTeams"
      :production-approval-error="restoreWizardApprovalError"
      :production-approval-submitting="restoreWizardApprovalSubmitting"
      :action-error="restoreWizardActionError"
      @pick-file="pickRestoreWizardFile"
      @execute="confirmRestoreWizardExecute"
      @submit-approval="submitRestoreWizardProductionApproval"
  />

  <ConfirmDialog
      v-model:open="showDeleteSqlDialog"
      :title="t('explorer.deleteSqlFileTitle')"
      :message="deleteSqlMessage"
      :confirm-label="t('explorer.context.deleteSqlFile')"
      confirm-variant="danger"
      @confirm="showDeleteSqlDialog = false; confirmDeleteSqlFile()"
  />

  <ConfirmDialog
      v-model:open="showDeleteProjectFileDialog"
      :title="t('explorer.deleteProjectFileTitle')"
      :message="deleteProjectFileMessage"
      :confirm-label="t('explorer.context.deleteProjectFile')"
      confirm-variant="danger"
      @confirm="showDeleteProjectFileDialog = false; confirmDeleteProjectFile()"
  />

  <ConfirmDialog
      v-model:open="showTableActionDialog"
      :title="pendingTableAction?.type === 'delete' ? t('explorer.deleteTableTitle') : t('explorer.truncateTableTitle')"
      :message="pendingTableAction?.message ?? ''"
      :confirm-label="pendingTableAction?.type === 'delete'
          ? t('explorer.context.deleteTable')
          : t('explorer.context.truncate')"
      confirm-variant="danger"
      @confirm="confirmTableAction"
  />

  <ConfirmDialog
      v-model:open="showDeleteDatabaseDialog"
      :title="t('explorer.deleteDatabaseTitle')"
      :message="t('explorer.deleteDatabaseMessage', {name: pendingDeleteDatabase?.label ?? ''})"
      :confirm-label="t('explorer.context.deleteDatabase')"
      confirm-variant="danger"
      @confirm="confirmDeleteDatabase"
  />

  <ConfirmDialog
      v-model:open="showDeleteCatalogDialog"
      :title="deleteCatalogTitle"
      :message="deleteCatalogMessage"
      :confirm-label="deleteCatalogConfirmLabel"
      confirm-variant="danger"
      @confirm="confirmDeleteCatalogNode"
  />

  <PromptDialog
      v-model:open="showRenameViewModelDialog"
      :title="t('explorer.context.renameViewModel')"
      :label="t('viewModel.nameLabel')"
      :default-value="renameViewModelDefaultName"
      :placeholder="t('viewModel.namePlaceholder')"
      :required-message="t('viewModel.nameRequired')"
      :confirm-label="t('common.confirm')"
      @confirm="confirmRenameViewModel"
  />

  <ConfirmDialog
      v-model:open="showDeleteViewModelDialog"
      :title="t('explorer.context.deleteViewModel')"
      :message="deleteViewModelMessage"
      :confirm-label="t('explorer.context.deleteViewModel')"
      confirm-variant="danger"
      @confirm="showDeleteViewModelDialog = false; confirmDeleteViewModel()"
  />

  <PromptDialog
      v-model:open="showMigrateViewModelDialog"
      :title="t('viewModel.migrateTitle')"
      :label="t('viewModel.migrateTargetTableLabel')"
      :default-value="migrateViewModelTargetTable"
      :placeholder="t('viewModel.migrateTargetTablePlaceholder')"
      :required-message="t('viewModel.migrateTargetTableRequired')"
      :confirm-label="t('explorer.context.migrateData')"
      @confirm="confirmMigrateViewModel"
  />

  <PromptDialog
      v-model:open="showRenameSshScriptRecordDialog"
      :title="t('ssh.scriptRecord.rename')"
      :label="t('ssh.scriptRecord.renamePrompt')"
      :default-value="renameSshScriptRecordDefaultName"
      :placeholder="t('ssh.scriptRecord.titlePlaceholder')"
      :required-message="t('ssh.scriptRecord.nameRequired')"
      :confirm-label="t('common.confirm')"
      @confirm="confirmRenameSshScriptRecord"
  />

  <ConfirmDialog
      v-model:open="showDeleteSshScriptRecordDialog"
      :title="t('ssh.scriptRecord.deleteTitle')"
      :message="deleteSshScriptRecordMessage"
      :confirm-label="t('ssh.scriptRecord.delete')"
      confirm-variant="danger"
      @confirm="showDeleteSshScriptRecordDialog = false; confirmDeleteSshScriptRecord()"
  />
</template>
