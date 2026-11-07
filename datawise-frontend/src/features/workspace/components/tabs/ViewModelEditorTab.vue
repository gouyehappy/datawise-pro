<script setup lang="ts">
import {computed, defineAsyncComponent, nextTick, onMounted, ref, watch} from 'vue'
import {storeToRefs} from 'pinia'
import {useI18n} from 'vue-i18n'
import {SqlEditor} from '@datawise/sql-editor'
import type {SqlEditorExpose} from '@datawise/sql-editor'
import {ensureSqlEditorPlugin} from '@/features/workspace/services/ensure-sql-editor-plugin'
import {
    AiPromptBar,
    ConsoleCtxBar,
    QueryResultPane,
} from '@/features/workspace/components'
import IconButton from '@/core/components/IconButton.vue'
import ConsoleToolbarIcon from '@/core/components/ConsoleToolbarIcon.vue'
import EditorFullscreenButton from '@/core/components/EditorFullscreenButton.vue'
import ResizeHandle from '@/core/components/ResizeHandle.vue'
import {DwConsoleToolbar, DwIcon, DwInlineAlert, DwPanelState} from '@/core/components'
import type {WorkspaceTab} from '@/core/types'
import {shortcutTooltip} from '@/features/layout/composables/useAppShortcutListener'
import {useViewModelEditor} from '@/features/workspace/composables/useViewModelEditor'
import {useViewModelLineagePreview} from '@/features/workspace/composables/useViewModelLineagePreview'
import {useExplorerSqlSchemaProvider} from '@/features/workspace/adapters/explorer-sql-schema-provider'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useResourceWriteGuard} from '@/features/auth/composables/useResourceWriteGuard'
import {useFeaturePermission} from '@/features/auth/composables/useFeaturePermission'
import {FeaturePermission} from '@/features/auth/types/feature-permission.types'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useEditorFullscreen} from '@/features/workspace/composables/useEditorFullscreen'
import {useAiPromptPanel} from '@/features/workspace/composables/useAiPromptPanel'
import {useSqlEditorShortcuts} from '@/features/workspace/composables/useSqlEditorShortcuts'
import {openSqlTableFromPeek} from '@/features/workspace/services/sql-table-peek.actions'
import {appendConsoleAiSql} from '@/features/workspace/services/console-ai-sql.service'
import {resolveExecutableSql} from '@/features/workspace/services/resolve-executable-sql'
import {canPreviewViewModelSql} from '@/features/explorer/services/view-model-save.service'
import {
    buildExplorerScopedLabelResolver,
    resolveConsoleInstanceLabel,
} from '@/features/workspace/services/resolve-console-instance'
import {
    extractDataSources,
    filterSelectableDataSources,
    findDataSource,
    includePinnedDataSource,
} from '@/features/explorer/utils/data-sources'
import {
    CONSOLE_EDITOR_HEIGHT_MAX,
    CONSOLE_EDITOR_HEIGHT_MIN,
    CONSOLE_EDITOR_HEIGHT_RATIO,
    CONSOLE_RESULT_MIN_HEIGHT,
} from '@/features/workspace/constants/defaults'

const isStandardEdition = import.meta.env.VITE_DATAWISE_EDITION === 'standard'

const ViewModelLineagePreviewPanel = defineAsyncComponent((() =>
    isStandardEdition
        ? import('@/features/pack/stubs/LineageWorkbenchStub.vue')
        : import('@/features/workspace/components/tabs/ViewModelLineagePreviewPanel.vue')
) as any)

const props = defineProps<{ tab: WorkspaceTab }>()
const {t} = useI18n()
const explorer = useExplorerStore()
const layout = useLayoutStore()
const workspace = useWorkspaceStore()
const appConfig = useAppConfigStore()
const pluginStore = usePluginStore()
const entitlement = useEntitlementStore()
const schemaProvider = useExplorerSqlSchemaProvider()
const {readOnly: guestReadOnly, hint: guestReadOnlyHint} = useResourceWriteGuard(UserResource.WorkspaceScripts)
const {can} = useFeaturePermission()
const {connectionHealthById} = storeToRefs(explorer)

