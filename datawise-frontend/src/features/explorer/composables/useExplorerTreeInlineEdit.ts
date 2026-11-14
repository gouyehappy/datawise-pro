import {ref, type Ref} from 'vue'
import type {ComposerTranslation} from 'vue-i18n'
import type {TreeNode} from '@/core/types'
import {resolveProjectFilesActionFolder as resolveProjectFilesActionFolderHelper} from '@/features/explorer/services/connection-tree-helpers'
import {resolveExplorerCatalogMessageKey} from '@/features/explorer/services/explorer-catalog-messages'
import {resolveExplorerSqlFileMessageKey} from '@/features/explorer/services/explorer-sql-file-messages'
import {resolveRenameSqlFilePlan} from '@/features/explorer/services/sql-script-naming'
import {resolveExplorerSqlFileScope} from '@/features/explorer/services/explorer-database-scope'
import {resolveConnectionCatalogErrorMessage} from '@/features/connection/services/connection-catalog.service'
import {canMutateConnectionCatalog} from '@/features/auth/services/feature-permission.service'
import {sqlFileNameFromTabLabel} from '@/features/workspace/services/console-tab-title'
import {instanceSqlApi} from '@/api'
import type {useExplorerStore} from '@/features/explorer/stores/explorer'
import type {useLayoutStore} from '@/features/layout/stores/layout'
import type {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import type {useAuthStore} from '@/features/auth/stores/auth-store'

export interface ExplorerTreeInlineEditDeps {
    t: ComposerTranslation
    explorer: ReturnType<typeof useExplorerStore>
    workspace: ReturnType<typeof useWorkspaceStore>
    layout: ReturnType<typeof useLayoutStore>
    auth: ReturnType<typeof useAuthStore>
    findConnectionId: (node: TreeNode) => string | undefined
    findConnectionLabel: (connectionId?: string) => string | undefined
    pendingGroupNode: Ref<TreeNode | null>
    pendingSqlFileNode: Ref<TreeNode | null>
}

export function useExplorerTreeInlineEdit(deps: ExplorerTreeInlineEditDeps) {
    const {
        t,
        explorer,
        workspace,
        layout,
        auth,
        findConnectionId,
        findConnectionLabel,
        pendingGroupNode,
        pendingSqlFileNode,
    } = deps
    
    const treeInline = ref<{
    kind:
        | 'create-project-file'
        | 'create-project-folder'
        | 'create-subgroup'
        | 'create-root-group'
        | 'rename-group'
        | 'rename-sql'
        | 'rename-project-file'
    nodeId: string
    value: string
    parentId?: string
    targetId?: string
    } | null>(null)
    const treeInlineCommitting = ref(false)
    const pendingProjectFilesFolder = ref<TreeNode | null>(null)
    
    function resolveProjectFilesActionFolder(node: TreeNode): TreeNode {
    return resolveProjectFilesActionFolderHelper(node, (id) => explorer.findNode(id))
}
    
    async function clearTreeInlineDraftNodes() {
    const {
        PROJECT_FILES_DRAFT_ID,
        GROUP_DRAFT_ID,
        removeProjectFilesDraft,
        ensureProjectFilesEmptyHint,
    } = await import('@/features/project/services/project-explorer-files')
    const {findParentNode} = await import('@/core/utils/tree')
    const projectDraftParent =
        pendingProjectFilesFolder.value
        ?? findParentNode(explorer.tree, PROJECT_FILES_DRAFT_ID)
    if (projectDraftParent) {
        const live = explorer.findNode(projectDraftParent.id) ?? projectDraftParent
        removeProjectFilesDraft(live)
        ensureProjectFilesEmptyHint(live)
    }
    pendingProjectFilesFolder.value = null
    
    const groupParent = findParentNode(explorer.tree, GROUP_DRAFT_ID)
    if (groupParent?.children) {
        groupParent.children = groupParent.children.filter((c) => c.id !== GROUP_DRAFT_ID)
        if (!groupParent.children.length) {
            groupParent.expanded = false
        }
    } else {
        const idx = explorer.tree.findIndex((n) => n.id === GROUP_DRAFT_ID)
        if (idx >= 0) explorer.tree.splice(idx, 1)
    }
    explorer.touchTree()
}
    
    async function cancelTreeInlineEdit() {
    if (!treeInline.value) return
    const kind = treeInline.value.kind
    treeInline.value = null
    if (
        kind === 'create-project-file'
        || kind === 'create-project-folder'
        || kind === 'create-subgroup'
        || kind === 'create-root-group'
    ) {
        await clearTreeInlineDraftNodes()
    }
}
    
    function onTreeInlineInput(value: string) {
    if (!treeInline.value) return
    treeInline.value = {...treeInline.value, value}
    const draft = explorer.findNode(treeInline.value.nodeId)
    if (draft && (draft.type === 'project-files-draft' || draft.type === 'group-draft')) {
        draft.label = value
    }
}
    
    async function beginProjectInlineCreate(node: TreeNode, mode: 'file' | 'folder') {
    const {
        PROJECT_FILES_DRAFT_ID,
        removeProjectFilesDraft,
        isProjectFilesHintNode,
        resolveProjectFilesFolderContext,
    } = await import('@/features/project/services/project-explorer-files')
    await cancelTreeInlineEdit()
    
    const folder = resolveProjectFilesActionFolder(node)
    if (!resolveProjectFilesFolderContext(folder)) {
        layout.showErrorToast(t('explorer.projectFiles.createFailed'))
        return
    }
    
    await explorer.expandAndLoad(folder.id, {load: true, notify: false})
    const live = explorer.findNode(folder.id)
    if (!live) return
    
    removeProjectFilesDraft(live)
    live.children = (live.children ?? []).filter((child) => !isProjectFilesHintNode(child))
    const defaultName =
        mode === 'file'
            ? t('explorer.projectFiles.fileDefault')
            : t('explorer.projectFiles.folderDefault')
    live.children = [
        {
            id: PROJECT_FILES_DRAFT_ID,
            label: defaultName,
            type: 'project-files-draft',
            meta: mode,
        },
        ...(live.children ?? []),
    ]
    live.expanded = true
    live.meta = 'loaded'
    pendingProjectFilesFolder.value = live
    treeInline.value = {
        kind: mode === 'file' ? 'create-project-file' : 'create-project-folder',
        nodeId: PROJECT_FILES_DRAFT_ID,
        value: defaultName,
        parentId: live.id,
    }
    explorer.touchTree()
    explorer.selectNode(PROJECT_FILES_DRAFT_ID)
}
    
    async function beginCreateRootGroup() {
    if (!canMutateConnectionCatalog(auth.isGuest)) {
        layout.showErrorToast(t(resolveExplorerCatalogMessageKey('permissionDenied')))
        return
    }
    await cancelTreeInlineEdit()
    const {GROUP_DRAFT_ID} = await import('@/features/project/services/project-explorer-files')
    const defaultName = t(resolveExplorerCatalogMessageKey('folderNameDefault'))
    const existing = explorer.tree.findIndex((n) => n.id === GROUP_DRAFT_ID)
    if (existing >= 0) explorer.tree.splice(existing, 1)
    explorer.tree.unshift({
        id: GROUP_DRAFT_ID,
        label: defaultName,
        type: 'group-draft',
    })
    treeInline.value = {
        kind: 'create-root-group',
        nodeId: GROUP_DRAFT_ID,
        value: defaultName,
    }
    explorer.touchTree()
    explorer.selectNode(GROUP_DRAFT_ID)
}
    
    async function beginCreateSubgroup(parent: TreeNode) {
    if (!canMutateConnectionCatalog(auth.isGuest)) {
        layout.showErrorToast(t(resolveExplorerCatalogMessageKey('permissionDenied')))
        return
    }
    await cancelTreeInlineEdit()
    const {GROUP_DRAFT_ID} = await import('@/features/project/services/project-explorer-files')
    const live = explorer.findNode(parent.id) ?? parent
    if (live.type !== 'group') return
    live.expanded = true
    const defaultName = t(resolveExplorerCatalogMessageKey('folderNameDefault'))
    live.children = [
        {
            id: GROUP_DRAFT_ID,
            label: defaultName,
            type: 'group-draft',
        },
        ...(live.children ?? []).filter((c) => c.id !== GROUP_DRAFT_ID),
    ]
    treeInline.value = {
        kind: 'create-subgroup',
        nodeId: GROUP_DRAFT_ID,
        value: defaultName,
        parentId: live.id,
    }
    pendingGroupNode.value = live
    explorer.touchTree()
    explorer.selectNode(GROUP_DRAFT_ID)
}
    
    async function beginRenameGroup(node: TreeNode) {
    if (!canMutateConnectionCatalog(auth.isGuest)) {
        layout.showErrorToast(t(resolveExplorerCatalogMessageKey('permissionDenied')))
        return
    }
    await cancelTreeInlineEdit()
    pendingGroupNode.value = node
    treeInline.value = {
        kind: 'rename-group',
        nodeId: node.id,
        value: node.label,
        targetId: node.id,
    }
}
    
    async function beginRenameSqlFile(node: TreeNode) {
    await cancelTreeInlineEdit()
    const {stripSqlExtension} = await import('@/features/explorer/services/sql-script-naming')
    pendingSqlFileNode.value = node
    treeInline.value = {
        kind: 'rename-sql',
        nodeId: node.id,
        value: stripSqlExtension(node.label),
        targetId: node.id,
    }
}
    
    async function beginRenameProjectFile(node: TreeNode) {
    if (node.type === 'project-files-hint' || !node.id.startsWith('project-file:')) return
    await cancelTreeInlineEdit()
    treeInline.value = {
        kind: 'rename-project-file',
        nodeId: node.id,
        value: node.label,
        targetId: node.id,
    }
}
    
    async function createProjectSqlFromMenu(node: TreeNode) {
    const folder = resolveProjectFilesActionFolder(node)
    try {
        const {createProjectSqlFile, openProjectFileNode} = await import(
            '@/features/project/services/project-explorer-files'
        )
        const created = await createProjectSqlFile(folder)
        if (!created) {
            layout.showErrorToast(t('explorer.projectFiles.createFailed'))
            return
        }
        const createdNode = explorer.findNode(created.nodeId)
        if (createdNode) {
            explorer.selectNode(created.nodeId)
            await openProjectFileNode(createdNode)
        }
    } catch {
        layout.showErrorToast(t('explorer.projectFiles.createFailed'))
    }
}
    
    async function commitTreeInlineEdit() {
    if (treeInlineCommitting.value || !treeInline.value) return
    treeInlineCommitting.value = true
    const session = treeInline.value
    const trimmed = session.value.trim()
    try {
        if (session.kind === 'create-project-file' || session.kind === 'create-project-folder') {
            const {
                createProjectTextFile,
                createProjectFolder,
                openProjectFileNode,
                removeProjectFilesDraft,
                ensureProjectFilesEmptyHint,
            } = await import('@/features/project/services/project-explorer-files')
            const {isLocalBinaryFileName} = await import(
                '@/features/local-files/services/local-files-path'
            )
            const folder = pendingProjectFilesFolder.value
            treeInline.value = null
            if (!folder) return
            removeProjectFilesDraft(folder)
            pendingProjectFilesFolder.value = null
            explorer.touchTree()
    
            if (!trimmed || /[/\\]/.test(trimmed)) {
                ensureProjectFilesEmptyHint(folder)
                explorer.touchTree()
                return
            }
            if (session.kind === 'create-project-folder') {
                const nodeId = await createProjectFolder({folderNode: folder, folderName: trimmed})
                if (!nodeId) {
                    layout.showErrorToast(t('explorer.projectFiles.createFailed'))
                    return
                }
                explorer.selectNode(nodeId)
                await explorer.toggleExpand(nodeId)
                return
            }
            const fileName = trimmed.includes('.') ? trimmed : `${trimmed}.txt`
            if (isLocalBinaryFileName(fileName)) {
                layout.showErrorToast(t('explorer.projectFiles.unsupportedType'))
                ensureProjectFilesEmptyHint(folder)
                explorer.touchTree()
                return
            }
            const created = await createProjectTextFile({
                folderNode: folder,
                fileName,
                content: '',
            })
            if (!created) {
                layout.showErrorToast(t('explorer.projectFiles.createFailed'))
                return
            }
            const createdNode = explorer.findNode(created.nodeId)
            if (createdNode) {
                explorer.selectNode(created.nodeId)
                await openProjectFileNode(createdNode)
            }
            return
        }
    
        if (session.kind === 'create-root-group' || session.kind === 'create-subgroup') {
            treeInline.value = null
            await clearTreeInlineDraftNodes()
            if (!trimmed) return
            try {
                if (session.kind === 'create-root-group') {
                    await explorer.addRootFolder(trimmed)
                } else {
                    const parentId = session.parentId
                    if (!parentId) return
                    await explorer.addGroup(trimmed, parentId)
                }
            } catch (error) {
                layout.showErrorToast(resolveConnectionCatalogErrorMessage(error, t, 'save'))
            }
            return
        }
    
        if (session.kind === 'rename-group') {
            const node = pendingGroupNode.value
            treeInline.value = null
            pendingGroupNode.value = null
            if (!node || node.type !== 'group' || !trimmed || trimmed === node.label) return
            try {
                await explorer.renameGroup(node.id, trimmed)
            } catch (error) {
                layout.showErrorToast(resolveConnectionCatalogErrorMessage(error, t, 'save'))
            }
            return
        }
    
        if (session.kind === 'rename-sql') {
            const node = pendingSqlFileNode.value
            treeInline.value = null
            pendingSqlFileNode.value = null
            if (!node || node.type !== 'sql_file') return
            if (!trimmed) return
            const plan = resolveRenameSqlFilePlan(sqlFileNameFromTabLabel(trimmed), node.label)
            if (!plan.ok) {
                if (plan.reason === 'invalid-name') {
                    layout.showErrorToast(t(resolveExplorerSqlFileMessageKey('invalidName')))
                }
                return
            }
            const connectionId = findConnectionId(node)
            const scope = resolveExplorerSqlFileScope(explorer.tree, node.id)
            if (!connectionId || !scope) {
                layout.showErrorToast(t(resolveExplorerSqlFileMessageKey('renameFailed')))
                return
            }
            try {
                const result = await instanceSqlApi.rename({
                    connectionId,
                    instanceName: scope.instanceLabel,
                    oldFileName: node.label,
                    newFileName: plan.newBaseName,
                })
                await explorer.reloadWorkspacesFolder(
                    connectionId,
                    scope.instanceLabel,
                    scope.scopeNode.id,
                )
                workspace.updateConsoleSqlFile({
                    connectionId,
                    instanceId: scope.scopeNode.id,
                    oldFileName: node.label,
                    newFileName: result.fileName,
                    connectionName: findConnectionLabel(connectionId),
                })
            } catch {
                layout.showErrorToast(t(resolveExplorerSqlFileMessageKey('renameFailed')))
            }
            return
        }
    
        if (session.kind === 'rename-project-file') {
            const targetId = session.targetId
            treeInline.value = null
            if (!targetId || !trimmed) return
            const node = explorer.findNode(targetId)
            if (!node) return
            if (trimmed === node.label) return
            try {
                const {renameProjectFileNode} = await import(
                    '@/features/project/services/project-explorer-files'
                )
                const result = await renameProjectFileNode(node, trimmed)
                if (!result) {
                    layout.showErrorToast(t('explorer.projectFiles.renameFailed'))
                    return
                }
                explorer.selectNode(result.nodeId)
            } catch (err) {
                if (err instanceof Error && err.message === 'unsupported_file') {
                    layout.showErrorToast(t('explorer.projectFiles.unsupportedType'))
                } else {
                    layout.showErrorToast(t('explorer.projectFiles.renameFailed'))
                }
            }
        }
    } catch {
        layout.showErrorToast(t('explorer.projectFiles.createFailed'))
    } finally {
        treeInlineCommitting.value = false
    }
}
    
    async function refreshProjectFilesFromMenu(node: TreeNode) {
    const folder = resolveProjectFilesActionFolder(node)
    const {refreshProjectFilesFolder} = await import(
        '@/features/project/services/project-explorer-files'
    )
    try {
        await refreshProjectFilesFolder(folder.id)
    } catch {
        layout.showErrorToast(t('explorer.projectFiles.createFailed'))
    }
}
    
    return {
        treeInline,
        treeInlineCommitting,
        pendingProjectFilesFolder,
        clearTreeInlineDraftNodes,
        cancelTreeInlineEdit,
        onTreeInlineInput,
        beginProjectInlineCreate,
        beginCreateRootGroup,
        beginCreateSubgroup,
        beginRenameGroup,
        beginRenameSqlFile,
        beginRenameProjectFile,
        createProjectSqlFromMenu,
        commitTreeInlineEdit,
        refreshProjectFilesFromMenu,
        resolveProjectFilesActionFolder,
    }
}
