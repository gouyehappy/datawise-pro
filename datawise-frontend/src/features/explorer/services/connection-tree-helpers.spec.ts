import {describe, expect, it} from 'vitest'
import type {TreeNode} from '@/core/types'
import {
    communityInvokeMessage,
    filterRenameProjectFileMenuItems,
    parseProjectFilesHintParentId,
    resolveConnectionLabel,
    resolveProjectFilesActionFolder,
    shouldOmitRenameProjectFileMenuItem,
} from '@/features/explorer/services/connection-tree-helpers'

describe('connection-tree-helpers', () => {
    it('resolveProjectFilesActionFolder maps hint to parent folder', () => {
        const folder: TreeNode = {
            id: 'folder-1',
            label: 'docs',
            type: 'project-file',
        }
        const hint: TreeNode = {
            id: 'project-files-hint:folder-1',
            label: 'hint',
            type: 'project-files-hint',
        }
        const findNode = (id: string) => (id === folder.id ? folder : undefined)
        expect(resolveProjectFilesActionFolder(hint, findNode)).toBe(folder)
        expect(resolveProjectFilesActionFolder(folder, findNode)).toBe(folder)
        expect(parseProjectFilesHintParentId(hint.id)).toBe('folder-1')
        expect(parseProjectFilesHintParentId('other')).toBe('')
    })

    it('resolveConnectionLabel reads explorer label', () => {
        const findNode = (id: string) =>
            id === 'c1' ? ({id: 'c1', label: 'Prod', type: 'connection'} as TreeNode) : undefined
        expect(resolveConnectionLabel(findNode, 'c1')).toBe('Prod')
        expect(resolveConnectionLabel(findNode, undefined)).toBeUndefined()
    })

    it('communityInvokeMessage prefers message/detail/status', () => {
        expect(communityInvokeMessage({message: ' ok '})).toBe(' ok ')
        expect(communityInvokeMessage({detail: 'd'})).toBe('d')
        expect(communityInvokeMessage({status: 's'})).toBe('s')
        expect(communityInvokeMessage({other: 1})).toBeNull()
        expect(communityInvokeMessage(null)).toBeNull()
    })

    it('shouldOmitRenameProjectFileMenuItem hides hints and virtual roots', () => {
        expect(shouldOmitRenameProjectFileMenuItem({
            id: 'project-files-hint:x',
            type: 'project-files-hint',
        })).toBe(true)
        expect(shouldOmitRenameProjectFileMenuItem({
            id: 'project-scripts',
            type: 'project-scripts',
        })).toBe(true)
        expect(shouldOmitRenameProjectFileMenuItem({
            id: 'project-file:docs/a.md',
            type: 'project-docs',
        })).toBe(false)
        const items = [
            {id: 'open', label: 'Open'},
            {id: 'rename-project-file', label: 'Rename'},
        ]
        expect(filterRenameProjectFileMenuItems(
            {id: 'project-files-hint:x', type: 'project-files-hint'},
            items,
        )).toEqual([{id: 'open', label: 'Open'}])
        expect(filterRenameProjectFileMenuItems(
            {id: 'project-file:a.md', type: 'project-docs'},
            items,
        )).toEqual(items)
    })
})
