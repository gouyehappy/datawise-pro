import {API_PATHS} from '@/shared/api/http/paths'
import {getJson, postJson, putJson, type HttpRequestOptions} from '@/shared/api/http/request'

/**
 * 项目文件树只有两个根：私有 docs / 私有 scripts，内容按创建者账号隔离。
 * 团队共享不是独立根，而是把私有区里的某个目录共享出来；其它账号在对应根下
 * 看到一个 `@shared/u{ownerId}/{path}` 的引用节点。
 */
export type ProjectFileRoot = 'docs' | 'scripts'

export const PROJECT_FILE_ROOTS: ProjectFileRoot[] = ['docs', 'scripts']

export function isProjectFileRoot(value: string): value is ProjectFileRoot {
    return (PROJECT_FILE_ROOTS as string[]).includes(value)
}

export function isDocsProjectFileRoot(root: ProjectFileRoot): boolean {
    return root === 'docs'
}

export function isScriptsProjectFileRoot(root: ProjectFileRoot): boolean {
    return root === 'scripts'
}

/** 共享引用节点的虚拟路径前缀，与后端 ProjectFilesService.SHARED_REF_PREFIX 一致。 */
export const SHARED_REF_PREFIX = '@shared'
const SHARED_REF_PATTERN = /^@shared\/u(\d+)(?:\/(.*))?$/

export function isSharedRefPath(path: string): boolean {
    return SHARED_REF_PATTERN.test(path)
}

export function parseSharedRefPath(path: string): {ownerUserId: number; path: string} | null {
    const match = SHARED_REF_PATTERN.exec(path)
    if (!match) return null
    return {ownerUserId: Number(match[1]), path: match[2] ?? ''}
}

export function buildSharedRefPath(ownerUserId: number, relativePath: string): string {
    const rel = relativePath.replace(/^\/+/, '').replace(/\\/g, '/')
    return `${SHARED_REF_PREFIX}/u${ownerUserId}/${rel}`
}

export type ProjectFileEntryDto = {
    name: string
    path: string
    directory: boolean
    sizeBytes?: number | null
    updatedAt?: string | null
    /** 已共享给项目内其它账号，或本身是别人共享出来的引用 */
    shared?: boolean
    /** 引用节点的来源账号名 */
    sharedBy?: string | null
}

export type ProjectFileContentDto = {
    root: ProjectFileRoot
    path: string
    content: string
}

export type ProjectFileShareDto = {
    ownerUserId: number
    ownerUsername: string
    root: ProjectFileRoot
    path: string
    sharedAt: string
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
    if (!isProjectFileRoot(rootRaw)) return null
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
    /** 登录 / 切换项目后初始化两个空的私有目录骨架，失败不影响主流程。 */
    ensureRoots: (projectId: string) =>
        postJson<null>(API_PATHS.projects.fileRoots(projectId), {}, {
            background: true,
            silent: true,
        }),
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
    listShares: (projectId: string, options?: HttpRequestOptions) =>
        getJson<ProjectFileShareDto[]>(API_PATHS.projects.fileShares(projectId), undefined, options),
    share: (projectId: string, body: {root: ProjectFileRoot; path: string}) =>
        postJson<ProjectFileShareDto>(API_PATHS.projects.fileShares(projectId), body),
    unshare: (projectId: string, body: {root: ProjectFileRoot; path: string}) =>
        postJson<null>(API_PATHS.projects.fileUnshare(projectId), body),
}
