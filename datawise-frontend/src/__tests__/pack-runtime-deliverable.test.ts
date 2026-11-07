import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {isPackRuntimeDeliverable} from '@/features/pack/services/pack-runtime-deliverable'

describe('pack-runtime-deliverable', () => {
    it('marks capability packs undeliverable only in standard builds', () => {
        const standard = import.meta.env?.VITE_DATAWISE_EDITION === 'standard'
        assert.equal(isPackRuntimeDeliverable('pack.ai'), !standard)
        assert.equal(isPackRuntimeDeliverable('pack.migration'), !standard)
        // Connector packs stay deliverable in Standard (JDBC plugins still load).
        assert.equal(isPackRuntimeDeliverable('pack.connector.enterprise'), true)
    })
})
