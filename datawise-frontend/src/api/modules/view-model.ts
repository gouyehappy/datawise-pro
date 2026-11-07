import {api} from '@/shared/api'
import type {
    DeleteViewModelPayload,
    ListViewModelsPayload,
    ReadViewModelPayload,
    RenameViewModelPayload,
    SaveViewModelPayload,
} from '@/shared/api/types'
import type {TreeNode} from '@/core/types'
import {resolveExplorerSqlFileScope} from '@/features/explorer/services/explorer-database-scope'
import {findAncestorByType} from '@/core/utils/tree'

export {isViewModelSelectSql} from '@/features/explorer/services/view-model-sql'

export function resolveViewModelScope(tree: TreeNode[], nodeId: string) {
    return resolveExplorerSqlFileScope(tree, nodeId)
}

export function resolveViewsFolderScope(tree: TreeNode[], folderNodeId: string) {
    const schemaNode = findAncestorByType(tree, folderNodeId, 'schema')
    const databaseNode = findAncestorByType(tree, folderNodeId, 'database')
    const scopeNode = schemaNode ?? databaseNode
    if (!scopeNode) return null
    const connection = findAncestorByType(tree, scopeNode.id, 'connection')
    const instanceLabel =
        resolveExplorerSqlFileScope(tree, folderNodeId)?.instanceLabel ?? scopeNode.label
    return {
        connectionId: connection?.id,
        connectionLabel: connection?.label,
        scopeNode,
        instanceLabel,
        dbType: connection?.dbType,
    }
}

export const viewModelApi = {
    list: (payload: ListViewModelsPayload) => api.workspace.listViewModels(payload),

    save: (payload: SaveViewModelPayload) => api.workspace.saveViewModel(payload),

    saveDraft: (payload: SaveViewModelPayload) => api.workspace.saveViewModelDraft(payload),

    read: (payload: ReadViewModelPayload) => api.workspace.readViewModel(payload),

    rename: (payload: RenameViewModelPayload) => api.workspace.renameViewModel(payload),

    delete: (payload: DeleteViewModelPayload) => api.workspace.deleteViewModel(payload),
}
