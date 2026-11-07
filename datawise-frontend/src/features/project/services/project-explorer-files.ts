import type {TreeNode} from '@/core/types'
import {t} from '@/i18n'
import {useProjectStore} from '@/features/project/stores/project'
import {
    buildProjectFileNodeId,
    buildProjectFileUri,
    parseProjectFileUri,
    projectFilesApi,
    type ProjectFileRoot,
} from '@/features/project/services/project-files-api'
import {isLocalSqlFileName, localFileBaseName} from '@/features/local-files/services/local-files-path'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {nextScriptFileName} from '@/features/explorer/services/sql-script-naming'

export const PROJECT_DOCS_ROOT_ID = 'project-docs-root'
export const PROJECT_SCRIPTS_ROOT_ID = 'project-scripts-root'
export const PROJECT_FILES_HINT_PREFIX = 'project-files-hint:'
export const PROJECT_FILES_DRAFT_ID = 'project-files-draft'
export const GROUP_DRAFT_ID = 'explorer-group-draft'

export function projectFileNodeId(projectId: string, root: ProjectFileRoot, relativePath: string): string {
    return buildProjectFileNodeId(projectId, root, relativePath)
}

export function projectFilesRootNodeId(root: ProjectFileRoot): string {
    return root === 'docs' ? PROJECT_DOCS_ROOT_ID : PROJECT_SCRIPTS_ROOT_ID
}

/** Ancestor folder node ids that must be loaded before revealing a project file. */
export function listProjectFileAncestorFolderIds(uri: string): string[] {
    const parsed = parseProjectFileUri(uri)
    if (!parsed?.path?.trim()) return []
    const ids = [projectFilesRootNodeId(parsed.root)]
    const parts = parsed.path.replace(/\\/g, '/').split('/').filter(Boolean)
    let accum = ''
    for (let i = 0; i < parts.length - 1; i++) {
        accum = accum ? `${accum}/${parts[i]}` : parts[i]!
        ids.push(buildProjectFileNodeId(parsed.projectId, parsed.root, accum))
    }
    return ids
}

export function parseProjectFileNodeId(
    nodeId: string,
): {projectId: string; root: ProjectFileRoot; path: string} | null {
    if (!nodeId.startsWith('project-file:')) return null
    const rest = nodeId.slice('project-file:'.length)
    const first = rest.indexOf(':')
    if (first < 0) return null
    const second = rest.indexOf(':', first + 1)
    if (second < 0) return null
    const projectId = rest.slice(0, first)
    const rootRaw = rest.slice(first + 1, second)
    const path = rest.slice(second + 1)
    if (rootRaw !== 'docs' && rootRaw !== 'scripts') return null
    return {projectId, root: rootRaw, path}
}

export function isProjectFilesFolderNode(node: TreeNode | null | undefined): boolean {
    if (!node) return false
    return node.type === 'project-docs' || node.type === 'project-scripts'
}

export function isProjectFilesLeafNode(node: TreeNode | null | undefined): boolean {
    if (!node) return false
    return node.type === 'project-file' || (node.type === 'sql_file' && node.id.startsWith('project-file:'))
}

export function isProjectFilesHintNode(node: TreeNode | null | undefined): boolean {
    return Boolean(node && node.type === 'project-files-hint')
}

export function isProjectFilesDraftNode(node: TreeNode | null | undefined): boolean {
    return Boolean(node && (node.type === 'project-files-draft' || node.id === PROJECT_FILES_DRAFT_ID))
}

export function removeProjectFilesDraft(folder: TreeNode): void {
    if (!folder.children?.length) return
    folder.children = folder.children.filter((child) => !isProjectFilesDraftNode(child))
}

export function ensureProjectFilesEmptyHint(folder: TreeNode): void {
    if ((folder.children?.length ?? 0) > 0) return
    folder.children = [emptyHintNode(folder.id)]
}

function joinProjectRelativePath(parentPath: string, name: string): string {
    const base = parentPath.replace(/^\/+|\/+$/g, '').replace(/\\/g, '/')
    const leaf = name.replace(/^\/+|\/+$/g, '').replace(/\\/g, '/')
    return base ? `${base}/${leaf}` : leaf
}

function sanitizeProjectFileName(raw: string): string {
    return raw
        .trim()
        .replace(/[\\/]+/g, '-')
        .replace(/^\.+/, '')
}

function uniqueFileName(existing: string[], preferred: string): string {
    const names = new Set(existing.map((n) => n.toLowerCase()))
    if (!names.has(preferred.toLowerCase())) return preferred
    const dot = preferred.lastIndexOf('.')
    const stem = dot > 0 ? preferred.slice(0, dot) : preferred
    const ext = dot > 0 ? preferred.slice(dot) : ''
    let i = 2
    while (names.has(`${stem}-${i}${ext}`.toLowerCase())) i += 1
    return `${stem}-${i}${ext}`
}

