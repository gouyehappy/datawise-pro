import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    deploymentModeLabelKey,
    sortDeploymentChecks,
    summarizeDeploymentProfile,
} from '@/features/settings/services/deployment-profile.service'
import type {DeploymentProfileSnapshot} from '@/shared/api/types'

describe('deployment-profile.service', () => {
    it('maps mode labels', () => {
        assert.match(deploymentModeLabelKey('desktop'), /modeDesktop/)
        assert.match(deploymentModeLabelKey('server'), /modeServer/)
    })

    it('sorts warns first', () => {
        const sorted = sortDeploymentChecks([
            {id: 'a', currentValue: 'x', recommendedValue: 'y', status: 'ok'},
            {id: 'b', currentValue: 'x', recommendedValue: 'y', status: 'warn'},
            {id: 'c', currentValue: 'x', recommendedValue: 'y', status: 'info'},
        ])
        assert.deepEqual(sorted.map((c) => c.id), ['b', 'c', 'a'])
    })

    it('summarizes profile', () => {
        const profile: DeploymentProfileSnapshot = {
            activeProfiles: ['dev'],
            mode: 'dev',
            checks: [],
            okCount: 1,
            warnCount: 2,
            infoCount: 3,
            pythonSimulated: true,
        }
        assert.deepEqual(summarizeDeploymentProfile(profile), {
            warnCount: 2,
            pythonSimulated: true,
        })
    })
})
