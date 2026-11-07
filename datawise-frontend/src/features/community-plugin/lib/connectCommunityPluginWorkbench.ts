import {createHttpCommunityPluginsApi} from '@/shared/api/http/community-plugins'
import {i18n} from '@/i18n'
import {
  resolveCommunityPluginLocalization,
  scopedCommunityPluginLocalization,
} from '@/features/community-plugin/lib/community-plugin-locale'
import {createHttpExplorerApi} from '@/shared/api/http/explorer'
import {createHttpConfigApi} from '@/shared/api/http/config'
import type {ConnectionConfig} from '@/core/types'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'

function randomWorkbenchId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `wb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** Saved community-plugin connections for a plugin id (from connections catalog). */
export async function listSavedPluginConnections(pluginId: string): Promise<ConnectionConfig[]> {
  const trimmed = pluginId.trim()
  if (!trimmed) return []
  try {
    const catalog = await createHttpConfigApi().fetchConnectionsCatalog()
    const rows = (catalog.connections || [])
      .map((entry) => entry.config)
      .filter((config): config is ConnectionConfig => Boolean(config?.id))
      .filter((config) => config.dbType === 'plugin' && (config.pluginId || '').trim() === trimmed)
    rows.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, undefined, {sensitivity: 'base'}))
    return rows
  } catch {
    return []
  }
}

export type CommunityPluginWorkbenchIntent = {
  action: string
  uri?: string
}

/**
 * Connect a community-plugin connection and open its workbench with host context.
 * Explorer JDBC connect cannot activate/sidecar-connect these connections.
 */
export async function connectAndOpenCommunityPluginWorkbench(
  connectionId: string,
  options?: {
    title?: string
    /** Neutral workbench intent (e.g. reveal-files). Plugins interpret this. */
    intent?: CommunityPluginWorkbenchIntent
    forceNew?: boolean
  },
): Promise<{ok: boolean; message?: string}> {
  const explorerApi = createHttpExplorerApi()
  const pluginsApi = createHttpCommunityPluginsApi()
  const workspace = useWorkspaceStore()

  const config = await explorerApi.fetchConnection(connectionId)
  const pluginId = config.pluginId?.trim()
  const providerId = config.pluginConnectionProvider?.trim()
  if (!pluginId || !providerId) {
    return {ok: false, message: 'pluginId / pluginConnectionProvider missing on connection'}
  }

  await pluginsApi.activate(pluginId)
  await pluginsApi.connect(config)

  const info = await pluginsApi.get(pluginId)
  const contributions = (info.manifest.contributions || []) as Array<{
    type?: string
    id?: string
    label?: string
    workbench?: string
  }>
  const provider = contributions.find((c) => c.type === 'connection-provider' && c.id === providerId)
  const workbenchId =
    provider?.workbench
    || contributions.find((c) => c.type === 'workbench')?.id
  if (!workbenchId) {
    return {ok: false, message: 'Plugin has no workbench contribution'}
  }
  const workbenchScoped = scopedCommunityPluginLocalization(
    resolveCommunityPluginLocalization(info.manifest, String(i18n.global.locale.value || '')),
    workbenchId,
  )
  const pluginTitle =
    workbenchScoped.label
    || contributions.find((c) => c.id === workbenchId)?.label
    || pluginId
  // Tab title follows the explorer connection name so the open tab matches the tree node.
  const workbenchLabel = (config.name || '').trim() || (options?.title || '').trim() || pluginTitle

  const connectionKey = config.id || connectionId
  const existing = options?.forceNew
    ? undefined
    : workspace.tabs.find((tab) =>
      tab.type === 'community-workbench'
      && tab.pluginId === pluginId
      && tab.connectionId === connectionKey,
    )
  const reusedWorkbenchId = existing?.pluginHostContext?.workbenchId
  const workbenchInstanceId =
    typeof reusedWorkbenchId === 'string' && reusedWorkbenchId.trim()
      ? reusedWorkbenchId
      : randomWorkbenchId()
  const connectionSummary = {
    id: config.id || connectionId,
    name: config.name,
    host: config.host,
    port: config.port,
    user: config.user,
  }
  const pluginHostContext = {
    ...buildCommunityPluginHostContext({
      pluginId,
      connectionId,
      connection: connectionSummary,
      workbenchInstanceId,
      intent: options?.intent,
    }),
  }
  workspace.openCommunityWorkbench(pluginId, workbenchId, workbenchLabel, {
    connectionId,
    connection: connectionSummary,
    workbenchInstanceId,
    pluginHostContext,
    forceNew: options?.forceNew === true,
  })
  return {ok: true}
}

export type CommunityPluginWorkbenchConnection = {
  id?: string
  name?: string
  host?: string
  port?: string | number
  /** Canonical DataWise field (same as ConnectionConfig.user). */
  user?: string
}

export function buildCommunityPluginHostContext(options: {
  pluginId: string
  connectionId?: string
  connection?: CommunityPluginWorkbenchConnection
  workbenchInstanceId?: string
  locale?: string
  intent?: CommunityPluginWorkbenchIntent
}): Record<string, unknown> {
  const connectionId = options.connectionId || options.connection?.id || ''
  const connectionName = options.connection?.name || ''
  return {
    connectionId,
    // DBX / Kite workbenches read top-level connectionName for cluster labels.
    connectionName,
    workbenchId: options.workbenchInstanceId || randomWorkbenchId(),
    locale: options.locale || 'zh-CN',
    connection: {
      id: connectionId,
      name: connectionName,
      host: options.connection?.host || '',
      port: options.connection?.port ?? '',
      user: options.connection?.user || '',
    },
    pluginId: options.pluginId,
    ...(options.intent ? {intent: options.intent} : {}),
  }
}

/** Whether a filesystem-provider should open via workbench (session-bound class). */
export function isSessionBoundFilesystemContribution(contribution: {
  sessionBound?: boolean
  openTarget?: string
  schemes?: string[]
}): boolean {
  if (contribution.sessionBound === true) return true
  if ((contribution.openTarget || '').toLowerCase() === 'workbench') return true
  return false
}