export function resolveProjectFilesFolderContext(
    node: TreeNode,
): {projectId: string; root: ProjectFileRoot; folderPath: string; folderNodeId: string} | null {
    const projectStore = useProjectStore()
    const projectId = projectStore.activeProjectId?.trim()
    if (!projectId) return null

    let target = node
    if (isProjectFilesHintNode(node)) {
        const parentId = node.id.startsWith(PROJECT_FILES_HINT_PREFIX)
            ? node.id.slice(PROJECT_FILES_HINT_PREFIX.length)
            : ''
        const explorer = useExplorerStore()
        const parent = parentId ? explorer.findNode(parentId) : null
        if (!parent || !isProjectFilesFolderNode(parent)) return null
        target = parent
    }

    if (target.id === PROJECT_DOCS_ROOT_ID) {
        return {projectId, root: 'docs', folderPath: '', folderNodeId: target.id}
    }
    if (target.id === PROJECT_SCRIPTS_ROOT_ID) {
        return {projectId, root: 'scripts', folderPath: '', folderNodeId: target.id}
    }
    if (isProjectFilesFolderNode(target) && target.id.startsWith('project-file:')) {
        const parsed = parseProjectFileNodeId(target.id)
        if (!parsed) return null
        return {
            projectId: parsed.projectId,
            root: parsed.root,
            folderPath: parsed.path,
            folderNodeId: target.id,
        }
    }
    return null
}

function mapEntryToNode(
    projectId: string,
    root: ProjectFileRoot,
    entry: {name: string; path: string; directory: boolean},
): TreeNode {
    const id = projectFileNodeId(projectId, root, entry.path)
    if (entry.directory) {
        return {
            id,
            label: entry.name,
            type: root === 'docs' ? 'project-docs' : 'project-scripts',
            children: [],
            meta: 'lazy',
        }
    }
    return {
        id,
        label: entry.name,
        type: isLocalSqlFileName(entry.name) ? 'sql_file' : 'project-file',
    }
}

function emptyHintNode(folderNodeId: string): TreeNode {
    return {
        id: `${PROJECT_FILES_HINT_PREFIX}${folderNodeId}`,
        label: t('explorer.projectFiles.emptyHint'),
        type: 'project-files-hint',
    }
}

function resolveActiveProjectIdForTree(): string | null {
    const projectStore = useProjectStore()
    const live = projectStore.activeProjectId?.trim()
    if (live) return live
    // Cold start / session reset can briefly clear the Pinia id before load() finishes.
    // Keep docs/scripts roots visible using the last cached project id.
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem('dw-cli-active-project-id')?.trim() || null
}

export function injectProjectFileRoots(connectionRoots: TreeNode[]): TreeNode[] {
    const projectId = resolveActiveProjectIdForTree()
    if (!projectId) return connectionRoots
    const withoutProjectRoots = connectionRoots.filter(
        (n) => n.id !== PROJECT_DOCS_ROOT_ID && n.id !== PROJECT_SCRIPTS_ROOT_ID,
    )
    const docsRoot: TreeNode = {
        id: PROJECT_DOCS_ROOT_ID,
        label: t('explorer.projectDocs'),
        type: 'project-docs',
        children: [],
        meta: 'lazy',
    }
    const scriptsRoot: TreeNode = {
        id: PROJECT_SCRIPTS_ROOT_ID,
        label: t('explorer.projectScripts'),
        type: 'project-scripts',
        children: [],
        meta: 'lazy',
    }
    return [docsRoot, scriptsRoot, ...withoutProjectRoots]
}

export async function loadProjectFilesChildren(node: TreeNode): Promise<TreeNode[]> {
    const projectStore = useProjectStore()
    let projectId = projectStore.activeProjectId
    if (!projectId) return []

    let root: ProjectFileRoot
    let path = ''
    if (node.id === PROJECT_DOCS_ROOT_ID) {
        root = 'docs'
        path = ''
    } else if (node.id === PROJECT_SCRIPTS_ROOT_ID) {
        root = 'scripts'
        path = ''
    } else {
        const parsed = parseProjectFileNodeId(node.id)
        if (!parsed) return []
        projectId = parsed.projectId
        root = parsed.root
        path = parsed.path
    }

    const entries = await projectFilesApi.list(projectId, root, path)
    if (!entries.length) return [emptyHintNode(node.id)]
    return entries.map((entry) => mapEntryToNode(projectId, root, entry))
}

export async function refreshProjectFilesFolder(folderNodeId: string): Promise<void> {
    const explorer = useExplorerStore()
    const folder = explorer.findNode(folderNodeId)
    if (!folder || !isProjectFilesFolderNode(folder)) return
    folder.meta = 'lazy'
    folder.children = []
    folder.expanded = true
    await explorer.ensureChildrenLoaded(folderNodeId, {notify: false})
}