const editorRef = ref<SqlEditorExpose>()
const editorReady = ref(false)
const splitRef = ref<HTMLElement>()
const aiSelectionSql = ref('')
const showPreview = ref(false)
const showLineagePreview = ref(false)
const editorHeight = ref(280)
const {isFullscreen: isEditorFullscreen, toggle: toggleEditorFullscreen, exit: exitEditorFullscreen} = useEditorFullscreen()

const connectionId = ref(props.tab.connectionId ?? '')
const instanceId = ref<string | null>(props.tab.instanceId ?? null)

const dataSources = computed(() => {
    const all = extractDataSources(explorer.tree)
    const selectable = filterSelectableDataSources(all, connectionHealthById.value)
    const pinned = props.tab.connectionId ?? connectionId.value
    return includePinnedDataSource(all, selectable, connectionHealthById.value, pinned)
})

const source = computed(() =>
    connectionId.value ? findDataSource(dataSources.value, connectionId.value) : undefined,
)

const activeInstance = computed(() =>
    source.value?.instances.find((item) => item.id === instanceId.value) ?? null,
)

const databaseName = computed(() =>
    resolveConsoleInstanceLabel({
        activeInstanceLabel: activeInstance.value?.label,
        instanceId: instanceId.value,
        tabInstanceId: props.tab.instanceId,
        tabDatabase: props.tab.database,
        findNodeLabel: (nodeId) => explorer.findNode(nodeId)?.label,
        resolveScopedLabel: buildExplorerScopedLabelResolver(explorer.tree, (nodeId) => explorer.findNode(nodeId)),
    }),
)

const dbDialect = computed(() => source.value?.dbType ?? explorer.findNode(props.tab.connectionId ?? '')?.dbType)

const connectionLabel = computed(() =>
    source.value?.label ?? explorer.findNode(props.tab.connectionId ?? '')?.label ?? t('common.unnamedConnection'),
)

const viewModelTitle = computed(() => props.tab.viewModelName ?? props.tab.title)

const {
    sql,
    previewColumns,
    previewRows,
    previewLoading,
    previewError,
    saving,
    draftSaving,
    saveError,
    scopeReady,
    canPreview,
    isDirty,
    statusLabelKey,
    preview,
    save,
    saveDraft,
    syncFromTab,
} = useViewModelEditor(props.tab, {
    getInstanceName: () => databaseName.value,
    resolvePreviewSql: () => resolvePreviewSql(),
})

const {
    graph: lineageGraph,
    loading: lineageLoading,
    error: lineageError,
    refresh: refreshLineagePreview,
} = useViewModelLineagePreview(sql, {
    connectionId: computed(() => connectionId.value || props.tab.connectionId || ''),
    instanceName: computed(() => databaseName.value || null),
    modelName: computed(() => viewModelTitle.value),
    dbType: computed(() => dbDialect.value),
    enabled: showLineagePreview,
})

const sqlFormatEnabled = computed(() => pluginStore.isEnabled('p-sql-format'))
const consoleAiEnabled = computed(
    () => import.meta.env.VITE_DATAWISE_EDITION !== 'standard' && pluginStore.isEnabled('p-console-ai'),
)

function resolvePreviewSql(): string {
    const selected = (editorRef.value?.getSelectedText() ?? '').trim()
    if (selected && canPreviewViewModelSql(selected)) return selected
    // 视图模型默认预览全文，避免光标在 JOIN 行时拿到半截语句
    const full = sql.value.trim()
    if (canPreviewViewModelSql(full)) return full
    return resolveExecutableSql(undefined, () => '', {
        fallbackToCurrentLineSql: () => editorRef.value?.getCurrentLineSql() ?? '',
        getCurrentLineNumber: () => editorRef.value?.getCurrentLineNumber() ?? null,
        fallbackToFullDocument: () => sql.value,
        getSelectionStartLine: () => editorRef.value?.getSelectionStartLine() ?? null,
    }).sql
}

function mapPreviewError(code: string | null): string {
    if (!code) return ''
    if (code === 'single_select_required') return t('viewModel.selectOnly')
    if (code === 'missing_scope') return t('viewModel.previewScopeMissing')
    return code
}

