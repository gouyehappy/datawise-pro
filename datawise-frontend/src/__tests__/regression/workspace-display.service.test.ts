import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    resolveWorkspaceAccent,
    resolveWorkspaceFolderName,
    resolveWorkspaceInitials,
    truncateWorkspacePath,
} from '@/features/layout/services/workspace-display.service'

describe('workspace-display.service', () => {
    it('derives stable initials and accent from path', () => {
        const path = 'E:\\workspaces\\datawise-cli'
        const name = resolveWorkspaceFolderName(path, 'Default')
        assert.equal(name, 'datawise-cli')
        assert.equal(resolveWorkspaceInitials(name), 'DC')
        assert.equal(resolveWorkspaceAccent(path).bg, resolveWorkspaceAccent(path).bg)
    })

    it('uses default label for default workspace', () => {
        assert.equal(resolveWorkspaceFolderName('C:\\Users\\me\\config', 'Default', true), 'Default')
    })

    it('keeps short paths intact', () => {
        assert.equal(truncateWorkspacePath('D:\\ws\\app'), 'D:\\ws\\app')
    })

    it('middle-truncates long windows paths', () => {
        const path = 'D:\\software\\very\\long\\nested\\workspace-folder'
        const out = truncateWorkspacePath(path, 28)
        assert.ok(out.startsWith('D:'))
        assert.ok(out.endsWith('workspace-folder'))
        assert.ok(out.includes('…'))
        assert.ok(out.length <= 28)
    })
})
