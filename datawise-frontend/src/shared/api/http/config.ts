import type {ConfigApi} from '@/shared/api/types'
import {buildApiUrl, buildSessionHeaders, getJson, putJson} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'
import type {AppConfigFile, WorkspaceSessionFile, AiPreferences, ExplorerPreferences, WindowPreferences, LocalFilesPreferences} from '@/shared/config/app-config.types'
import type {SqlEditorShortcutsLayer} from '@datawise/sql-editor/types'
import type {UpdatePreferences} from '@/shared/config/update-preferences.types'
import type {ConnectionsCatalog} from '@/shared/config/connections-catalog.types'
import type {ConnectionsCatalogDto} from '@/shared/api/generated'

async function putXml(path: string, xml: string): Promise<void> {
    const response = await fetch(buildApiUrl(path), {
        method: 'PUT',
        headers: {
            ...buildSessionHeaders(),
            'Content-Type': 'application/xml',
        },
        body: xml,
        credentials: 'include',
        signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok) {
        throw new Error(`Failed to upload XML config: ${response.status}`)
    }
    const payload = await response.json() as { code: number; msg: string }
    if (payload.code !== 0) {
        throw new Error(payload.msg || 'Failed to upload XML config')
    }
}

async function getXml(path: string): Promise<string> {
    const response = await fetch(buildApiUrl(path), {
        method: 'GET',
        headers: buildSessionHeaders(),
        credentials: 'include',
        signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok) {
        throw new Error(`Failed to fetch XML config: ${response.status}`)
    }
    return response.text()
}

const CONFIG_READ_OPTIONS = {silent: true} as const
/** 后台 debounce 写入失败时不弹 Toast（如退出后访客拦截 GUEST_NOT_ALLOWED）。 */
const CONFIG_WRITE_OPTIONS = {silent: true} as const

/**
 * OpenAPI ConnectionsCatalogDto omits projectId / sharedProjectIds present at runtime.
 * Keep the app catalog shape via a structural cast after typing the wire envelope.
 */
function mapConnectionsCatalog(wire: ConnectionsCatalogDto): ConnectionsCatalog {
    return wire as unknown as ConnectionsCatalog
}

export function createHttpConfigApi(): ConfigApi {
    return {
        fetchAppConfig: () => getJson<AppConfigFile | null>(API_PATHS.config.app, undefined, CONFIG_READ_OPTIONS),
        saveAppConfig: (config) => putJson<void>(API_PATHS.config.app, config, CONFIG_WRITE_OPTIONS),
        fetchAppConfigXml: () => getXml(API_PATHS.config.appXml),
        saveAppConfigXml: (xml) => putXml(API_PATHS.config.appXml, xml),
        fetchWorkspaceSession: () =>
            getJson<WorkspaceSessionFile | null>(
                API_PATHS.config.workspaceSession,
                undefined,
                CONFIG_READ_OPTIONS,
            ),
        saveWorkspaceSession: (session) =>
            putJson<void>(API_PATHS.config.workspaceSession, session, CONFIG_WRITE_OPTIONS),
        fetchAiPreferences: () =>
            getJson<AiPreferences | null>(API_PATHS.config.aiPreferences, undefined, CONFIG_READ_OPTIONS),
        saveAiPreferences: (prefs) =>
            putJson<void>(API_PATHS.config.aiPreferences, prefs, CONFIG_WRITE_OPTIONS),
        fetchExplorerUi: () =>
            getJson<ExplorerPreferences | null>(API_PATHS.config.explorerUi, undefined, CONFIG_READ_OPTIONS),
        saveExplorerUi: (prefs) =>
            putJson<void>(API_PATHS.config.explorerUi, prefs, CONFIG_WRITE_OPTIONS),
        fetchWindow: () =>
            getJson<WindowPreferences | null>(API_PATHS.config.window, undefined, CONFIG_READ_OPTIONS),
        saveWindow: (prefs) =>
            putJson<void>(API_PATHS.config.window, prefs, CONFIG_WRITE_OPTIONS),
        fetchLocalFiles: () =>
            getJson<LocalFilesPreferences | null>(API_PATHS.config.localFiles, undefined, CONFIG_READ_OPTIONS),
        saveLocalFiles: (prefs) =>
            putJson<void>(API_PATHS.config.localFiles, prefs, CONFIG_WRITE_OPTIONS),
        fetchSqlSnippets: (layer) =>
            getJson<SqlEditorShortcutsLayer | null>(
                API_PATHS.config.sqlSnippets(layer),
                undefined,
                CONFIG_READ_OPTIONS,
            ),
        saveSqlSnippets: (layer, payload) =>
            putJson<void>(API_PATHS.config.sqlSnippets(layer), payload, CONFIG_WRITE_OPTIONS),
        fetchUpdaterPreferences: () =>
            getJson<UpdatePreferences>(API_PATHS.config.updater, undefined, CONFIG_READ_OPTIONS),
        saveUpdaterPreferences: (prefs) =>
            putJson<void>(API_PATHS.config.updater, prefs, CONFIG_WRITE_OPTIONS),
        fetchConnectionsCatalog: async () =>
            mapConnectionsCatalog(
                await getJson<ConnectionsCatalogDto>(
                    API_PATHS.config.connections,
                    undefined,
                    CONFIG_READ_OPTIONS,
                ),
            ),
        saveConnectionsCatalog: (catalog) =>
            putJson<void>(API_PATHS.config.connections, catalog, CONFIG_WRITE_OPTIONS),
        fetchConnectionsXml: () => getXml(API_PATHS.config.connectionsXml),
        saveConnectionsXml: (xml) => putXml(API_PATHS.config.connectionsXml, xml),
    }
}
