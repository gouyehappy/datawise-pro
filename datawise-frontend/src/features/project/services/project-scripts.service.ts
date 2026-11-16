import {nextScriptFileName} from '@/features/explorer/services/sql-script-naming'
import {useProjectStore} from '@/features/project/stores/project'
import {
    buildProjectFileUri,
    isProjectFileUri,
    isScriptsProjectFileRoot,
    parseProjectFileUri,
    projectFilesApi,
    type ProjectFileRoot,
} from '@/features/project/services/project-files-api'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {projectFilesRootNodeId} from '@/features/project/services/project-explorer-files'

/** Active project id when Project scope is ready; otherwise null. */
export function resolveActiveProjectIdForScripts(): string | null {
    const projectStore = useProjectStore()
    const id = projectStore.activeProjectId?.trim()
    return id || null
}

export async function listProjectScriptFileNames(projectId: string): Promise<string[]> {
    const entries = await projectFilesApi.list(projectId, 'scripts', '')
    return entries.filter((e) => !e.directory).map((e) => e.name)
}

export async function resolveNextProjectScriptFileName(projectId: string): Promise<string> {
    let names: string[] = []
    try {
        names = await listProjectScriptFileNames(projectId)
    } catch {
        names = []
    }
    return nextScriptFileName(names.map((fileName) => ({fileName})))
}

export async function createEmptyProjectScript(
    projectId: string,
    fileName: string,
): Promise<{uri: string; path: string}> {
    const path = fileName.replace(/^\/+/, '').replace(/\\/g, '/')
    await projectFilesApi.write(projectId, {
        root: 'scripts',
        path,
        content: '',
    })
    return {uri: buildProjectFileUri(projectId, 'scripts', path), path}
}

export async function writeProjectScriptContent(
    uriOrPath: string,
    content: string,
): Promise<{uri: string; path: string; projectId: string; root: ProjectFileRoot} | null> {
    const parsed = parseProjectFileUri(uriOrPath)
    if (!parsed || !isScriptsProjectFileRoot(parsed.root)) return null
    // 共享引用路径也要原样写回，才会落到归属账号的原目录而不是当前账号私有区。
    await projectFilesApi.write(parsed.projectId, {
        root: parsed.root,
        path: parsed.path,
        content,
    })
    return {uri: uriOrPath, path: parsed.path, projectId: parsed.projectId, root: parsed.root}
}

export function isProjectScriptUri(value: string | null | undefined): boolean {
    if (!value || !isProjectFileUri(value)) return false
    const parsed = parseProjectFileUri(value)
    return Boolean(parsed && isScriptsProjectFileRoot(parsed.root))
}

/** Soft-refresh the Explorer project scripts root after create/save. */
export async function refreshProjectScriptsExplorerRoot(
    fileRoot: ProjectFileRoot = 'scripts',
): Promise<void> {
    const explorer = useExplorerStore()
    const rootId = projectFilesRootNodeId(fileRoot)
    const root = explorer.findNode(rootId)
    if (!root) return
    root.meta = 'lazy'
    root.children = []
    if (root.expanded) {
        await explorer.expandAndLoad(rootId, {load: true, notify: false})
    }
}
