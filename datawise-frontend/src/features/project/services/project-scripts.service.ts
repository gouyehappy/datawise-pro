import {nextScriptFileName} from '@/features/explorer/services/sql-script-naming'
import {useProjectStore} from '@/features/project/stores/project'
import {
    buildProjectFileUri,
    isProjectFileUri,
    parseProjectFileUri,
    projectFilesApi,
} from '@/features/project/services/project-files-api'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {PROJECT_SCRIPTS_ROOT_ID} from '@/features/project/services/project-explorer-files'

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
): Promise<{uri: string; path: string; projectId: string} | null> {
    const parsed = parseProjectFileUri(uriOrPath)
    if (!parsed || parsed.root !== 'scripts') return null
    await projectFilesApi.write(parsed.projectId, {
        root: 'scripts',
        path: parsed.path,
        content,
    })
    return {uri: uriOrPath, path: parsed.path, projectId: parsed.projectId}
}

export function isProjectScriptUri(value: string | null | undefined): boolean {
    if (!value || !isProjectFileUri(value)) return false
    const parsed = parseProjectFileUri(value)
    return parsed?.root === 'scripts'
}

/** Soft-refresh Explorer project scripts root after create/save. */
export async function refreshProjectScriptsExplorerRoot(): Promise<void> {
    const explorer = useExplorerStore()
    const root = explorer.findNode(PROJECT_SCRIPTS_ROOT_ID)
    if (!root) return
    root.meta = 'lazy'
    root.children = []
    if (root.expanded) {
        await explorer.expandAndLoad(PROJECT_SCRIPTS_ROOT_ID, {load: true, notify: false})
    }
}
