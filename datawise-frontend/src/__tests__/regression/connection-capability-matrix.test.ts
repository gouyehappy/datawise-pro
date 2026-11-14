import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import type {ContextMenuItem} from '@/core/types'
import {
    filterExplorerCapabilityMenuItems,
    getConnectionCapabilityProfile,
    isSpecializedSurface,
    supportsConnectionFeature,
} from '@/shared/capabilities/supports-connection-feature'
import {buildConnectionCapabilities} from '@/shared/capabilities/db-type-capabilities'

describe('connection capability matrix (T-CAP-1)', () => {
    it('marks mysql with diagram/VQB and without transactionalDdl', () => {
        assert.equal(supportsConnectionFeature({dbType: 'mysql'}, 'diagram'), true)
        assert.equal(supportsConnectionFeature({dbType: 'mysql'}, 'visualQueryBuilder'), true)
        assert.equal(supportsConnectionFeature({dbType: 'mysql'}, 'transactionalDdl'), false)
        assert.equal(isSpecializedSurface('mysql'), false)
    })

    it('marks postgresql transactionalDdl', () => {
        assert.equal(supportsConnectionFeature({dbType: 'postgresql'}, 'transactionalDdl'), true)
        assert.equal(getConnectionCapabilityProfile('opengauss').features.transactionalDdl, true)
    })

    it('hides ER and schema-compare menus for redis', () => {
        assert.equal(isSpecializedSurface('redis'), true)
        assert.equal(supportsConnectionFeature({dbType: 'redis'}, 'diagram'), false)
        const items: ContextMenuItem[] = [
            {id: 'schema-er', label: 'ER'},
            {id: 'schema-tables', label: 'Tables'},
            {id: 'schema-compare', label: 'Compare'},
            {id: 'open', label: 'Open'},
        ]
        const filtered = filterExplorerCapabilityMenuItems(items, 'redis')
        assert.deepEqual(filtered.map((i) => i.id), ['schema-tables', 'open'])
    })

    it('unknown dbType is conservative (no diagram)', () => {
        assert.equal(supportsConnectionFeature({dbType: 'totally-unknown'}, 'diagram'), false)
        assert.equal(supportsConnectionFeature({dbType: 'totally-unknown'}, 'metadataBrowse'), true)
    })

    it('enriches connection capability snapshot', () => {
        const mysql = buildConnectionCapabilities('mysql')
        assert.equal(mysql.visualQueryBuilder, true)
        assert.equal(mysql.diagram, true)
        assert.equal(mysql.transactionalDdl, false)
        const redis = buildConnectionCapabilities('redis')
        assert.equal(redis.visualQueryBuilder, false)
        assert.equal(redis.specializedSurface, true)
        assert.equal(redis.sqlExecute, false)
    })
})
