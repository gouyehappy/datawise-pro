import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    isPlatformAiFeature,
    isPlatformGovernanceFeature,
} from '@/features/platform/services/platform-ai-feature'

describe('isPlatformAiFeature', () => {
    it('marks semantic / canvas / federated as AI platform features', () => {
        assert.equal(isPlatformAiFeature('semantic_metrics'), true)
        assert.equal(isPlatformAiFeature('analysis_canvas'), true)
        assert.equal(isPlatformAiFeature('federated_views'), true)
    })

    it('leaves ops catalog features ungated', () => {
        assert.equal(isPlatformAiFeature('schema_drift'), false)
        assert.equal(isPlatformAiFeature('data_quality'), false)
        assert.equal(isPlatformAiFeature('scheduled_tasks'), false)
    })
})

describe('isPlatformGovernanceFeature', () => {
    it('marks schema drift / data quality as governance features', () => {
        assert.equal(isPlatformGovernanceFeature('schema_drift'), true)
        assert.equal(isPlatformGovernanceFeature('data_quality'), true)
        assert.equal(isPlatformGovernanceFeature('scheduled_tasks'), false)
        assert.equal(isPlatformGovernanceFeature('semantic_metrics'), false)
    })
})
