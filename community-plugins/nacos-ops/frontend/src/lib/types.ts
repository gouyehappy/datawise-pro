export type Tab = 'overview' | 'configs' | 'services'

export type Ns = {
  id: string
  name: string
  desc?: string
  configCount?: number | string
}

export type NacosInfo = {
  host?: string
  baseUrl?: string
  authenticated?: boolean
  namespaceCount?: number
  v3Api?: boolean
  readOnly?: boolean
  implementation?: string
  versionMode?: string
  defaultNamespace?: string
}

export type ConfigRow = {
  dataId: string
  group: string
  tenant?: string
  type?: string
  appName?: string
  md5?: string
}

export type ConfigDetail = ConfigRow & {
  content: string
}

export type ConfigHistoryRow = {
  id?: string
  nid?: string
  dataId?: string
  group?: string
  content?: string
  md5?: string
  type?: string
  srcUser?: string
  opType?: string
  createdTime?: string
  lastModifiedTime?: string
}

export function historyRowKey(row: ConfigHistoryRow, index = 0) {
  const stable = [row.nid, row.id, row.md5, row.lastModifiedTime, row.createdTime]
    .map((v) => String(v ?? '').trim())
    .find((v) => v && v !== '<nil>' && v !== 'null')
  return stable || `idx-${index}`
}

export function historyRowTime(row: ConfigHistoryRow) {
  return String(row.lastModifiedTime || row.createdTime || '')
}

export type ServiceRow = {
  name: string
  groupName: string
  clusterCount?: number | string
}

export type InstanceRow = {
  ip: string
  port: number | string
  healthy?: boolean
  weight?: number | string
  clusterName?: string
  enabled?: boolean
  serviceName?: string
}

export const CONFIG_TYPES = [
  'text',
  'json',
  'xml',
  'yaml',
  'html',
  'properties',
  'toml',
] as const

/** Stable open-tab id across namespaces. */
export function openConfigId(
  row: Pick<ConfigRow, 'dataId' | 'group' | 'tenant'>,
  namespaceId?: string,
) {
  const ns = String(namespaceId ?? row.tenant ?? '')
  return `${ns || '__public'}@@${row.group || 'DEFAULT_GROUP'}@@${row.dataId}`
}

export type OpenConfigTab = {
  id: string
  namespaceId: string
  detail: ConfigDetail
  draft: string
  draftType: string
  editing: boolean
  loading?: boolean
  /** Draft tab created via 「新建」, not yet published. */
  isNew?: boolean
}

export function isOpenTabDirty(tab: OpenConfigTab) {
  if (tab.loading) return false
  if (tab.isNew) {
    return Boolean(
      (tab.detail.dataId || '').trim() ||
        tab.draft ||
        (tab.detail.group || 'DEFAULT_GROUP') !== 'DEFAULT_GROUP' ||
        (tab.draftType || 'text') !== 'text',
    )
  }
  if (!tab.editing) return false
  return (
    tab.draft !== (tab.detail.content || '') ||
    tab.draftType !== (tab.detail.type || 'text')
  )
}

export function newDraftTabId() {
  return `new:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function suggestCopyDataId(dataId: string) {
  const name = (dataId || '').trim() || 'config'
  const m = name.match(/^(.*)(\.[^.]+)$/)
  if (m) return `${m[1]}-copy${m[2]}`
  return `${name}-copy`
}

export type CheckedConfig = {
  key: string
  namespaceId: string
  row: ConfigRow
}

export function serviceKey(row: Pick<ServiceRow, 'name' | 'groupName'>) {
  return `${row.groupName || 'DEFAULT_GROUP'}@@${row.name}`
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
