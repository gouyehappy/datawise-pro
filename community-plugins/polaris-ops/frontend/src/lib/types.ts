export type Tab = 'overview' | 'configs' | 'services'

export type Ns = {
  name: string
  comment?: string
}

export type PolarisInfo = {
  host?: string
  baseUrl?: string
  authenticated?: boolean
  namespaceCount?: number
  readOnly?: boolean
}

export type ConfigRow = {
  name: string
  namespace: string
  group: string
  format?: string
}

export type ConfigDetail = ConfigRow & {
  content: string
  md5?: string
}

export type ConfigHistoryRow = {
  id?: string
  name?: string
  fileName?: string
  namespace?: string
  group?: string
  content?: string
  format?: string
  comment?: string
  releaseDescription?: string
  md5?: string
  type?: string
  status?: string
  ctime?: string | number
  mtime?: string | number
  createBy?: string
  modifyBy?: string
}

export function historyRowKey(row: ConfigHistoryRow, index = 0) {
  const stable = [row.id, row.md5, row.mtime, row.ctime]
    .map((v) => String(v ?? '').trim())
    .find((v) => v && v !== '<nil>' && v !== 'null')
  return stable || `idx-${index}`
}

export function historyRowTime(row: ConfigHistoryRow) {
  const raw = row.mtime ?? row.ctime
  if (raw == null || raw === '') return ''
  if (typeof raw === 'number') {
    const ms = raw > 1e12 ? raw : raw * 1000
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? String(raw) : d.toLocaleString()
  }
  return String(raw)
}

export type ServiceRow = {
  name: string
  namespace: string
}

export type InstanceRow = {
  host: string
  port: number | string
  healthy?: boolean
  weight?: number | string
  version?: string
  isolate?: boolean
}

export const CONFIG_FORMATS = [
  'text',
  'json',
  'xml',
  'yaml',
  'html',
  'properties',
  'toml',
] as const

/** Stable open-tab id: namespace@@group@@name */
export function openConfigId(row: Pick<ConfigRow, 'name' | 'group' | 'namespace'>, namespaceOverride?: string) {
  const ns = String(namespaceOverride ?? row.namespace ?? '')
  return `${ns || '__all'}@@${row.group || 'DEFAULT'}@@${row.name}`
}

export type OpenConfigTab = {
  id: string
  namespace: string
  detail: ConfigDetail
  draft: string
  draftFormat: string
  editing: boolean
  loading?: boolean
  /** Draft tab created via 「新建」, not yet published. */
  isNew?: boolean
}

export function isOpenTabDirty(tab: OpenConfigTab) {
  if (tab.loading) return false
  if (tab.isNew) {
    return Boolean(
      (tab.detail.name || '').trim() ||
        tab.draft ||
        (tab.detail.group || 'DEFAULT') !== 'DEFAULT' ||
        (tab.draftFormat || 'text') !== 'text',
    )
  }
  if (!tab.editing) return false
  return (
    tab.draft !== (tab.detail.content || '') ||
    tab.draftFormat !== (tab.detail.format || 'text')
  )
}

export function newDraftTabId() {
  return `new:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function suggestCopyDataId(name: string) {
  const base = (name || '').trim() || 'config'
  const m = base.match(/^(.*)(\.[^.]+)$/)
  if (m) return `${m[1]}-copy${m[2]}`
  return `${base}-copy`
}

export type CheckedConfig = {
  key: string
  namespaceId: string
  row: ConfigRow
}

export function serviceKey(row: Pick<ServiceRow, 'name' | 'namespace'>) {
  return `${row.namespace || '__all'}@@${row.name}`
}

export function errMessage(e: unknown) {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  if (e && typeof e === 'object') {
    const o = e as { message?: string; error?: { message?: string }; data?: { message?: string } }
    return o.message || o.error?.message || o.data?.message || JSON.stringify(e)
  }
  return String(e)
}
