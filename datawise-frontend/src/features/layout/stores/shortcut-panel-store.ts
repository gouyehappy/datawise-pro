import {defineStore} from 'pinia'
import {ref} from 'vue'
import type {ExportTask, ExplorerNodeInfo, SavedConsole, SqlLogEntry} from '@/core/types'
import {t} from '@/i18n'
import {workspacePanelApi} from '@/api'
import {retainFreeSqlHistoryEntries} from '@/features/workspace/services/sql-history-retention'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useNotificationStore} from '@/features/layout/stores/notification-store'
import {dispatchSlowQueryAlertIfNeeded} from '@/features/layout/services/app-alert.actions'
import {useEditorSettingsStore} from '@/features/settings/stores/editor-settings'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {resolveSharedConnectionRefs} from '@/features/team/services/team-shared-explorer.service'

const EMPTY_EXPLORER_INFO: ExplorerNodeInfo = {
    kind: 'empty',
    title: '',
    fields: [],
    listItems: [],
}

/** 右侧快捷栏数据：对象信息、SQL 日志、已保存控制台、导出任务 */
export const useShortcutPanelStore = defineStore('shortcut-panel', () => {
    const sqlLogs = ref<SqlLogEntry[]>([])
    const savedConsoles = ref<SavedConsole[]>([])
    const exportTasks = ref<ExportTask[]>([])
    const explorerInfo = ref<ExplorerNodeInfo>({...EMPTY_EXPLORER_INFO})
    const lastSyncedNodeId = ref<string | null>(null)
    const ready = ref(false)

    async function load() {
        const [logs, consoles, tasks] = await Promise.all([
            workspacePanelApi.fetchSqlLogs(),
            workspacePanelApi.fetchSavedConsoles(),
            workspacePanelApi.fetchExportTasks(),
        ])
        sqlLogs.value = retainFreeSqlHistoryEntries(logs)
        savedConsoles.value = consoles
        exportTasks.value = tasks
        ready.value = true
    }

    async function appendSqlLog(
        entry: Omit<SqlLogEntry, 'id'>,
        connectionId?: string,
        database?: string,
    ) {
        const saved = await workspacePanelApi.appendSqlLog(
            {...entry, database: database ?? entry.database},
            connectionId,
        )
        sqlLogs.value = retainFreeSqlHistoryEntries([saved, ...sqlLogs.value])
        void notifySlowQueryIfNeeded(saved, connectionId)
    }

    function resolveConnectionLabel(connectionId?: string): string | undefined {
        if (!connectionId) return undefined
        const explorer = useExplorerStore()
        const ref = resolveSharedConnectionRefs(explorer.tree, [connectionId])[0]
        return ref?.label
    }

    async function notifySlowQueryIfNeeded(saved: SqlLogEntry, connectionId?: string) {
        const appConfig = useAppConfigStore()
        const editorSettings = useEditorSettingsStore()
        const layout = useLayoutStore()
        const notifications = useNotificationStore()
        const prefs = appConfig.connectionHealthPreferences
        const thresholdMs = editorSettings.settings.slowQueryThresholdMs
        await dispatchSlowQueryAlertIfNeeded(
            saved,
            thresholdMs,
            prefs,
            {
                showToast: (message) => layout.showErrorToast(message),
                toastMessage: t('dashboard.slowQueryAlert', {
                    duration: saved.duration,
                    threshold: thresholdMs,
                }),
                pushNotification: (input) => notifications.push(input),
            },
            resolveConnectionLabel(connectionId),
        ).catch(() => {})
    }

    async function saveConsole(payload: {
        name: string
        connectionName: string
        sql: string
        folder?: string
        tags?: string[]
    }) {
        const saved = await workspacePanelApi.saveConsole(payload)
        const existing = savedConsoles.value.find((item) => item.id === saved.id)
        if (existing) {
            Object.assign(existing, saved)
            return existing.id
        }
        savedConsoles.value.unshift(saved)
        return saved.id
    }

    async function addExportTask(fileName: string, onComplete?: () => void) {
        const task = await workspacePanelApi.createExportTask(fileName, {clientCompleted: true})
        exportTasks.value.unshift(task)
        setTimeout(() => {
            void workspacePanelApi.fetchExportTasks().then((tasks) => {
                exportTasks.value = tasks
                onComplete?.()
            })
        }, 2000)
        return task
    }

    function syncExplorerInfo(info: ExplorerNodeInfo) {
        explorerInfo.value = {
            ...info,
            fields: [...info.fields],
            listItems: [...info.listItems],
        }
        lastSyncedNodeId.value = info.sourceNodeId ?? null
    }

    function clearExplorerInfo() {
        explorerInfo.value = {...EMPTY_EXPLORER_INFO}
        lastSyncedNodeId.value = null
    }

    return {
        sqlLogs,
        savedConsoles,
        exportTasks,
        explorerInfo,
        lastSyncedNodeId,
        ready,
        load,
        appendSqlLog,
        saveConsole,
        addExportTask,
        syncExplorerInfo,
        clearExplorerInfo,
    }
})