function mapSaveError(code: string | null): string {
    if (!code) return ''
    if (code === 'sql_required') return t('viewModel.sqlRequired')
    if (code === 'single_select_required') return t('viewModel.singleSelectRequired')
    if (code === 'missing_scope') return t('viewModel.scopeMissing')
    if (/select query/i.test(code)) return t('viewModel.selectOnly')
    return code
}

const previewErrorMessage = computed(() => mapPreviewError(previewError.value))
const saveErrorMessage = computed(() => mapSaveError(saveError.value))

const previewDisabledReason = computed(() => {
    if (!scopeReady.value) return t('viewModel.scopeMissing')
    if (!canPreview.value) return t('viewModel.previewDisabledHint')
    return ''
})

const scopePathLabel = computed(() => {
    const parts = [connectionLabel.value, databaseName.value, viewModelTitle.value].filter(Boolean)
    return parts.join(' / ')
})

async function resolveAiSqlRequest() {
    const connId = connectionId.value || props.tab.connectionId
    const db = databaseName.value
    if (!connId || !db) return undefined
    return {
        connectionId: connId,
        database: db,
        prefs: appConfig.aiPreferences,
    }
}

const {
    visible: showAiInput,
    prompt: aiPrompt,
    generating: aiGenerating,
    panelRef: aiPanelRef,
    btnRef: aiBtnRef,
    open: openAiInput,
    toggle: toggleAiInput,
    close: closeAiInput,
    submit: submitAiPrompt,
} = useAiPromptPanel(({prompt, sql: generated}) => {
    const {text, focusLine} = appendConsoleAiSql(sql.value, prompt, generated)
    sql.value = text
    void nextTick(() => {
        requestAnimationFrame(() => {
            editorRef.value?.goToLine(focusLine, false)
            editorRef.value?.layout()
        })
    })
}, {resolveRequest: resolveAiSqlRequest})

const aiContextLabel = computed(
    () => activeInstance.value?.label ?? source.value?.label ?? databaseName.value ?? null,
)

const aiQuickActions = computed(() => {
    if (!aiSelectionSql.value.trim()) return []
    return [
        {id: 'explain', label: t('console.editorMenu.explain')},
        {id: 'optimize', label: t('console.editorMenu.optimize')},
        {id: 'rewrite', label: t('console.editorMenu.rewrite')},
    ]
})

function applyViewModelAiQuickAction(actionId: string) {
    const selected = aiSelectionSql.value.trim()
    if (!selected) return
    const promptByAction: Record<string, string> = {
        explain: t('console.explainPrompt', {sql: selected}),
        optimize: t('console.optimizePrompt', {sql: selected}),
        rewrite: t('console.rewritePrompt', {sql: selected}),
    }
    const prompt = promptByAction[actionId]
    if (!prompt) return
    aiPrompt.value = prompt
    void submitAiPrompt()
}

watch(
    () => [props.tab.connectionId, props.tab.instanceId] as const,
    ([nextConnectionId, nextInstanceId]) => {
        if (nextConnectionId) connectionId.value = nextConnectionId
        if (nextInstanceId !== undefined) instanceId.value = nextInstanceId
    },
)

watch(
    () => [props.tab.viewModelSql, props.tab.id] as const,
    () => syncFromTab(props.tab),
)

watch(sql, (value) => {
    props.tab.viewModelSql = value
})

watch(databaseName, (name) => {
    if (!name?.trim()) return
    if (props.tab.database?.trim() !== name.trim()) {
        workspace.updateTabContext(props.tab.id, {database: name.trim()})
    }
}, {immediate: true})

watch(showAiInput, async (visible) => {
    if (visible) {
        aiSelectionSql.value = editorRef.value?.getSelectedText()?.trim() ?? ''
    }
    await nextTick()
    editorRef.value?.layout()
})

watch(isEditorFullscreen, async () => {
    await nextTick()
    editorRef.value?.layout()
})

watch(showLineagePreview, async () => {
    await nextTick()
    editorRef.value?.layout()
})

watch(showPreview, async () => {
    await nextTick()
    editorRef.value?.layout()
})

function clampEditorHeight(value: number) {
    const splitEl = splitRef.value
    const maxByPane = splitEl
        ? Math.max(CONSOLE_EDITOR_HEIGHT_MIN, splitEl.clientHeight - CONSOLE_RESULT_MIN_HEIGHT - 4)
        : CONSOLE_EDITOR_HEIGHT_MAX
    const max = Math.min(CONSOLE_EDITOR_HEIGHT_MAX, maxByPane)
    return Math.min(max, Math.max(CONSOLE_EDITOR_HEIGHT_MIN, value))
}

