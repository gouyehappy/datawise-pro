import {computed, ref, type Ref} from 'vue'
import type {ComposerTranslation} from 'vue-i18n'
import type {TableColumn, TableRow} from '@/core/types'
import type {GridViewState} from '@/core/data-grid/services/grid-view-state.service'
import {applyGridViewStateToRows} from '@/core/data-grid/services/grid-view-state.service'
import {
    downloadGridExport,
    type GridExportFormat,
    type GridExportOptions,
} from '@/core/data-grid/services/grid-export.service'
import {resolveFreeGridExportRows} from '@/core/data-grid/services/grid-export-entitlement'

/** Minimal faces so core export does not import feature Pinia stores. */
export interface DataGridExportLayoutFace {
    showWarningToast: (message: string) => void
    showSuccessToast?: (message: string) => void
}

export interface DataGridExportPluginFace {
    isEnabled: (pluginId: string) => boolean
}

export interface DataGridExportEntitlementFace {
    mode: 'open' | 'enforced'
    suiteId?: string | null
    watermarkFooter?: string | null
    isPackUsable: (packId: string) => boolean
    openPaywall: (packId: string, reason: string) => void
}

export interface DataGridExportDeps {
    t: ComposerTranslation
    layout: DataGridExportLayoutFace
    pluginStore: DataGridExportPluginFace
    entitlement: DataGridExportEntitlementFace
    emit: (event: 'exported', fileName: string, path?: string) => void
    props: {
        exportBaseName: string
        exportTableName?: string
        truncatedAtCap: boolean
    }
    displayColumns: Ref<TableColumn[]>
    gridRows: Ref<TableRow[]>
    gridColumns: Ref<TableColumn[]>
    viewState: Ref<GridViewState | undefined>
    columnFiltersEnabled: Ref<boolean>
}

export function useDataGridExport(deps: DataGridExportDeps) {
    const {
        t,
        layout,
        pluginStore,
        entitlement,
        emit,
        props,
        displayColumns,
        gridRows,
        gridColumns,
        viewState,
        columnFiltersEnabled,
    } = deps

    const exportDialogOpen = ref(false)
    const exportSubmitting = ref(false)

    const exportEnabled = computed(() => pluginStore.isEnabled('p-grid-export'))
    const maskExportEnabled = computed(
        () =>
            import.meta.env.VITE_DATAWISE_EDITION !== 'standard'
            && pluginStore.isEnabled('p-export-mask'),
    )

    function resolveExportRows(): TableRow[] {
        if (columnFiltersEnabled.value && viewState.value) {
            return applyGridViewStateToRows(gridRows.value, gridColumns.value, viewState.value)
        }
        return gridRows.value
    }

    function openExportDialog() {
        if (!exportEnabled.value || !displayColumns.value.length) return
        exportDialogOpen.value = true
    }

    async function onExportConfirm(payload: {
        format: GridExportFormat
        mask?: GridExportOptions['mask']
        incomplete?: boolean
    }) {
        exportSubmitting.value = true
        try {
            const freeResolution = resolveFreeGridExportRows(resolveExportRows(), {
                mode: entitlement.mode,
                suiteId: entitlement.suiteId,
                isSecurityUsable: entitlement.isPackUsable('pack.security'),
            })
            if (freeResolution.capped) {
                entitlement.openPaywall('pack.security', 'export.rowCap')
                layout.showWarningToast(
                    t('dataGrid.exportFreeRowCap', {
                        limit: freeResolution.limit,
                        total: freeResolution.total,
                    }),
                )
            }
            const resolved = await downloadGridExport(
                displayColumns.value,
                freeResolution.rows,
                payload.format,
                props.exportBaseName,
                props.exportTableName,
                {
                    mask: payload.mask,
                    incomplete:
                        payload.incomplete === true
                        || props.truncatedAtCap === true
                        || freeResolution.capped,
                    watermarkFooter: entitlement.watermarkFooter,
                },
            )
            emit('exported', resolved.fileName, resolved.path)
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return
            layout.showWarningToast(t('dataGrid.exportDialog.exportFailed'))
        } finally {
            exportSubmitting.value = false
        }
    }

    return {
        exportDialogOpen,
        exportSubmitting,
        exportEnabled,
        maskExportEnabled,
        resolveExportRows,
        openExportDialog,
        onExportConfirm,
    }
}
