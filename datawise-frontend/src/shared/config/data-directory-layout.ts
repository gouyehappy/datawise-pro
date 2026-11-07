/** 工作区根目录下固定子目录（相对路径不可单独配置） */
export const DATA_DIRECTORY_SUBDIRS = [
    {id: 'scripts', segment: 'scripts', labelKey: 'settings.basic.workspaceRoot.subdirs.scripts', hintKey: 'settings.basic.workspaceRoot.subdirs.scriptsHint'},
    {id: 'exports', segment: 'exports', labelKey: 'settings.basic.workspaceRoot.subdirs.exports', hintKey: 'settings.basic.workspaceRoot.subdirs.exportsHint'},
    {id: 'logs', segment: 'logs', labelKey: 'settings.basic.workspaceRoot.subdirs.logs', hintKey: 'settings.basic.workspaceRoot.subdirs.logsHint'},
    {id: 'plugins', segment: 'plugins', labelKey: 'settings.basic.workspaceRoot.subdirs.plugins', hintKey: 'settings.basic.workspaceRoot.subdirs.pluginsHint'},
    {id: 'drivers', segment: 'drivers', labelKey: 'settings.basic.workspaceRoot.subdirs.drivers', hintKey: 'settings.basic.workspaceRoot.subdirs.driversHint'},
    {id: 'cache', segment: 'cache', labelKey: 'settings.basic.workspaceRoot.subdirs.cache', hintKey: 'settings.basic.workspaceRoot.subdirs.cacheHint'},
] as const

export type DataDirectorySubdirId = (typeof DATA_DIRECTORY_SUBDIRS)[number]['id']

export interface ResolvedDataDirectoryLayout {
    root: string
    entries: Array<{
        id: DataDirectorySubdirId
        segment: string
        labelKey: string
        hintKey: string
        resolved: string
    }>
}

function joinRootSegment(root: string, segment: string): string {
    const trimmedRoot = root.replace(/[/\\]+$/, '')
    if (!trimmedRoot) return segment
    const separator = trimmedRoot.includes('\\') ? '\\' : '/'
    return `${trimmedRoot}${separator}${segment}`
}

/**
 * 由工作区根路径派生固定子目录。
 * 工作区即根目录：scripts / exports / logs / plugins / drivers / cache 一律挂在同一根下。
 */
export function resolveDataDirectoryLayout(root: string): ResolvedDataDirectoryLayout {
    return {
        root,
        entries: DATA_DIRECTORY_SUBDIRS.map((entry) => ({
            ...entry,
            resolved: joinRootSegment(root, entry.segment),
        })),
    }
}