function formatSql() {
    const ok = editorRef.value?.formatDocument() ?? false
    if (ok) workspace.setStatus(t('console.formatted'))
}

async function onPreview(sqlOverride?: string) {
    if (isEditorFullscreen.value) {
        exitEditorFullscreen()
    }
    await preview(sqlOverride)
    showLineagePreview.value = false
    showPreview.value = true
}

function onRunStatementFromGutter(payload: {sql: string}) {
    void onPreview(payload.sql)
}

function onOpenTableFromSql(payload: {tableName: string; tableId?: string; catalog?: string}) {
    void openSqlTableFromPeek(payload, {
        connectionId: connectionId.value || props.tab.connectionId,
        database: databaseName.value,
    })
}

function toggleLineagePreviewPanel() {
    if (isStandardEdition) {
        entitlement.openPaywall('pack.lineage', 'tab.lineage')
        return
    }
    if (!entitlement.guardPack('pack.lineage', 'tab.lineage')) return
    if (showLineagePreview.value) {
        showLineagePreview.value = false
        return
    }
    showPreview.value = false
    showLineagePreview.value = true
}

function togglePreviewPanel() {
    if (showPreview.value) {
        showPreview.value = false
        return
    }
    showLineagePreview.value = false
    showPreview.value = true
    if (!previewRows.value.length && canPreview.value) {
        void onPreview()
    }
}

const bottomPanelOpen = computed(() => showPreview.value || showLineagePreview.value)

async function refreshViewsTreeAfterSave() {
    try {
        const instanceName = databaseName.value
        if (props.tab.connectionId && instanceName) {
            await explorer.reloadViewsFolder(
                props.tab.connectionId,
                instanceName,
                props.tab.instanceId ?? undefined,
            )
        }
    } catch {
        // tree refresh is best-effort
    }
}

function denyGuestWrite(): boolean {
    if (!guestReadOnly.value) return false
    return true
}

async function onPublish() {
    if (denyGuestWrite()) return
    const result = await save()
    if (!result) return
    if (result.outcome === 'published') {
        layout.showSuccessToast(t('viewModel.saved', {name: viewModelTitle.value}))
        await refreshViewsTreeAfterSave()
        return
    }
    // Validation / publish failure: saveError is rendered inline
    if (result.reason === 'single_select_required' || result.reason === 'sql_required' || result.reason === 'missing_scope') {
        return
    }
    if (!result.reason) {
        layout.showSuccessToast(t('viewModel.savedDraft', {name: viewModelTitle.value}))
    }
    await refreshViewsTreeAfterSave()
}

async function onSaveDraft() {
    if (denyGuestWrite()) return
    const result = await saveDraft()
    if (!result) return
    if (result.reason) return
    layout.showSuccessToast(t('viewModel.savedDraft', {name: viewModelTitle.value}))
    await refreshViewsTreeAfterSave()
}

useSqlEditorShortcuts(props.tab.id, () => ({
    'workspace.runSql': () => void onPreview(),
    'workspace.saveConsole': () => void onSaveDraft(),
    'workspace.aiPrompt': consoleAiEnabled.value ? openAiInput : undefined,
}))

onMounted(async () => {
    await ensureSqlEditorPlugin()
    editorReady.value = true
    syncFromTab(props.tab)
    if (!splitRef.value) return
    editorHeight.value = clampEditorHeight(
        Math.round(splitRef.value.clientHeight * CONSOLE_EDITOR_HEIGHT_RATIO),
    )
})
</script>

