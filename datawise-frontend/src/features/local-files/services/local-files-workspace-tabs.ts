import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {
    isLocalAbsolutePath,
    localFileBaseName,
    localFileNodeId,
    normalizeLocalPathKey,
} from '@/features/local-files/services/local-files-path'
import {isProjectFileUri} from '@/features/project/services/project-files-api'

function isHydratableTabPath(path: string | null | undefined): boolean {
    const value = path?.trim()
    if (!value) return false
    return isLocalAbsolutePath(value) || isProjectFileUri(value)
}

function tabLocalPath(tab: {
    type?: string
    localFilePath?: string | null
    sqlFile?: string | null
}): string | null {
    if (tab.type === 'local-text') {
        const path = tab.localFilePath?.trim()
        return path && isHydratableTabPath(path) ? path : null
    }
    if (tab.type === 'console' && isHydratableTabPath(tab.sqlFile)) {
        return tab.sqlFile!.trim()
    }
    return null
}

function pathMatchesDeleted(path: string, deletedPath: string, isDirectory: boolean): boolean {
    const key = normalizeLocalPathKey(path)
    const deletedKey = normalizeLocalPathKey(deletedPath)
    if (key === deletedKey) return true
    return isDirectory && key.startsWith(`${deletedKey}/`)
}

export function resolveTabLocalPath(tab: {
    type?: string
    localFilePath?: string | null
    sqlFile?: string | null
}): string | null {
    return tabLocalPath(tab)
}

/** Dirty editor tabs bound to a local absolute path. */
export function listDirtyLocalWorkspaceTabs() {
    const workspace = useWorkspaceStore()
    return workspace.tabs.filter((tab) => {
        if (!workspace.isTabDirty(tab.id)) return false
        return Boolean(tabLocalPath(tab))
    })
}

/** Normalized path keys for dirty local-file / local-sql tabs (tree dirty dots). */
export function dirtyLocalPathKeys(): Set<string> {
    const keys = new Set<string>()
    for (const tab of listDirtyLocalWorkspaceTabs()) {
        const path = tabLocalPath(tab)
        if (path) keys.add(normalizeLocalPathKey(path))
    }
    return keys
}

export function localFileRelativePath(rootPath: string, absolutePath: string): string | null {
    const rootKey = normalizeLocalPathKey(rootPath)
    const key = normalizeLocalPathKey(absolutePath)
    if (key === rootKey) return localFileBaseName(absolutePath)
    if (!key.startsWith(`${rootKey}/`)) return null
    return absolutePath.slice(rootPath.length).replace(/^[/\\]+/, '').replace(/\\/g, '/')
}

/** Close editor tabs bound to a deleted local file or anything under a deleted folder. */
export function closeWorkspaceTabsForLocalPath(deletedPath: string, isDirectory: boolean) {
    const workspace = useWorkspaceStore()
    const toClose = workspace.tabs
        .filter((tab) => {
            const path = tabLocalPath(tab)
            return path ? pathMatchesDeleted(path, deletedPath, isDirectory) : false
        })
        .map((tab) => tab.id)

    for (const id of toClose) {
        workspace.closeTab(id)
    }
}

/** Keep open tabs in sync after a local file/folder rename. */
export function remapWorkspaceTabsForLocalRename(oldPath: string, newPath: string) {
    const workspace = useWorkspaceStore()
    const oldKey = normalizeLocalPathKey(oldPath)
    const newKey = normalizeLocalPathKey(newPath)
    if (!oldKey || oldKey === newKey) return

    const sep = newPath.includes('\\') && !newPath.includes('/') ? '\\' : '/'

    for (const tab of workspace.tabs) {
        const path = tabLocalPath(tab)
        if (!path) continue
        const key = normalizeLocalPathKey(path)
        let nextPath: string | null = null
        if (key === oldKey) {
            nextPath = newPath
        } else if (key.startsWith(`${oldKey}/`)) {
            const relative = key.slice(oldKey.length + 1)
            nextPath = `${newPath.replace(/[/\\]+$/, '')}${sep}${relative.split('/').join(sep)}`
        }
        if (!nextPath) continue

        if (tab.type === 'local-text') {
            tab.localFilePath = nextPath
            tab.title = localFileBaseName(nextPath)
            tab.explorerNodeId = localFileNodeId(nextPath)
        } else if (tab.type === 'console') {
            tab.sqlFile = nextPath
            tab.title = localFileBaseName(nextPath)
            tab.explorerNodeId = localFileNodeId(nextPath)
        }
    }
}
