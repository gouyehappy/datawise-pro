<script setup lang="ts">
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {ConsoleCtxBar, ConsoleTransactionBar} from '@/features/workspace/components'
import ConsoleRunSplitButton from '@/features/workspace/components/ConsoleRunSplitButton.vue'
import EditorFullscreenButton from '@/core/components/EditorFullscreenButton.vue'
import IconButton from '@/core/components/IconButton.vue'
import ConsoleToolbarIcon from '@/core/components/ConsoleToolbarIcon.vue'
import WriteUnlockToolbar from '@/features/connection/components/WriteUnlockToolbar.vue'
import SqlExecutionLimitHint from '@/features/workspace/components/SqlExecutionLimitHint.vue'
import {shortcutTooltip} from '@/features/layout/composables/useAppShortcutListener'
import {useFeaturePermission} from '@/features/auth/composables/useFeaturePermission'
import {FeaturePermission} from '@/features/auth/types/feature-permission.types'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import type {SqlExecuteMode} from '@/features/workspace/services/resolve-executable-sql'
import type {DataSourceOption, DbType} from '@/core/types'

defineOptions({name: 'SqlConsoleToolbar'})

defineProps<{
  running: boolean
  runningElapsedLabel: string
  dangerousSqlPending: boolean
  dangerousSqlSubmitTitle: string
  explainPlanEnabled: boolean
  sqlExplainCapable: boolean
  sqlExplainHint: string
  visualQueryBuilderCapable: boolean
  jdbcTunnelSshEnabled: boolean
  connectionId: string
  tabConnectionId?: string
  tabId: string
  tabDatabase?: string
  connectionWriteGuard: boolean
  showToolbarRunGroup: boolean
  showToolbarSaveGroup: boolean
  showToolbarAiGroup: boolean
  guestReadOnly: boolean
  guestReadOnlyHint: string
  bookmarksEnabled: boolean
  sqlFormatEnabled: boolean
  isEditorFullscreen: boolean
  aiInputActive: boolean
  databaseName?: string
  canManageTransactions: boolean
  dataSources: DataSourceOption[]
  workspaceBound: boolean
  boundConnectionLabel?: string
  dbDialect?: DbType
  instanceId: string | null
}>()

const emit = defineEmits<{
  run: []
  cancel: []
  'run-with-mode': [mode: SqlExecuteMode]
  explain: [event?: MouseEvent]
  'submit-dangerous': []
  'rollback-dangerous': []
  'cancel-connection': []
  'open-jdbc-ssh': []
  save: []
  'save-as': []
  bookmark: []
  'view-model': []
  format: []
  'fold-all': []
  'unfold-all': []
  'open-settings': []
  'visual-query': []
  'toggle-fullscreen': []
  'toggle-ai': []
  'update:connectionId': [value: string]
  'update:instanceId': [value: string | null]
}>()

const {t} = useI18n()
const {can} = useFeaturePermission()
const explorer = useExplorerStore()

const transactionBarRef = ref<{refreshStatus: () => Promise<void>} | null>(null)

defineExpose({
  refreshTransactionStatus: () => transactionBarRef.value?.refreshStatus(),
})
</script>