<template>
  <div class="console-tab vm-editor-tab vm-editor-tab--v2 dw-workbench-page" data-wb-recipe="wb-editor-results" :class="{ 'is-editor-fullscreen': isEditorFullscreen }">
    <header class="vm-editor-hero" :class="{'is-warn': !scopeReady}">
      <div class="vm-editor-hero__main">
        <div class="vm-editor-hero__title-row">
          <span
              class="vm-editor-status__badge"
              :class="{
                'vm-editor-status__badge--draft': tab.viewModelIsDraft,
                'vm-editor-status__badge--published': !tab.viewModelIsDraft && tab.viewModelSavedSql,
              }"
          >
            {{ t(statusLabelKey) }}
            <span v-if="isDirty" class="vm-editor-tab__dirty">*</span>
          </span>
          <h1 class="vm-editor-hero__title">
            {{ viewModelTitle }}
          </h1>
        </div>
        <p class="vm-editor-hero__path" :title="scopePathLabel">
          {{ scopePathLabel }}
        </p>
        <p v-if="!scopeReady" class="vm-editor-hero__hint is-warn">{{ t('viewModel.scopeMissing') }}</p>
      </div>

      <div class="vm-editor-hero__panels" role="tablist" :aria-label="t('viewModel.editorSectionLabel')">
        <button
            type="button"
            class="vm-panel-toggle"
            role="tab"
            :aria-selected="showLineagePreview"
            :class="{'is-active': showLineagePreview}"
            :disabled="!scopeReady"
            :title="t('viewModel.panelLineageHint')"
            @click="toggleLineagePreviewPanel"
        >
          <span class="vm-panel-toggle__icon" aria-hidden="true">
            <DwIcon name="layers" size="sm"/>
          </span>
          <span class="vm-panel-toggle__label">{{ t('viewModel.panelLineage') }}</span>
        </button>
        <button
            type="button"
            class="vm-panel-toggle"
            role="tab"
            :aria-selected="showPreview"
            :class="{'is-active': showPreview}"
            :title="t('viewModel.panelResultsHint')"
            @click="togglePreviewPanel"
        >
          <span class="vm-panel-toggle__icon" aria-hidden="true">
            <DwIcon name="table" size="sm"/>
          </span>
          <span class="vm-panel-toggle__label">{{ t('viewModel.panelResults') }}</span>
        </button>
      </div>
    </header>

    <DwConsoleToolbar class="vm-editor-toolbar">
      <template #start>
      <div class="dw-console-actions dw-btn-group">
        <IconButton
            v-if="can(FeaturePermission.WorkbenchConsoleRun)"
            class="console-run-btn"
            :disabled="!canPreview || previewLoading"
            :title="previewDisabledReason || shortcutTooltip(t('viewModel.runPreview'), 'workspace.runSql')"
            @click="onPreview()"
        >
          <ConsoleToolbarIcon name="run"/>
        </IconButton>
        <span class="dw-console-divider" aria-hidden="true"/>
        <IconButton
            v-if="can(FeaturePermission.WorkbenchConsoleSave)"
            :disabled="guestReadOnly || saving || draftSaving || !scopeReady"
            :title="guestReadOnly ? guestReadOnlyHint : t('viewModel.publish')"
            @click="onPublish"
        >
          <ConsoleToolbarIcon name="save"/>
        </IconButton>
        <IconButton
            v-if="can(FeaturePermission.WorkbenchConsoleSave)"
            :disabled="guestReadOnly || saving || draftSaving || !scopeReady"
            :title="guestReadOnly ? guestReadOnlyHint : t('viewModel.saveDraft')"
            @click="onSaveDraft"
        >
          <ConsoleToolbarIcon name="save" muted/>
        </IconButton>
        <IconButton
            v-if="sqlFormatEnabled && can(FeaturePermission.WorkbenchConsoleFormat)"
            :title="t('console.format')"
            @click="formatSql"
        >
          <ConsoleToolbarIcon name="format"/>
        </IconButton>
        <IconButton
            :title="t('console.foldAll')"
            :aria-label="t('console.foldAll')"
            @click="editorRef?.foldAll()"
        >
          <ConsoleToolbarIcon name="foldAll"/>
        </IconButton>
        <IconButton
            :title="t('console.unfoldAll')"
            :aria-label="t('console.unfoldAll')"
            @click="editorRef?.unfoldAll()"
        >
          <ConsoleToolbarIcon name="unfoldAll"/>
        </IconButton>
        <IconButton
            :title="t('console.sqlEditorSettingsHint')"
            :aria-label="t('console.sqlEditorSettings')"
            @click="editorRef?.openSettings?.()"
        >
          <ConsoleToolbarIcon name="sqlEditorSettings"/>
        </IconButton>
        <EditorFullscreenButton
            v-if="can(FeaturePermission.WorkbenchConsoleFullscreen)"
            variant="toolbar"
            :active="isEditorFullscreen"
            @click="toggleEditorFullscreen"
        />
        <span class="dw-console-divider" aria-hidden="true"/>
        <div v-if="consoleAiEnabled && can(FeaturePermission.WorkbenchConsoleAi)" ref="aiBtnRef" class="ai-btn-wrap">
          <IconButton
              class="console-ai-btn"
              :title="shortcutTooltip(t('console.ai'), 'workspace.aiPrompt')"
              :active="showAiInput"
              @click="toggleAiInput"
          >
            <ConsoleToolbarIcon name="ai"/>
          </IconButton>
        </div>
      </div>
      </template>

      <template #context>
        <ConsoleCtxBar
            v-model:connection-id="connectionId"
            v-model:instance-id="instanceId"
            :data-sources="dataSources"
            :bound-database-label="tab.database"
            :context-locked="true"
            read-only
            :bound-connection-label="connectionLabel"
            :bound-connection-db-type="dbDialect"
        />
      </template>
    </DwConsoleToolbar>

    <DwInlineAlert :message="saveErrorMessage"/>

    <div ref="splitRef" class="split dw-seam-stack dw-seam-stack--flush">
      <div
          class="editor-pane"
          :class="{
            'editor-pane--fullscreen': isEditorFullscreen,
            'editor-pane--expanded': !isEditorFullscreen && !bottomPanelOpen,
          }"
          :style="!isEditorFullscreen && bottomPanelOpen ? { height: `${editorHeight}px` } : undefined"
      >
        <AiPromptBar
            v-if="showAiInput && consoleAiEnabled"
            ref="aiPanelRef"
            v-model="aiPrompt"
            :generating="aiGenerating"
            :context-label="aiContextLabel"
            :quick-actions="aiQuickActions"
            @submit="submitAiPrompt"
            @close="closeAiInput"
            @quick-action="applyViewModelAiQuickAction"
        />
        <div class="editor-surface">
          <SqlEditor
              v-if="editorReady"
              ref="editorRef"
              v-model="sql"
              :connection-id="connectionId || tab.connectionId"
              :database-name="databaseName"
              :schema-provider="schemaProvider"
              :dialect="dbDialect"
              @run-statement="onRunStatementFromGutter"
              @open-table="onOpenTableFromSql"
          />
          <DwPanelState
              v-else
              class="editor-surface__loading"
              status="loading"
              fill
              compact
              :message="t('common.editorLoading')"
          />
        </div>
      </div>
      <ResizeHandle
          v-if="!isEditorFullscreen && bottomPanelOpen"
          v-model="editorHeight"
          direction="horizontal"
          variant="line"
          :min="CONSOLE_EDITOR_HEIGHT_MIN"
          :max="CONSOLE_EDITOR_HEIGHT_MAX"
      />
      <QueryResultPane
          v-if="!isEditorFullscreen && showPreview"
          class="result-pane"
          :columns="previewColumns"
          :rows="previewRows"
          :total="previewRows.length"
          :result-label="viewModelTitle"
          :loading="previewLoading"
          :show-export="false"
      />
      <ViewModelLineagePreviewPanel
          v-else-if="!isStandardEdition && !isEditorFullscreen && showLineagePreview"
          class="result-pane vm-lineage-bottom"
          :graph="lineageGraph"
          :loading="lineageLoading"
          :error="lineageError"
          :model-name="viewModelTitle"
          @refresh="refreshLineagePreview"
      />
      <DwInlineAlert :message="previewErrorMessage && !isEditorFullscreen && showPreview ? previewErrorMessage : null"/>
    </div>
  </div>
