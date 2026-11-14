import {API_PATHS} from '@/shared/api/http/paths'
import {getJson, postJson, putJson, type HttpRequestOptions} from '@/shared/api/http/request'

export type ProjectFileRoot = 'docs' | 'scripts'

export type ProjectFileEntryDto = {
    name: string
    path: string
    directory: boolean
    sizeBytes?: number | null
    updatedAt?: string | null
}

export type ProjectFileContentDto = {
    root: ProjectFileRoot
    path: string
    content: string
}

const PROJECT_FILE_PREFIX = 'dw-project://'

export function buildProjectFileUri(
    projectId: string,
    root: ProjectFileRoot,
    relativePath: string,
): string {
    const rel = relativePath.replace(/^\/+/, '').replace(/\\/g, '/')
    return `${PROJECT_FILE_PREFIX}${encodeURIComponent(projectId)}/${root}/${rel}`
}

export function parseProjectFileUri(
    uri: string,
): {projectId: string; root: ProjectFileRoot; path: string} | null {
    const trimmed = uri.trim()
    if (!trimmed.startsWith(PROJECT_FILE_PREFIX)) return null
    const rest = trimmed.slice(PROJECT_FILE_PREFIX.length)
    const slash = rest.indexOf('/')
    if (slash < 0) return null
    const projectId = decodeURIComponent(rest.slice(0, slash))
    const afterProject = rest.slice(slash + 1)
    const rootSlash = afterProject.indexOf('/')
    const rootRaw = rootSlash < 0 ? afterProject : afterProject.slice(0, rootSlash)
    const path = rootSlash < 0 ? '' : afterProject.slice(rootSlash + 1)
    if (rootRaw !== 'docs' && rootRaw !== 'scripts') return null
    if (!projectId) return null
    return {projectId, root: rootRaw, path}
}

export function isProjectFileUri(uri: string | null | undefined): boolean {
    return Boolean(uri && parseProjectFileUri(uri))
}

/** Explorer tree node id for a project sandbox file (`project-file:{id}:{root}:{path}`). */
export function buildProjectFileNodeId(
    projectId: string,
    root: ProjectFileRoot,
    relativePath: string,
): string {
    return `project-file:${projectId}:${root}:${relativePath.replace(/\\/g, '/')}`
}

/** Resolve tree node id from a `dw-project://` tab path (leaf file). */
export function resolveProjectFileNodeIdFromUri(uri: string | null | undefined): string | null {
    const parsed = parseProjectFileUri(uri ?? '')
    if (!parsed?.path?.trim()) return null
    return buildProjectFileNodeId(parsed.projectId, parsed.root, parsed.path)
}

export const projectFilesApi = {
    list: (projectId: string, root: ProjectFileRoot, path = '') =>
        getJson<ProjectFileEntryDto[]>(API_PATHS.projects.files(projectId), {root, path}),
    read: (
        projectId: string,
        root: ProjectFileRoot,
        path: string,
        options?: HttpRequestOptions,
    ) =>
        getJson<ProjectFileContentDto>(
            API_PATHS.projects.fileContent(projectId),
            {root, path},
            options,
        ),
    write: (projectId: string, body: ProjectFileContentDto) =>
        putJson<ProjectFileContentDto>(API_PATHS.projects.fileContent(projectId), body),
    mkdir: (projectId: string, root: ProjectFileRoot, path: string) =>
        postJson<ProjectFileEntryDto>(API_PATHS.projects.mkdir(projectId), {root, path}),
    rename: (
        projectId: string,
        body: {root: ProjectFileRoot; fromPath: string; toPath: string},
    ) => postJson<ProjectFileEntryDto>(API_PATHS.projects.rename(projectId), body),
    delete: (projectId: string, body: {root: ProjectFileRoot; path: string}) =>
        postJson<null>(API_PATHS.projects.delete(projectId), body),
}
