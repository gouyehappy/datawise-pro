import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {resolveDataDirectoryLayout} from '@/shared/config/data-directory-layout'

describe('resolveDataDirectoryLayout', () => {
    it('derives all fixed subfolders from the workspace root', () => {
        const layout = resolveDataDirectoryLayout('C:\\DataWise\\workspaces')

        assert.equal(layout.root, 'C:\\DataWise\\workspaces')
        assert.equal(layout.entries.find((entry) => entry.id === 'scripts')?.resolved, 'C:\\DataWise\\workspaces\\scripts')
        assert.equal(layout.entries.find((entry) => entry.id === 'exports')?.resolved, 'C:\\DataWise\\workspaces\\exports')
        assert.equal(layout.entries.find((entry) => entry.id === 'logs')?.resolved, 'C:\\DataWise\\workspaces\\logs')
        assert.equal(layout.entries.find((entry) => entry.id === 'plugins')?.resolved, 'C:\\DataWise\\workspaces\\plugins')
        assert.equal(layout.entries.find((entry) => entry.id === 'drivers')?.resolved, 'C:\\DataWise\\workspaces\\drivers')
        assert.equal(layout.entries.find((entry) => entry.id === 'cache')?.resolved, 'C:\\DataWise\\workspaces\\cache')
    })

    it('uses forward slashes when the root uses them', () => {
        const layout = resolveDataDirectoryLayout('/data/workspace')

        assert.equal(layout.entries.find((entry) => entry.id === 'scripts')?.resolved, '/data/workspace/scripts')
    })
})
