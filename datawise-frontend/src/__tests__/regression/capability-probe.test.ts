import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    isSpecializedCapabilityLive,
    specializedCapabilityReason,
    type CapabilityProbeResult,
} from '@/shared/capabilities/capability-probe'

function probe(partial: Partial<CapabilityProbeResult> & Pick<CapabilityProbeResult, 'capabilities'>): CapabilityProbeResult {
    return {
        dbType: 'kafka',
        connectionId: 'c1',
        probedAt: 1,
        ...partial,
    }
}

describe('T-SPEC-1 capability probe live gate', () => {
    it('treats missing probe as live (non-blocking)', () => {
        assert.equal(isSpecializedCapabilityLive(null, 'surface'), true)
    })

    it('blocks unsupported and error', () => {
        assert.equal(
            isSpecializedCapabilityLive(probe({capabilities: {surface: 'error'}}), 'surface'),
            false,
        )
        assert.equal(
            isSpecializedCapabilityLive(probe({capabilities: {helm: 'unsupported'}}), 'helm'),
            false,
        )
    })

    it('allows unknown and supported', () => {
        assert.equal(
            isSpecializedCapabilityLive(probe({capabilities: {mutate: 'unknown'}}), 'mutate'),
            true,
        )
        assert.equal(
            isSpecializedCapabilityLive(probe({capabilities: {browse: 'supported'}}), 'browse'),
            true,
        )
    })

    it('returns reason only when blocked', () => {
        const failed = probe({
            capabilities: {surface: 'error'},
            reasons: {surface: 'down'},
        })
        assert.equal(specializedCapabilityReason(failed, 'surface'), 'down')
        assert.equal(
            specializedCapabilityReason(probe({capabilities: {surface: 'supported'}}), 'surface'),
            undefined,
        )
    })

    it('non-specialized dbType is not live', () => {
        assert.equal(
            isSpecializedCapabilityLive(
                probe({dbType: 'mysql', capabilities: {surface: 'supported'}}),
                'surface',
            ),
            false,
        )
    })
})
