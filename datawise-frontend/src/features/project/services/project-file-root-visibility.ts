import {PROJECT_FILE_ROOTS, type ProjectFileRoot} from '@/features/project/services/project-files-api'

/**
 * Explorer 项目文件根节点的显示开关。
 * <p>
 * 单独放在这里（而不是直接读 app-config-store），是为了避开
 * app-config-store → explorer store → project-explorer-files → app-config-store 的循环依赖。
 * app-config-store 在布局配置变化时同步进来；树重建时由 injectProjectFileRoots 读取。
 */
let visibleRoots: ProjectFileRoot[] = [...PROJECT_FILE_ROOTS]

export function setVisibleProjectFileRoots(
    next: ProjectFileRoot[] | {docs?: boolean; scripts?: boolean},
): void {
    if (Array.isArray(next)) {
        visibleRoots = PROJECT_FILE_ROOTS.filter((root) => next.includes(root))
        return
    }
    visibleRoots = PROJECT_FILE_ROOTS.filter((root) => next[root] !== false)
}

export function getVisibleProjectFileRoots(): ProjectFileRoot[] {
    return [...visibleRoots]
}