<template>
  <div class="dw-console-toolbar">
    <div class="dw-console-actions dw-btn-group">
      <ConsoleRunSplitButton
          v-if="can(FeaturePermission.WorkbenchConsoleRun)"
          :running="running"
          :disabled="dangerousSqlPending"
          :run-title="dangerousSqlPending
            ? t('console.dangerousSql.pendingRunBlocked')
            : shortcutTooltip(t('console.run'), 'workspace.runSql')"
          :cancel-title="t('console.cancelExecution.cancelQueryHint')"
          @run="emit('run')"
          @cancel="emit('cancel')"
          @run-with-mode="emit('run-with-mode', $event)"
      />
      <span
          v-if="running && runningElapsedLabel"
          class="console-run-elapsed"
          :title="t('console.runningElapsed', {duration: runningElapsedLabel})"
      >
        {{ runningElapsedLabel }}
      </span>
      <IconButton
          v-if="explainPlanEnabled && can(FeaturePermission.WorkbenchConsoleExplain)"
          :disabled="!sqlExplainCapable"
          :title="sqlExplainCapable
            ? t('console.explainMode.toolbar')
            : sqlExplainHint"
          @click="emit('explain', $event)"
      >
        <ConsoleToolbarIcon name="explainPlan"/>
      </IconButton>
      <IconButton
          v-if="can(FeaturePermission.WorkbenchConsoleDangerousSql)"
          :disabled="!dangerousSqlPending"
          :variant="dangerousSqlPending ? 'accent' : undefined"
          :title="dangerousSqlSubmitTitle"
          @click="emit('submit-dangerous')"
      >
        <ConsoleToolbarIcon name="submit"/>
      </IconButton>
      <IconButton
          v-if="can(FeaturePermission.WorkbenchConsoleDangerousSql)"
          :disabled="!dangerousSqlPending"
          :title="t('console.dangerousSql.rollback')"
          @click="emit('rollback-dangerous')"
      >
        <ConsoleToolbarIcon name="rollback"/>
      </IconButton>
      <IconButton
          v-if="running && can(FeaturePermission.WorkbenchConsoleRun)"
          class="console-disconnect-btn"
          :title="t('console.cancelExecution.cancelConnectionHint')"
          @click="emit('cancel-connection')"
      >
        <ConsoleToolbarIcon name="disconnect"/>
      </IconButton>
      <IconButton
          v-if="jdbcTunnelSshEnabled"
          :title="t('console.openJdbcSshTunnel')"
          @click="emit('open-jdbc-ssh')"
      >
        <ConsoleToolbarIcon name="terminal"/>
      </IconButton>
      <WriteUnlockToolbar
          :connection-id="connectionId || tabConnectionId"
          :write-guard="connectionWriteGuard"
      />
      <span
          v-if="showToolbarRunGroup && showToolbarSaveGroup"
          class="dw-console-divider"
          aria-hidden="true"
      />
      <IconButton
          v-if="can(FeaturePermission.WorkbenchConsoleSave)"
          :disabled="guestReadOnly"
          :title="guestReadOnly ? guestReadOnlyHint : shortcutTooltip(t('console.save'), 'workspace.saveConsole')"
          @click="emit('save')"
      >
        <ConsoleToolbarIcon name="save"/>
      </IconButton>
      <IconButton
          v-if="can(FeaturePermission.WorkbenchConsoleSaveAs)"
          :disabled="guestReadOnly"
          :title="guestReadOnly ? guestReadOnlyHint : t('console.saveAsFile')"
          @click="emit('save-as')"
      >
        <ConsoleToolbarIcon name="saveAs"/>
      </IconButton>
      <IconButton
          v-if="bookmarksEnabled && can(FeaturePermission.WorkbenchConsoleBookmark)"
          :title="t('console.saveBookmark')"
          @click="emit('bookmark')"
      >
        <ConsoleToolbarIcon name="bookmark"/>
      </IconButton>
      <IconButton
          v-if="can(FeaturePermission.WorkbenchConsoleViewModel)"
          :disabled="guestReadOnly"
          :title="t('console.saveViewModel')"
          @click="emit('view-model')"
      >
        <ConsoleToolbarIcon name="viewModel"/>
      </IconButton>
      <IconButton
          v-if="sqlFormatEnabled && can(FeaturePermission.WorkbenchConsoleFormat)"
          :title="t('console.format')"
          @click="emit('format')"
      >
        <ConsoleToolbarIcon name="format"/>
      </IconButton>
      <IconButton
          :title="t('console.foldAll')"
          :aria-label="t('console.foldAll')"
          @click="emit('fold-all')"
      >
        <ConsoleToolbarIcon name="foldAll"/>
      </IconButton>
      <IconButton
          :title="t('console.unfoldAll')"
          :aria-label="t('console.unfoldAll')"
          @click="emit('unfold-all')"
      >
        <ConsoleToolbarIcon name="unfoldAll"/>
      </IconButton>
      <IconButton
          :title="t('console.sqlEditorSettingsHint')"
          :aria-label="t('console.sqlEditorSettings')"
          @click="emit('open-settings')"
      >
        <ConsoleToolbarIcon name="sqlEditorSettings"/>
      </IconButton>
      <IconButton
          v-if="can(FeaturePermission.WorkbenchConsoleRun) && visualQueryBuilderCapable"
          :title="t('console.visualQuery.toolbar')"
          @click="emit('visual-query')"
      >
        <ConsoleToolbarIcon name="visualQuery"/>
      </IconButton>
      <EditorFullscreenButton
          v-if="can(FeaturePermission.WorkbenchConsoleFullscreen)"
          variant="toolbar"
          :active="isEditorFullscreen"
          @click="emit('toggle-fullscreen')"
      />
      <span
          v-if="showToolbarSaveGroup && showToolbarAiGroup"
          class="dw-console-divider"
          aria-hidden="true"
      />
      <div v-if="showToolbarAiGroup" class="ai-btn-wrap">
        <IconButton
            class="console-ai-btn"
            :title="shortcutTooltip(t('console.ai'), 'workspace.aiPrompt')"
            :active="aiInputActive"
            @click="emit('toggle-ai')"
        >
          <ConsoleToolbarIcon name="ai"/>
        </IconButton>
      </div>
    </div>

    <div class="dw-console-toolbar__context">
      <div class="dw-console-toolbar__controls">
        <SqlExecutionLimitHint/>
        <ConsoleTransactionBar
            v-if="can(FeaturePermission.WorkbenchConsoleTransaction)"
            ref="transactionBarRef"
            :tab-id="tabId"
            :connection-id="connectionId || tabConnectionId"
            :database="databaseName"
            :can-manage="canManageTransactions"
        />
      </div>
      <span class="dw-console-divider" aria-hidden="true"/>
      <div class="dw-console-toolbar__info">
        <ConsoleCtxBar
            class="dw-console-toolbar__ctx"
            :connection-id="connectionId"
            :instance-id="instanceId"
            :data-sources="dataSources"
            :bound-database-label="tabDatabase"
            :context-locked="workspaceBound"
            :bound-connection-label="boundConnectionLabel ?? explorer.findNode(tabConnectionId ?? '')?.label"
            :bound-connection-db-type="dbDialect"
            @update:connection-id="emit('update:connectionId', $event)"
            @update:instance-id="emit('update:instanceId', $event)"
        />
      </div>
    </div>
  </div>
</template>
