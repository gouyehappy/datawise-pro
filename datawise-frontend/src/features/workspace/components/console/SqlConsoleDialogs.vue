<!--
  SQL 控制台弹层：右键菜单 + 书签 / 审批 / 可视化查询 / 取消确认 / 索引建议。
-->
<script setup lang="ts">
import {defineAsyncComponent} from 'vue'
import {ContextMenuHost} from '@/core/context-menu'
import type {ContextMenuItem} from '@/core/types'
import ConsoleSqlCancelDialog from '@/features/workspace/components/ConsoleSqlCancelDialog.vue'
import type {SessionKillMode} from '@/features/workspace/services/session-kill.service'
import type {ProductionApprovalTeamOption} from '@/features/team/services/production-approval-policy.service'

defineOptions({name: 'SqlConsoleDialogs'})

const IndexSuggestDialog = defineAsyncComponent(
  () => import('@/features/workspace/components/IndexSuggestDialog.vue'),
)
const SaveBookmarkDialog = defineAsyncComponent(
  () => import('@/features/workspace/components/SaveBookmarkDialog.vue'),
)
const SubmitProductionApprovalDialog = defineAsyncComponent(
  () => import('@/features/workspace/components/SubmitProductionApprovalDialog.vue'),
)
const VisualQueryBuilderDialog = defineAsyncComponent(
  () => import('@/features/workspace/components/VisualQueryBuilderDialog.vue'),
)

defineProps<{
  editorMenuVisible: boolean
  editorMenuItems: ContextMenuItem[]
  editorMenuX: number
  editorMenuY: number
  indexDraftDialogOpen: boolean
  indexDraftQuery: string
  indexDraftSql: string
  bookmarksEnabled: boolean
  bookmarkDialogOpen: boolean
  bookmarkDefaults: {name: string; connectionName: string; sql: string}
  bookmarkSaving: boolean
  productionApprovalDialogOpen: boolean
  productionApprovalSubmitting: boolean
  productionApprovalError?: string
  approvalContextSql: string
  connectionLabel: string
  databaseName?: string
  productionApprovalTeams: ProductionApprovalTeamOption[]
  visualQueryBuilderOpen: boolean
  connectionId?: string
  cancelConfirmOpen: boolean
  cancelPendingMode: SessionKillMode
  cancelInProgress: boolean
  cancelError?: string
}>()

const emit = defineEmits<{
  'editor-menu-select': [id: string]
  'editor-menu-close': []
  'update:indexDraftDialogOpen': [open: boolean]
  'apply-index-draft': []
  'update:bookmarkDialogOpen': [open: boolean]
  'save-bookmark': [payload: {
    name: string
    connectionName: string
    sql: string
    folder: string
    tags: string[]
    saveToQueryLibrary: boolean
    changeNote: string
    queryId: string
  }]
  'update:productionApprovalOpen': [open: boolean]
  'submit-production-approval': [teamId: string]
  'update:visualQueryBuilderOpen': [open: boolean]
  'apply-visual-query': [sql: string, mode: 'replace' | 'insert']
  'apply-and-run-visual-query': [sql: string]
  'visual-query-text-to-sql': [prompt: string]
  'confirm-cancel': []
  'close-cancel': []
}>()
</script>

<template>
  <ContextMenuHost
      :visible="editorMenuVisible"
      :items="editorMenuItems"
      :x="editorMenuX"
      :y="editorMenuY"
      @select="emit('editor-menu-select', $event)"
      @close="emit('editor-menu-close')"
  />

  <IndexSuggestDialog
      :open="indexDraftDialogOpen"
      @update:open="emit('update:indexDraftDialogOpen', $event)"
      :query-sql="indexDraftQuery"
      :suggested-sql="indexDraftSql"
      @apply="emit('apply-index-draft')"
  />

  <SaveBookmarkDialog
      v-if="bookmarksEnabled"
      :open="bookmarkDialogOpen"
      @update:open="emit('update:bookmarkDialogOpen', $event)"
      :default-name="bookmarkDefaults.name"
      :default-connection-name="bookmarkDefaults.connectionName"
      :default-sql="bookmarkDefaults.sql"
      :saving="bookmarkSaving"
      @save="emit('save-bookmark', $event)"
  />

  <SubmitProductionApprovalDialog
      :open="productionApprovalDialogOpen"
      :saving="productionApprovalSubmitting"
      :error="productionApprovalError"
      :sql="approvalContextSql"
      :connection-name="connectionLabel"
      :database="databaseName"
      :teams="productionApprovalTeams"
      @update:open="emit('update:productionApprovalOpen', $event)"
      @submit="emit('submit-production-approval', $event)"
  />

  <VisualQueryBuilderDialog
      :open="visualQueryBuilderOpen"
      @update:open="emit('update:visualQueryBuilderOpen', $event)"
      :connection-id="connectionId"
      :database="databaseName"
      @apply="(sql, mode) => emit('apply-visual-query', sql, mode)"
      @apply-and-run="emit('apply-and-run-visual-query', $event)"
      @text-to-sql="emit('visual-query-text-to-sql', $event)"
  />

  <ConsoleSqlCancelDialog
      :open="cancelConfirmOpen"
      :mode="cancelPendingMode"
      :loading="cancelInProgress"
      :error="cancelError"
      @confirm="emit('confirm-cancel')"
      @cancel="emit('close-cancel')"
  />
</template>
