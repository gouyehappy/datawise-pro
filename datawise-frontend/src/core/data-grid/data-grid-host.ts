/**
 * Host-typed DataGrid SPI bridge over `@datawise/data-grid`.
 *
 * Portable consumers use package `configureDataGridHost` / `useDataGridHost` directly.
 * This module keeps host `TableColumn` / `TableRow` + pack-aware entitlement for SQL
 * `DataGrid.vue`, and mirrors the same registration onto the package SPI so
 * `DwDataGrid` and legacy share one boot wiring.
 */
import {
    configureDataGridHost as configureFrameworkDataGridHost,
    useDataGridHost as useFrameworkDataGridHost,
    type DataGridHost as FrameworkDataGridHost,
    type DataGridPluginRenderContext,
} from '@datawise/data-grid'
import type {TableColumn, TableRow} from '@/core/types'
import type {DataGridExportEntitlementFace} from '@/core/data-grid/composables/useDataGridExport'

export type {
    DataGridHost as FrameworkDataGridHost,
    DataGridPluginRenderContext as FrameworkDataGridPluginRenderContext,
    DataGridExportEntitlementFace as FrameworkDataGridExportEntitlementFace,
    DataGridColumnMeta as FrameworkDataGridColumnMeta,
} from '@datawise/data-grid'

export type {DataGridPluginRenderContext}

export type DataGridHost = {
    showWarningToast: (message: string) => void
    showSuccessToast: (message: string) => void
    isPluginEnabled: (pluginId: string) => boolean
    applyPluginRenderGrid: (
        columns: TableColumn[],
        rows: TableRow[],
        context: DataGridPluginRenderContext,
        isEnabled: (pluginId: string) => boolean,
    ) => {columns: TableColumn[]; rows: TableRow[]}
    entitlement: DataGridExportEntitlementFace
}

const identityRender: DataGridHost['applyPluginRenderGrid'] = (columns, rows) => ({columns, rows})

const defaultHost: DataGridHost = {
    showWarningToast: () => undefined,
    showSuccessToast: () => undefined,
    isPluginEnabled: () => false,
    applyPluginRenderGrid: identityRender,
    entitlement: {
        mode: 'open',
        suiteId: null,
        watermarkFooter: null,
        isPackUsable: () => true,
        openPaywall: () => undefined,
    },
}

let host: DataGridHost = defaultHost

function toFrameworkHost(next: DataGridHost): FrameworkDataGridHost {
    return {
        showWarningToast: next.showWarningToast,
        showSuccessToast: next.showSuccessToast,
        isPluginEnabled: next.isPluginEnabled,
        applyPluginRenderGrid: (columns, rows, context, isEnabled) => {
            const out = next.applyPluginRenderGrid(
                columns as unknown as TableColumn[],
                rows as unknown as TableRow[],
                context,
                isEnabled,
            )
            return {
                columns: out.columns as unknown as typeof columns,
                rows: out.rows as unknown as typeof rows,
            }
        },
        entitlement: {
            mode: next.entitlement.mode === 'enforced' ? 'enforced' : 'open',
            suiteId: next.entitlement.suiteId ?? null,
            watermarkFooter: next.entitlement.watermarkFooter ?? null,
            isPackUsable: (packId) => next.entitlement.isPackUsable(packId ?? 'pack.security'),
            openPaywall: (packId, reason) =>
                next.entitlement.openPaywall(packId ?? 'pack.security', reason ?? 'export'),
        },
    }
}

/** Features registers layout/plugin/entitlement faces once at AppShell boot. */
export function configureDataGridHost(next: DataGridHost): void {
    host = next
    configureFrameworkDataGridHost(toFrameworkHost(next))
}

export function useDataGridHost(): DataGridHost {
    return host
}

/** Package SPI view (for portable grids / tests). */
export function useFrameworkDataGridHostBridge(): FrameworkDataGridHost {
    return useFrameworkDataGridHost()
}
