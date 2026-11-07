import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    currentWorkspaceTabCounter,
    nextWorkspaceTabId,
    resetWorkspaceTabIdCounterForTests,
    workspaceTabIdPrefix,
} from '@/features/workspace/services/workspace-tab-id'

describe('workspace-tab-id', () => {
    it('increments ids with the given prefix', () => {
        resetWorkspaceTabIdCounterForTests()
        assert.equal(nextWorkspaceTabId('console'), 'console-1')
        assert.equal(currentWorkspaceTabCounter(), 1)
        assert.equal(nextWorkspaceTabId('console'), 'console-2')
        assert.equal(nextWorkspaceTabId('table'), 'table-3')
        assert.equal(currentWorkspaceTabCounter(), 3)
    })
})

describe('workspaceTabIdPrefix', () => {
    it('maps tab types to stable prefixes', () => {
        assert.equal(workspaceTabIdPrefix('console'), 'console')
        assert.equal(workspaceTabIdPrefix('table'), 'table')
        assert.equal(workspaceTabIdPrefix('redis-key'), 'redis')
        assert.equal(workspaceTabIdPrefix('view_model_lineage'), 'lineage')
        assert.equal(workspaceTabIdPrefix('data_catalog'), 'data-catalog')
        assert.equal(workspaceTabIdPrefix('nacos-services'), 'nacos-services')
        assert.equal(workspaceTabIdPrefix('polaris-configs'), 'polaris-configs')
        assert.equal(workspaceTabIdPrefix('k8s-pods'), 'k8s-pods')
        assert.equal(workspaceTabIdPrefix('k8s-exec'), 'k8s-exec')
        assert.equal(workspaceTabIdPrefix('local-text'), 'local-text')
        assert.equal(workspaceTabIdPrefix('view_model_editor'), 'vm-editor')
    })

    it('falls back for welcome only', () => {
        assert.equal(workspaceTabIdPrefix('welcome'), 'tab')
    })
})
