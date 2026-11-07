import {t} from '@/i18n'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {readLocalTextFile} from '@/features/local-files/services/local-files.service'
import {localFileBaseName} from '@/features/local-files/services/local-files-path'
import {resolveTabLocalPath} from '@/features/local-files/services/local-files-workspace-tabs'
import {
    isDiskBackedTabSnapshot,
    tabNeedsDiskContentHydration,
} from '@/features/workspace/utils/workspace-session'
import {
    isProjectFileUri,
    parseProjectFileUri,
    projectFilesApi,
} from '@/features/project/services/project-files-api'

const inflight = new Map<string, Promise<void>>()

async function readTabTextContent(path: string): Promise<string> {
    if (isProjectFileUri(path)) {
        const parsed = parseProjectFileUri(path)
        if (!parsed) throw new Error('invalid_project_uri')
        const file = await projectFilesApi.read(parsed.projectId, parsed.root, parsed.path)
        return file.content ?? ''
    }
    return readLocalTextFile(path)
}

function diskTabBufferLooksEmpty(tab: {sql?: string}): boolean {
    return !(tab.sql ?? '').trim()
}

/**
 * Load file body for a restored disk-backed tab (local-text / local SQL console).
 * Session snapshots only keep path metadata; content is filled on select / after boot when needed.
 * Project sandbox URIs (`dw-project://`) load via the projects API — not the desktop FS bridge.
 *
 * @param force Re-read even when saved* is already set (clean tabs only — callers must check dirty).
 */
export function hydrateDiskBackedTabIfNeeded(
    tabId: string,
    options?: {force?: boolean},
): Promise<void> {
    const existing = inflight.get(tabId)
    if (existing) return existing

    const task = (async () => {
        const workspace = useWorkspaceStore()
        const tab = workspace.tabs.find((item) => item.id === tabId)
        if (!tab || !isDiskBackedTabSnapshot(tab)) return
        const force = options?.force === true
        if (!force && !tabNeedsDiskContentHydration(tab)) return
        if (force && workspace.isTabDirty(tabId)) return

        const path = resolveTabLocalPath(tab)
        if (!path) return

        try {
            const content = await readTabTextContent(path)
            const latest = workspace.tabs.find((item) => item.id === tabId)
            if (!latest || !isDiskBackedTabSnapshot(latest)) return
            if (force && workspace.isTabDirty(tabId)) return
            if (!force && !tabNeedsDiskContentHydration(latest)) return
            if (latest.type === 'local-text') {
                latest.sql = content
                latest.savedContent = content
            } else if (latest.type === 'console') {
                latest.sql = content
                workspace.markConsoleTabSaved(tabId, content)
            }
        } catch (err) {
            // Do not write sql='' / saved* — that would clear hydration need and block retries.
            const layout = useLayoutStore()
            const message = err instanceof Error ? err.message : ''
            if (/too large/i.test(message)) {
                layout.showErrorToast(t('explorer.localFiles.fileTooLarge'))
            } else {
                layout.showErrorToast(
                    t('explorer.localFiles.readFailed') + ` (${localFileBaseName(path)})`,
                )
            }
        }
    })().finally(() => {
        inflight.delete(tabId)
    })

    inflight.set(tabId, task)
    return task
}

/**
 * On tab activate: finish pending hydrate, and soft-reload clean tabs that still look empty
 * (common after backend restart when Monaco wrote '' before the first successful read).
 */
export function softReloadDiskBackedTabOnActivate(tabId: string): Promise<void> {
    const workspace = useWorkspaceStore()
    const tab = workspace.tabs.find((item) => item.id === tabId)
    if (!tab || !isDiskBackedTabSnapshot(tab)) return Promise.resolve()
    if (workspace.isTabDirty(tabId)) {
        return hydrateDiskBackedTabIfNeeded(tabId)
    }
    if (tabNeedsDiskContentHydration(tab) || diskTabBufferLooksEmpty(tab)) {
        return hydrateDiskBackedTabIfNeeded(tabId, {force: true})
    }
    return hydrateDiskBackedTabIfNeeded(tabId)
}
