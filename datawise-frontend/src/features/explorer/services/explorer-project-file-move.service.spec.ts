import {describe, expect, it} from 'vitest'
import type {TreeNode} from '@/core/types'
import {
    canMoveProjectFileToFolder,
    injectProjectFileMoveSubmenu,
    isProjectSandboxMovableNode,
    listProjectFileMoveTargets,
    parseProjectFileMoveTargetMenuId,
    resolveProjectFileDropFolderId,
    resolveProjectFileReorderDrop,
    toProjectFileMoveTargetMenuId,
} from '@/features/explorer/services/explorer-project-file-move.service'
import {
    PROJECT_DOCS_ROOT_ID,
    PROJECT_SCRIPTS_ROOT_ID,
} from '@/features/project/services/project-explorer-files'

function file(id: string, label: string, type: TreeNode['type'] = 'project-file'): TreeNode {
    return {id, label, type}
}

function folder(id: string, label: string, children: TreeNode[] = []): TreeNode {
    return {
        id,
        label,
        type: id.includes(':scripts:') || id === PROJECT_SCRIPTS_ROOT_ID ? 'project-scripts' : 'project-docs',
        children,
        meta: 'lazy',
    }
}

describe('explorer-project-file-move.service', () => {
    const docsRoot = folder(PROJECT_DOCS_ROOT_ID, '项目文档', [
        file('project-file:p1:docs:a.md', 'a.md'),
        folder('project-file:p1:docs:notes', 'notes', [
            file('project-file:p1:docs:notes/b.md', 'b.md'),
            folder('project-file:p1:docs:notes/deep', 'deep', [
                file('project-file:p1:docs:notes/deep/c.md', 'c.md'),
            ]),
        ]),
    ])
    const scriptsRoot = folder(PROJECT_SCRIPTS_ROOT_ID, '项目脚本', [
        file('project-file:p1:scripts:q.sql', 'q.sql', 'sql_file'),
    ])
    const tree: TreeNode[] = [docsRoot, scriptsRoot]

    it('detects movable sandbox nodes', () => {
        expect(isProjectSandboxMovableNode(file('project-file:p1:docs:a.md', 'a.md'))).toBe(true)
        expect(isProjectSandboxMovableNode(folder(PROJECT_DOCS_ROOT_ID, '项目文档'))).toBe(false)
        expect(isProjectSandboxMovableNode(file('conn-1', 'c', 'connection'))).toBe(false)
    })

    it('lists move targets under the same root excluding current parent and self', () => {
        const targets = listProjectFileMoveTargets(
            tree,
            file('project-file:p1:docs:a.md', 'a.md'),
        )
        const ids = targets.map((t) => t.folderNodeId)
        expect(ids).toContain('project-file:p1:docs:notes')
        expect(ids).toContain('project-file:p1:docs:notes/deep')
        expect(ids).not.toContain(PROJECT_DOCS_ROOT_ID) // already under root
        expect(ids).not.toContain(PROJECT_SCRIPTS_ROOT_ID)
    })

    it('rejects move into self or descendant folder', () => {
        const notes = folder('project-file:p1:docs:notes', 'notes')
        const deep = folder('project-file:p1:docs:notes/deep', 'deep')
        expect(canMoveProjectFileToFolder(tree, notes, deep)).toBe(false)
        // deep currently lives under notes → can move up to docs root
        expect(canMoveProjectFileToFolder(tree, deep, docsRoot)).toBe(true)
    })

    it('rejects cross-root moves', () => {
        expect(
            canMoveProjectFileToFolder(
                tree,
                file('project-file:p1:docs:a.md', 'a.md'),
                scriptsRoot,
            ),
        ).toBe(false)
    })

    it('resolves folder middle as inside and file rows as sibling insert', () => {
        const dragged = file('project-file:p1:docs:a.md', 'a.md')
        const notes = folder('project-file:p1:docs:notes', 'notes')
        expect(
            resolveProjectFileReorderDrop(tree, dragged, notes, 50, 0, 100),
        ).toEqual({targetId: notes.id, position: 'inside'})
        expect(
            resolveProjectFileDropFolderId(tree, notes, 'inside'),
        ).toBe(notes.id)

        const deepFile = file('project-file:p1:docs:notes/b.md', 'b.md')
        const siblingDrop = resolveProjectFileReorderDrop(tree, dragged, deepFile, 20, 0, 100)
        expect(siblingDrop?.position).toBe('before')
        expect(resolveProjectFileDropFolderId(tree, deepFile, 'before')).toBe(
            'project-file:p1:docs:notes',
        )
    })

    it('builds menu ids and injects submenu after rename', () => {
        const folderId = 'project-file:p1:docs:notes'
        expect(parseProjectFileMoveTargetMenuId(toProjectFileMoveTargetMenuId(folderId))).toBe(
            folderId,
        )
        const items = injectProjectFileMoveSubmenu(
            [
                {id: 'rename-project-file', label: 'Rename'},
                {id: 'delete-project-file', label: 'Delete'},
            ],
            [{folderNodeId: folderId, label: 'notes', depth: 1}],
            '移动到',
        )
        expect(items.map((i) => i.id)).toEqual([
            'rename-project-file',
            'move-project-file',
            'delete-project-file',
        ])
        expect(items[1]?.children?.[0]?.id).toBe(toProjectFileMoveTargetMenuId(folderId))
    })
})