export async function createProjectTextFile(options: {
    folderNode: TreeNode
    fileName: string
    content?: string
}): Promise<{nodeId: string; uri: string; name: string} | null> {
    const ctx = resolveProjectFilesFolderContext(options.folderNode)
    if (!ctx) return null
    const name = sanitizeProjectFileName(options.fileName)
    if (!name) return null

    let existing: string[] = []
    try {
        const entries = await projectFilesApi.list(ctx.projectId, ctx.root, ctx.folderPath)
        existing = entries.filter((e) => !e.directory).map((e) => e.name)
    } catch {
        existing = []
    }
    const unique = uniqueFileName(existing, name)
    const path = joinProjectRelativePath(ctx.folderPath, unique)
    await projectFilesApi.write(ctx.projectId, {
        root: ctx.root,
        path,
        content: options.content ?? '',
    })
    await refreshProjectFilesFolder(ctx.folderNodeId)
    return {
        nodeId: projectFileNodeId(ctx.projectId, ctx.root, path),
        uri: buildProjectFileUri(ctx.projectId, ctx.root, path),
        name: unique,
    }
}

export async function createProjectSqlFile(
    folderNode: TreeNode,
): Promise<{nodeId: string; uri: string; name: string} | null> {
    const ctx = resolveProjectFilesFolderContext(folderNode)
    if (!ctx || ctx.root !== 'scripts') return null
    let existing: string[] = []
    try {
        const entries = await projectFilesApi.list(ctx.projectId, ctx.root, ctx.folderPath)
        existing = entries.filter((e) => !e.directory).map((e) => e.name)
    } catch {
        existing = []
    }
    const fileName = nextScriptFileName(existing.map((fileName) => ({fileName})))
    return createProjectTextFile({folderNode, fileName, content: ''})
}

export async function createProjectFolder(options: {
    folderNode: TreeNode
    folderName: string
}): Promise<string | null> {
    const ctx = resolveProjectFilesFolderContext(options.folderNode)
    if (!ctx) return null
    const name = sanitizeProjectFileName(options.folderName)
    if (!name) return null
    const path = joinProjectRelativePath(ctx.folderPath, name)
    await projectFilesApi.mkdir(ctx.projectId, ctx.root, path)
    await refreshProjectFilesFolder(ctx.folderNodeId)
    return projectFileNodeId(ctx.projectId, ctx.root, path)
}

export async function renameProjectFileNode(
    node: TreeNode,
    nextName: string,
): Promise<{nodeId: string; name: string; parentFolderId: string} | null> {
    const parsed = parseProjectFileNodeId(node.id)
    if (!parsed) return null
    const name = sanitizeProjectFileName(nextName)
    if (!name || /[/\\]/.test(name)) return null

    const {isLocalBinaryFileName} = await import('@/features/local-files/services/local-files-path')
    const isDir = node.type === 'project-docs' || node.type === 'project-scripts'
    if (!isDir && isLocalBinaryFileName(name)) {
        throw new Error('unsupported_file')
    }

    const slash = parsed.path.lastIndexOf('/')
    const parentPath = slash >= 0 ? parsed.path.slice(0, slash) : ''
    const toPath = joinProjectRelativePath(parentPath, name)
    if (toPath === parsed.path) {
        return {nodeId: node.id, name, parentFolderId: parentFolderNodeId(parsed)}
    }

    await projectFilesApi.rename(parsed.projectId, {
        root: parsed.root,
        fromPath: parsed.path,
        toPath,
    })
    const parentFolderId = parentFolderNodeId(parsed)
    await refreshProjectFilesFolder(parentFolderId)
    return {
        nodeId: projectFileNodeId(parsed.projectId, parsed.root, toPath),
        name,
        parentFolderId,
    }
}

function parentFolderNodeId(parsed: {
    projectId: string
    root: ProjectFileRoot
    path: string
}): string {
    const slash = parsed.path.lastIndexOf('/')
    if (slash < 0) {
        return parsed.root === 'docs' ? PROJECT_DOCS_ROOT_ID : PROJECT_SCRIPTS_ROOT_ID
    }
    return projectFileNodeId(parsed.projectId, parsed.root, parsed.path.slice(0, slash))
}

export async function openProjectFileNode(node: TreeNode): Promise<string | null> {
    if (isProjectFilesHintNode(node)) return null
    if (isProjectFilesFolderNode(node) && !node.id.startsWith('project-file:')) return null
    if (isProjectFilesFolderNode(node)) return null
    const parsed = parseProjectFileNodeId(node.id)
    if (!parsed) return null
    const layout = useLayoutStore()
    const workspace = useWorkspaceStore()
    try {
        const file = await projectFilesApi.read(parsed.projectId, parsed.root, parsed.path)
        const uri = buildProjectFileUri(parsed.projectId, parsed.root, parsed.path)
        const title = localFileBaseName(parsed.path) || node.label
        if (isLocalSqlFileName(parsed.path)) {
            return (
                (await workspace.openConsole({
                    sql: file.content,
                    sqlFile: uri,
                    title,
                    skipEnsureScriptFile: true,
                    explorerNodeId: node.id,
                })) ?? null
            )
        }
        return (
            (await workspace.openLocalTextTab({
                path: uri,
                content: file.content,
                title,
                explorerNodeId: node.id,
            })) ?? null
        )
    } catch {
        layout.showErrorToast(t('explorer.projectFileOpenFailed'))
        return null
    }
}

export {parseProjectFileUri}