</template>

<style scoped>
.ai-btn-wrap {
  display: inline-flex;
}

.dw-console-toolbar__context {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--dw-gap);
  min-width: 0;
}

.vm-editor-tab {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.vm-editor-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--dw-space-6);
  padding: var(--dw-space-6) var(--dw-space-8);
  border-bottom: 1px solid var(--dw-border-light);
  background: color-mix(in srgb, var(--dw-bg-panel) 88%, var(--dw-bg-editor));
}

.vm-editor-hero.is-warn {
  background: color-mix(in srgb, var(--dw-warning) 7%, var(--dw-bg-panel));
}

.vm-editor-hero__main {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
  min-width: 0;
}

.vm-editor-hero__title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-space-4);
  min-width: 0;
}

.vm-editor-hero__title {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  color: var(--dw-text);
  font-size: var(--dw-text-2xl);
  font-weight: 650;
  line-height: var(--dw-leading-tight);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vm-editor-hero__path {
  margin: 0;
  overflow: hidden;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-snug);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vm-editor-hero__hint {
  margin: var(--dw-space-1) 0 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  line-height: var(--dw-leading-snug);
}

.vm-editor-hero__hint.is-warn {
  color: var(--dw-warning-fg);
}

.vm-editor-hero__panels {
  display: inline-flex;
  flex-shrink: 0;
  align-items: stretch;
  padding: var(--dw-space-1);
  border: 1px solid color-mix(in srgb, var(--dw-border) 80%, transparent);
  border-radius: var(--dw-radius-pill);
  background: color-mix(in srgb, var(--dw-bg-muted) 55%, var(--dw-bg-panel));
  gap: var(--dw-space-1);
  box-shadow: inset 0 1px 1px color-mix(in srgb, var(--dw-text) 4%, transparent);
}

.vm-panel-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  min-height: var(--dw-control-h);
  padding: 0 var(--dw-space-7) 0 var(--dw-space-5);
  border: none;
  border-radius: var(--dw-radius-pill);
  background: transparent;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 560;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition:
      background 140ms var(--dw-ease, ease),
      color 140ms var(--dw-ease, ease),
      box-shadow 140ms var(--dw-ease, ease);
}

