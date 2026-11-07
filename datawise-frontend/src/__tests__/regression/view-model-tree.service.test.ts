import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    isViewModelStatusMeta,
    isViewModelDraftNode,
    viewModelStatusVariant,
    VIEW_MODEL_TREE_META,
} from '../../features/explorer/services/view-model-tree.service.ts'

describe('view-model-tree.service', () => {
    it('detects published and draft tree meta', () => {
        assert.equal(isViewModelStatusMeta(VIEW_MODEL_TREE_META.published), true)
        assert.equal(isViewModelStatusMeta(VIEW_MODEL_TREE_META.draft), true)
        assert.equal(isViewModelStatusMeta('varchar'), false)
    })

    it('maps tree meta to pill variants', () => {
        assert.equal(viewModelStatusVariant(VIEW_MODEL_TREE_META.published), 'success')
        assert.equal(viewModelStatusVariant(VIEW_MODEL_TREE_META.draft), 'warn')
    })

    it('detects draft view model nodes for open routing', () => {
        assert.equal(isViewModelDraftNode({type: 'view_model', meta: VIEW_MODEL_TREE_META.draft}), true)
        assert.equal(isViewModelDraftNode({type: 'view_model', meta: VIEW_MODEL_TREE_META.published}), false)
        assert.equal(isViewModelDraftNode({type: 'view_model'}), false)
    })
})
