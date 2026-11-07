import {deleteJson, getJson, postJson, postMultipart, putJson} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'
import type {ConnectionConfig} from '@/core/types'

export interface CommunityPluginFormField {
  key: string
  label?: string
  type?: string
  binding?: string
  required?: boolean
  default?: string | number | boolean
  description?: string
  placeholder?: string
  options?: Array<{label?: string; value: string}>
  visible_when?: Record<string, unknown>
  required_when?: Record<string, unknown>
  picker?: Record<string, unknown>
}

export interface CommunityPluginInfo {
  manifest: {
    manifestVersion: number
    id: string
    name: string
    version: string
    publisher?: string
    description?: string
    permissions?: string[]
    contributions?: Array<Record<string, unknown>>
    [key: string]: unknown
  }
  compatibility: {
    compatible: boolean
    errors: string[]
    warnings: string[]
    target?: string
  }
  path?: string
}

export interface CommunityPluginInstallResponse {
  plugin: CommunityPluginInfo
  previousVersion?: string
  packageSha256: string
  signed: boolean
}

export interface CommunityPluginConnectionTestResult {
  success?: boolean
  ok?: boolean
  message?: string
  latencyMs?: number
  [key: string]: unknown
}

export interface CommunityPluginCatalogEntry {
  id: string
  name: string
  version: string
  publisher?: string
  description?: string
  packageUrl?: string
  status?: 'installed' | 'available' | string
  installable?: boolean
}

export interface CommunityPluginCatalog {
  id: string
  name: string
  source?: 'builtin' | 'repository' | string
  repositoryId?: string
  error?: string
  entries: CommunityPluginCatalogEntry[]
}

export interface CommunityPluginTrustKey {
  id: string
  label?: string
  publicKeyBase64: string
}

export interface CommunityPluginRepository {
  id: string
  name: string
  url: string
  enabled: boolean
}

export function createHttpCommunityPluginsApi() {
  return {
    list: () => getJson<CommunityPluginInfo[]>(API_PATHS.communityPlugins.list),
    get: (pluginId: string) => getJson<CommunityPluginInfo>(API_PATHS.communityPlugins.detail(pluginId)),
    installFromPath: (path: string, allowUnsigned = false) =>
      postJson<CommunityPluginInstallResponse>(API_PATHS.communityPlugins.install, {path, allowUnsigned}),
    installUpload: (file: File, allowUnsigned = false) => {
      const body = new FormData()
      body.append('file', file)
      body.append('allowUnsigned', String(allowUnsigned))
      return postMultipart<CommunityPluginInstallResponse>(API_PATHS.communityPlugins.installUpload, body)
    },
    installFromUrl: (url: string, allowUnsigned = false) =>
      postJson<CommunityPluginInstallResponse>(API_PATHS.communityPlugins.installUrl, {url, allowUnsigned}),
    catalogs: () => getJson<{catalogs: CommunityPluginCatalog[]}>(API_PATHS.communityPlugins.marketplaceCatalogs),
    installFromCatalog: (catalogId: string, pluginId: string) =>
      postJson<CommunityPluginInstallResponse>(API_PATHS.communityPlugins.marketplaceInstall, {catalogId, pluginId}),
    listTrustKeys: () => getJson<CommunityPluginTrustKey[]>(API_PATHS.communityPlugins.trustKeys),
    replaceTrustKeys: (keys: CommunityPluginTrustKey[]) =>
      putJson<CommunityPluginTrustKey[]>(API_PATHS.communityPlugins.trustKeys, keys),
    listRepositories: () => getJson<CommunityPluginRepository[]>(API_PATHS.communityPlugins.repositories),
    replaceRepositories: (repositories: CommunityPluginRepository[]) =>
      putJson<CommunityPluginRepository[]>(API_PATHS.communityPlugins.repositories, repositories),
    invoke: (pluginId: string, method: string, params?: Record<string, unknown>) =>
      postJson<unknown>(API_PATHS.communityPlugins.invoke(pluginId), {method, params}),
    notify: (pluginId: string, method: string, params?: Record<string, unknown>) =>
      postJson<{ok: boolean}>(API_PATHS.communityPlugins.notify(pluginId), {method, params}),
    activate: (pluginId: string) =>
      postJson<{pluginId: string; active: boolean}>(API_PATHS.communityPlugins.activate(pluginId), {}),
    stop: (pluginId: string) =>
      postJson<{pluginId: string; active: boolean}>(API_PATHS.communityPlugins.stop(pluginId), {}),
    storageGetAll: (pluginId: string) =>
      getJson<{values: Record<string, string>}>(
        API_PATHS.communityPlugins.storage(pluginId),
        undefined,
        {silent: true},
      ),
    storagePut: (pluginId: string, entries: Record<string, string | null>) =>
      putJson<{values: Record<string, string>}>(
        API_PATHS.communityPlugins.storage(pluginId),
        {entries},
        {silent: true},
      ),
    issueUiTicket: (pluginId: string) =>
      postJson<{ticket: string; expiresInSec: number}>(API_PATHS.communityPlugins.uiTicket(pluginId), {}),
    connect: (config: ConnectionConfig) =>
      postJson<unknown>(API_PATHS.communityPlugins.connectionConnect, config),
    disconnect: (config: ConnectionConfig) =>
      postJson<unknown>(API_PATHS.communityPlugins.connectionDisconnect, config),
    rollback: (pluginId: string) =>
      postJson<CommunityPluginInstallResponse>(API_PATHS.communityPlugins.rollback, {pluginId}),
    connectionAction: (connection: ConnectionConfig, actionId: string, actionParams?: Record<string, unknown>) =>
      postJson<unknown>(API_PATHS.communityPlugins.connectionAction, {connection, actionId, actionParams}),
    filesystemWrite: (pluginId: string, body: {providerId: string; uri: string; dataBase64?: string}) =>
      postJson<unknown>(API_PATHS.communityPlugins.filesystemWrite(pluginId), body),
    filesystemDelete: (pluginId: string, body: {providerId: string; uri: string}) =>
      postJson<unknown>(API_PATHS.communityPlugins.filesystemDelete(pluginId), body),
    uninstall: (pluginId: string) =>
      deleteJson<{pluginId: string; uninstalled: boolean}>(API_PATHS.communityPlugins.uninstall(pluginId)),
    testConnection: (config: ConnectionConfig) =>
      postJson<CommunityPluginConnectionTestResult>(API_PATHS.communityPlugins.connectionTest, config, {
        // Host-key confirmation can pause the dial for several minutes.
        timeoutMs: 6 * 60_000,
      }),
  }
}