.vm-panel-toggle__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dw-icon-size-lg);
  height: var(--dw-icon-size-lg);
  opacity: 0.78;
}

.vm-panel-toggle:hover:not(:disabled) {
  color: var(--dw-text-secondary);
  background: color-mix(in srgb, var(--dw-text) 4%, transparent);
}

.vm-panel-toggle:hover:not(:disabled) .vm-panel-toggle__icon {
  opacity: 1;
}

.vm-panel-toggle.is-active {
  background: var(--dw-bg-panel);
  color: var(--dw-primary);
  box-shadow:
      0 1px 2px color-mix(in srgb, var(--dw-text) 10%, transparent),
      0 0 0 1px color-mix(in srgb, var(--dw-primary) 16%, transparent);
}

.vm-panel-toggle.is-active .vm-panel-toggle__icon {
  opacity: 1;
}

.vm-panel-toggle:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.vm-editor-toolbar {
  border-bottom: 1px solid var(--dw-border-light);
}

.vm-editor-status__badge {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-xs);
  width: fit-content;
  font-size: var(--dw-font-size-badge);
  font-weight: 600;
  padding: var(--dw-space-1) var(--dw-space-4);
  border-radius: var(--dw-radius-pill);
  background: var(--dw-bg-muted);
  color: var(--dw-text-secondary);
  white-space: nowrap;
}

.vm-editor-status__badge--draft {
  color: var(--dw-warning);
  background: color-mix(in srgb, var(--dw-warning) 12%, transparent);
}

.vm-editor-status__badge--published {
  color: var(--dw-success);
  background: color-mix(in srgb, var(--dw-success) 12%, transparent);
}

.vm-editor-tab__dirty {
  color: var(--dw-warning);
}

.split {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.editor-pane {
  position: relative;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-height: 120px;
  border-bottom: 1px solid var(--dw-border-light);
}

.editor-surface {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.editor-surface__loading {
  flex: 1;
  min-height: 0;
}

.editor-surface :deep(.sql-editor) {
  height: 100%;
}

.editor-pane--fullscreen {
  flex: 1;
  min-height: 0;
  border-bottom: none;
}

.editor-pane--expanded {
  flex: 1;
  min-height: 0;
  border-bottom: none;
}

.console-tab.is-editor-fullscreen .split {
  min-height: 0;
}

.result-pane {
  flex: 1;
  min-height: 120px;
}

.vm-lineage-bottom {
  min-height: 0;
  border-top: none;
}
</style>
