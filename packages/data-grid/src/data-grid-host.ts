/**
 * Official DataGrid Host SPI — framework-grade contract.
 * DataWise registers a concrete host at AppShell boot; third-party apps
 * can use the default open entitlement host or provide their own.
 */

export type DataGridPluginRenderContext = {
  connectionId?: string
  database?: string
}

export type DataGridExportEntitlementFace = {
  /** `enforced` mirrors DataWise pack gating; third-party apps usually stay `open`. */
  mode: 'open' | 'enforced'
  suiteId: string | null
  watermarkFooter: string | null
  /** Optional pack id for gated hosts; ignored when mode is `open`. */
  isPackUsable: (packId?: string) => boolean
  openPaywall: (packId?: string, reason?: string) => void
}

export type DataGridColumnMeta = {
  key: string
  title?: string
  dataType?: string
  hidden?: boolean
  /** Opaque host metadata (never OpenAPI-coupled in the package) */
  meta?: Record<string, unknown>
}

export type DataGridHost = {
  showWarningToast: (message: string) => void
  showSuccessToast: (message: string) => void
  isPluginEnabled: (pluginId: string) => boolean
  applyPluginRenderGrid: <C extends {key: string}, R>(
    columns: C[],
    rows: R[],
    context: DataGridPluginRenderContext,
    isEnabled: (pluginId: string) => boolean,
  ) => {columns: C[]; rows: R[]}
  entitlement: DataGridExportEntitlementFace
  formatCell?: (value: unknown, column: DataGridColumnMeta) => string
  saveExportBlob?: (blob: Blob, filename: string) => Promise<void>
  resolveColumnMeta?: (column: DataGridColumnMeta) => DataGridColumnMeta
}

const identityRender: DataGridHost['applyPluginRenderGrid'] = (columns, rows) => ({
  columns,
  rows,
})

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

/** Features register layout/plugin/entitlement faces once at app boot. */
export function configureDataGridHost(next: DataGridHost): void {
  host = next
}

export function useDataGridHost(): DataGridHost {
  return host
}

export function resetDataGridHostForTests(): void {
  host = defaultHost
}
