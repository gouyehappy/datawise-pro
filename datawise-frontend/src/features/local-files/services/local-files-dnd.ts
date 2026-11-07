/** Drag MIME for inserting a local workspace path into the SQL editor (Alt+drop). */
export const LOCAL_FILE_PATH_MIME = 'application/x-datawise-local-path'

/** Absolute path — drop on workspace opens the file. */
export const LOCAL_FILE_ABS_PATH_MIME = 'application/x-datawise-local-abs-path'

/** Drag MIME for moving a node within the local files tree. */
export const LOCAL_FILE_TREE_MOVE_MIME = 'application/x-datawise-local-tree-move'

export function readLocalFilePathFromDataTransfer(data: DataTransfer | null | undefined): string | null {
    if (!data) return null
    const custom = data.getData(LOCAL_FILE_PATH_MIME)?.trim()
    if (custom) return custom
    // Fallback only when our MIME was advertised (avoid stealing plain-text drops).
    const types = Array.from(data.types ?? [])
    if (!types.includes(LOCAL_FILE_PATH_MIME)) return null
    return data.getData('text/plain')?.trim() || null
}

export function readLocalAbsPathFromDataTransfer(data: DataTransfer | null | undefined): string | null {
    if (!data) return null
    const custom = data.getData(LOCAL_FILE_ABS_PATH_MIME)?.trim()
    if (custom) return custom
    const types = Array.from(data.types ?? [])
    if (!types.includes(LOCAL_FILE_ABS_PATH_MIME)) return null
    // Prefer absolute tree-move payload when abs mime was advertised but empty.
    return data.getData(LOCAL_FILE_TREE_MOVE_MIME)?.trim() || null
}

export function dataTransferHasType(data: DataTransfer | null | undefined, mime: string): boolean {
    if (!data) return false
    return Array.from(data.types ?? []).includes(mime)
}

export function readLocalTreeMovePathFromDataTransfer(data: DataTransfer | null | undefined): string | null {
    if (!data) return null
    const custom = data.getData(LOCAL_FILE_TREE_MOVE_MIME)?.trim()
    if (custom) return custom
    const types = Array.from(data.types ?? [])
    if (!types.includes(LOCAL_FILE_TREE_MOVE_MIME)) return null
    return data.getData('text/plain')?.trim() || null
}

/** Whether `sourcePath` can be moved into `targetDirPath` (same workspace). */
export function canMoveLocalPathInto(
    sourcePath: string,
    targetDirPath: string,
    rootPath: string | null | undefined,
): boolean {
    const root = rootPath?.trim()
    if (!root) return false
    const sourceKey = normalizeKey(sourcePath)
    const targetKey = normalizeKey(targetDirPath)
    const rootKey = normalizeKey(root)
    if (!sourceKey || !targetKey || !rootKey) return false
    if (sourceKey === rootKey) return false
    if (targetKey !== rootKey && !targetKey.startsWith(`${rootKey}/`)) return false
    if (sourceKey !== rootKey && !sourceKey.startsWith(`${rootKey}/`)) return false
    // Into self or a descendant is invalid.
    if (targetKey === sourceKey || targetKey.startsWith(`${sourceKey}/`)) return false
    return true
}

function normalizeKey(path: string): string {
    return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}
