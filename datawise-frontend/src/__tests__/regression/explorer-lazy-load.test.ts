import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {ApiError} from '@/shared/api/http/request'
import {
    isExplorerNodeNotFoundError,
    pruneConnectionHealthByIds,
    shouldAffirmConnectionHealthForCachedChildren,
} from '@/features/explorer/services/explorer-lazy-load'
import type {TreeNode} from '@/core/types'

describe('explorer-lazy-load', () => {
    it('detects EXPLORER_NODE_NOT_FOUND api errors', () => {
        assert.equal(isExplorerNodeNotFoundError(new ApiError('EXPLORER_NODE_NOT_FOUND')), true)
        assert.equal(
            isExplorerNodeNotFoundError(new ApiError(
                'Schema node not found; refresh Explorer and try again',
                {errorCode: 'EXPLORER_NODE_NOT_FOUND'},
            )),
            true,
        )
        assert.equal(isExplorerNodeNotFoundError(new Error('other')), false)
    })

    it('prunes connection health for removed connections only', () => {
        const pruned = pruneConnectionHealthByIds(
            {connA: 'ok', connB: 'error', connC: 'ok'},
            ['connA', 'connC'],
        )
        assert.deepEqual(pruned, {connA: 'ok', connC: 'ok'})
    })

    it('affirms health when user expands a connection with cached schema children', () => {
        const connection: Pick<TreeNode, 'type' | 'children'> = {
            type: 'connection',
            children: [{id: 'db1', label: 'admin_db', type: 'database'}],
        }
        assert.equal(
            shouldAffirmConnectionHealthForCachedChildren(connection, 'conn-1', 'conn-1', true),
            true,
        )
        assert.equal(
            shouldAffirmConnectionHealthForCachedChildren(connection, 'conn-1', 'conn-1', false),
            false,
        )
        assert.equal(
            shouldAffirmConnectionHealthForCachedChildren(
                {type: 'connection', children: []},
                'conn-1',
                'conn-1',
                true,
            ),
            false,
        )
    })
})
