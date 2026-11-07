import {createHttpConfigApi} from '@/shared/api/http/config'
import type {AppConfigFile, AiPreferences, ExplorerPreferences, WindowPreferences, LocalFilesPreferences} from '@/shared/config/app-config.types'
import type {SqlEditorShortcutsLayer} from '@datawise/sql-editor/types'
import type {UpdatePreferences} from '@/shared/config/update-preferences.types'
import type {ConnectionsCatalog} from '@/shared/config/connections-catalog.types'

const http = createHttpConfigApi()

export const configApi = {
    fetchAppConfig: () => http.fetchAppConfig(),
    saveAppConfig: (config: AppConfigFile) => http.saveAppConfig(config),
    fetchAppConfigXml: () => http.fetchAppConfigXml(),
    saveAppConfigXml: (xml: string) => http.saveAppConfigXml(xml),
    fetchWorkspaceSession: () => http.fetchWorkspaceSession(),
    saveWorkspaceSession: (session: import('@/shared/config/app-config.types').WorkspaceSessionFile) =>
        http.saveWorkspaceSession(session),
    fetchAiPreferences: () => http.fetchAiPreferences(),
    saveAiPreferences: (prefs: AiPreferences) => http.saveAiPreferences(prefs),
    fetchExplorerUi: () => http.fetchExplorerUi(),
    saveExplorerUi: (prefs: ExplorerPreferences) => http.saveExplorerUi(prefs),
    fetchWindow: () => http.fetchWindow(),
    saveWindow: (prefs: WindowPreferences) => http.saveWindow(prefs),
    fetchLocalFiles: () => http.fetchLocalFiles(),
    saveLocalFiles: (prefs: LocalFilesPreferences) => http.saveLocalFiles(prefs),
    fetchSqlSnippets: (layer: 'shared' | 'personal') => http.fetchSqlSnippets(layer),
    saveSqlSnippets: (layer: 'shared' | 'personal', payload: SqlEditorShortcutsLayer) =>
        http.saveSqlSnippets(layer, payload),
    fetchUpdaterPreferences: () => http.fetchUpdaterPreferences(),
    saveUpdaterPreferences: (prefs: UpdatePreferences) => http.saveUpdaterPreferences(prefs),
    fetchConnectionsCatalog: () => http.fetchConnectionsCatalog(),
    saveConnectionsCatalog: (catalog: ConnectionsCatalog) => http.saveConnectionsCatalog(catalog),
    fetchConnectionsXml: () => http.fetchConnectionsXml(),
    saveConnectionsXml: (xml: string) => http.saveConnectionsXml(xml),
}
