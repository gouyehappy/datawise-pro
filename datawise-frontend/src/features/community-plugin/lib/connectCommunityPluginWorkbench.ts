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

export type RestoredCommunityWorkbenchTab = {
  id: string
  type: string
  connectionId?: string
  pluginId?: string
  pluginHostContext?: Record<string, unknown>
}

/** Resolve connectionId/pluginId from tab fields or pluginHostContext (legacy snapshots). */
export function resolveCommunityWorkbenchIdentity(tab: {
  connectionId?: string
  pluginId?: string
  pluginHostContext?: Record<string, unknown>
}): {connectionId: string; pluginId: string} | null {
  const ctx = tab.pluginHostContext
  const fromConnection =
    ctx?.connection && typeof ctx.connection === 'object' && !Array.isArray(ctx.connection)
      ? String((ctx.connection as {id?: unknown}).id ?? '').trim()
      : ''
  const connectionId =
    tab.connectionId?.trim()
    || (typeof ctx?.connectionId === 'string' ? ctx.connectionId.trim() : '')
    || fromConnection
  const pluginId =
    tab.pluginId?.trim()
    || (typeof ctx?.pluginId === 'string' ? ctx.pluginId.trim() : '')
  if (!connectionId || !pluginId) return null
  return {connectionId, pluginId}
}

/**
 * Activate plugin sidecar and replay connection/connect for a catalog connection.
 * Used by session restore and by CommunityWorkbenchHost before issuing a UI ticket
 * so plugins that do not self-call host.reopenConnection (Nacos/Polaris/…) still work.
 */
export async function ensureCommunityPluginSidecarConnection(
  connectionId: string,
  pluginIdHint?: string,
): Promise<{
  pluginId: string
  connection: CommunityPluginWorkbenchConnection
}> {
  const trimmedId = connectionId.trim()
  if (!trimmedId) throw new Error('connectionId required')

  const explorerApi = createHttpExplorerApi()
  const pluginsApi = createHttpCommunityPluginsApi()
  // silent: workbench ensure is best-effort; a missing id must not toast the shell
  // (e.g. SSH monitor contribution opened without a catalog connection).
  const config = await explorerApi.fetchConnection(trimmedId, {silent: true})
  const pluginId = config.pluginId?.trim() || pluginIdHint?.trim() || ''
  if (!pluginId) throw new Error('pluginId missing on connection')

  await pluginsApi.activate(pluginId)
  await pluginsApi.connect(config)

  try {
    const {useExplorerStore} = await import('@/features/explorer/stores/explorer')
    useExplorerStore().markConnectionPooled(trimmedId)
  } catch {
    // Explorer store may be unavailable in unit tests / early boot.
  }

  return {
    pluginId,
    connection: {
      id: config.id || trimmedId,
      name: config.name,
      host: config.host,
      port: config.port,
      user: config.user,
    },
  }
}

/**
 * Replay activate+connect for community workbench tabs restored from workspace-session.
 * Without this, sidecars have no credentials and SSH/etc. loops on "Connection is not active".
 * Also rebuilds non-secret host context so the connect card shows name/host instead of raw ids.
 */
export async function reconnectRestoredCommunityWorkbenchTabs(
  tabs: readonly RestoredCommunityWorkbenchTab[],
  options?: {
    patchHostContext?: (tabId: string, context: Record<string, unknown>) => void
  },
): Promise<void> {
  const seen = new Set<string>()

  for (const tab of tabs) {
    if (tab.type !== 'community-workbench') continue
    const identity = resolveCommunityWorkbenchIdentity(tab)
    if (!identity) continue

    const {connectionId, pluginId} = identity
    const dedupeKey = `${pluginId}::${connectionId}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    try {
      const ensured = await ensureCommunityPluginSidecarConnection(connectionId, pluginId)
      const resolvedPluginId = ensured.pluginId

      for (const target of tabs) {
        if (target.type !== 'community-workbench') continue
        const targetIdentity = resolveCommunityWorkbenchIdentity(target)
        if (!targetIdentity || targetIdentity.connectionId !== connectionId) continue
        if (
          targetIdentity.pluginId
          && targetIdentity.pluginId !== pluginId
          && targetIdentity.pluginId !== resolvedPluginId
        ) {
          continue
        }
        const workbenchInstanceId =
          typeof target.pluginHostContext?.workbenchId === 'string'
            ? target.pluginHostContext.workbenchId.trim()
            : undefined
        options?.patchHostContext?.(
          target.id,
          buildCommunityPluginHostContext({
            pluginId: resolvedPluginId,
            connectionId,
            connection: ensured.connection,
            workbenchInstanceId: workbenchInstanceId || undefined,
          }),
        )
      }
    } catch (error) {
      console.warn(
        '[community-plugin] failed to reconnect restored workbench',
        {connectionId, pluginId, error},
      )
    }
  }
}

/**
 * Mutates community-workbench snapshots in place: activate+connect sidecars and
 * enrich pluginHostContext with non-secret connection summary before restoreSession.
 */
export async function prepareCommunityWorkbenchSnapshotsForRestore(
  tabs: Array<{
    type: string
    connectionId?: string
    pluginId?: string
    pluginHostContext?: Record<string, unknown>
  }>,
): Promise<void> {
  const community = tabs.filter(
    (tab) => tab.type === 'community-workbench' && resolveCommunityWorkbenchIdentity(tab),
  )
  if (!community.length) return

  const enrichedByConnection = new Map<string, Record<string, unknown>>()
  await reconnectRestoredCommunityWorkbenchTabs(
    community.map((tab, index) => {
      const identity = resolveCommunityWorkbenchIdentity(tab)!
      return {
        id: `pre-${index}`,
        type: tab.type,
        connectionId: identity.connectionId,
        pluginId: identity.pluginId,
        pluginHostContext: tab.pluginHostContext,
      }
    }),
    {
      patchHostContext: (_tabId, context) => {
        const connectionId =
          typeof context.connectionId === 'string' ? context.connectionId.trim() : ''
        if (connectionId) enrichedByConnection.set(connectionId, context)
      },
    },
  )

  for (const tab of community) {
    const identity = resolveCommunityWorkbenchIdentity(tab)
    if (!identity) continue
    const enriched = enrichedByConnection.get(identity.connectionId)
    if (!enriched) continue
    // Fill missing top-level ids so restoreSession + Host props stay consistent.
    if (!tab.connectionId?.trim()) tab.connectionId = identity.connectionId
    if (!tab.pluginId?.trim()) tab.pluginId = identity.pluginId
    const workbenchId =
      typeof tab.pluginHostContext?.workbenchId === 'string'
        ? tab.pluginHostContext.workbenchId
        : typeof enriched.workbenchId === 'string'
          ? enriched.workbenchId
          : undefined
    tab.pluginHostContext = {
      ...enriched,
      ...(workbenchId ? {workbenchId} : {}),
    }
  }
}
