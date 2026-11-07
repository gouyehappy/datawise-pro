import {localFileRelativePath} from '@/features/local-files/services/local-files-workspace-tabs'
import {useLocalFilesStore} from '@/features/local-files/stores/local-files-store'

/** Prefer workspace-relative path with `/`; fall back to absolute. */
export function resolveLocalPathForInsert(absolutePath: string): string {
    const root = useLocalFilesStore().rootPath
    if (root) {
        const relative = localFileRelativePath(root, absolutePath)
        if (relative) return relative.replace(/\\/g, '/')
    }
    return absolutePath
}
