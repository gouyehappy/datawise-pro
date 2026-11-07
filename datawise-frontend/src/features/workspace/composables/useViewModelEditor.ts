import {computed, ref} from 'vue'
import type {WorkspaceTab, TableColumn, TableRow} from '@/core/types'
import {sqlApi} from '@/api/modules/sql'
import {
    canPreviewViewModelSql,
    saveViewModelDraftFromEditor,
    saveViewModelFromEditor,
} from '@/features/explorer/services/view-model-save.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {t} from '@/i18n'

const PREVIEW_PAGE_SIZE = 200

export interface UseViewModelEditorOptions {
    getInstanceName: () => string | undefined
    resolvePreviewSql?: () => string
}

export function useViewModelEditor(tab: WorkspaceTab, options: UseViewModelEditorOptions) {
    const sql = ref(tab.viewModelSql ?? '')
    const previewColumns = ref<TableColumn[]>([])
    const previewRows = ref<TableRow[]>([])
    const previewLoading = ref(false)
    const previewError = ref<string | null>(null)
    const saving = ref(false)
    const draftSaving = ref(false)
    const saveError = ref<string | null>(null)

    const scopeReady = computed(() =>
        Boolean(tab.connectionId?.trim() && options.getInstanceName()?.trim()),
    )
    const canPreview = computed(() => {
        if (!scopeReady.value) return false
        // 视图模型以全文为准，避免光标落在 JOIN 行时工具栏误禁用
        return canPreviewViewModelSql(sql.value)
    })
    const isDirty = computed(() => sql.value.trim() !== (tab.viewModelSavedSql ?? '').trim())
    const statusLabelKey = computed(() => {
        if (tab.viewModelIsDraft) return 'viewModel.statusDraft'
        if (tab.viewModelSavedSql?.trim()) return 'viewModel.statusPublished'
        return 'viewModel.statusNew'
    })

    function resolveSqlForPreview(): string {
        return (options.resolvePreviewSql?.() ?? sql.value).trim()
    }

    async function preview(sqlOverride?: string) {
        const resolved = (sqlOverride?.trim() || resolveSqlForPreview()).trim()
        const trimmed = canPreviewViewModelSql(resolved) ? resolved : sql.value.trim()
        const instanceName = options.getInstanceName()
        if (!tab.connectionId || !instanceName || !trimmed) {
            if (!instanceName) {
                previewError.value = 'missing_scope'
            }
            previewColumns.value = []
            previewRows.value = []
            return
        }
        if (!canPreviewViewModelSql(trimmed)) {
            previewError.value = 'single_select_required'
            previewColumns.value = []
            previewRows.value = []
            return
        }
        previewLoading.value = true
        previewError.value = null
        try {
            const result = await sqlApi.execute(trimmed, {
                connectionId: tab.connectionId,
                database: instanceName,
                pageSize: PREVIEW_PAGE_SIZE,
            })
            previewColumns.value = (result.columns ?? []) as TableColumn[]
            previewRows.value = (result.rows ?? []) as TableRow[]
        } catch (error) {
            previewError.value = resolveCaughtApiErrorMessage(error, t, 'viewModel.loadFailed')
            previewColumns.value = []
            previewRows.value = []
        } finally {
            previewLoading.value = false
        }
    }

    function applySaveResult(outcome: 'published' | 'draft') {
        tab.viewModelSql = sql.value
        tab.viewModelSavedSql = sql.value
        tab.viewModelIsDraft = outcome === 'draft'
    }

    async function save() {
        if (saving.value) return null
        saving.value = true
        saveError.value = null
        try {
            const result = await saveViewModelFromEditor(
                tab,
                sql.value,
                options.getInstanceName(),
            )
            if (!result.reason || result.outcome === 'published') {
                applySaveResult(result.outcome)
            } else if (result.outcome === 'draft' && result.reason !== 'single_select_required') {
                applySaveResult('draft')
            }
            if (result.reason) {
                saveError.value = result.reason
            }
            return result
        } finally {
            saving.value = false
        }
    }

    async function saveDraft() {
        if (draftSaving.value) return null
        draftSaving.value = true
        saveError.value = null
        try {
            const result = await saveViewModelDraftFromEditor(
                tab,
                sql.value,
                options.getInstanceName(),
            )
            if (!result.reason) {
                applySaveResult('draft')
            } else {
                saveError.value = result.reason
            }
            return result
        } finally {
            draftSaving.value = false
        }
    }

    function syncFromTab(nextTab: WorkspaceTab) {
        sql.value = nextTab.viewModelSql ?? ''
    }

    return {
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
    }
}
