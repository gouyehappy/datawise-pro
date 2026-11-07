import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {formatYarnStateFilter} from '@/features/explorer/services/yarn-applications.service'

describe('yarn-applications.service', () => {
    it('formats multi-state filter for YARN REST', () => {
        assert.equal(formatYarnStateFilter(['RUNNING', 'ACCEPTED']), 'RUNNING,ACCEPTED')
        assert.equal(formatYarnStateFilter([' running ', 'accepted']), 'RUNNING,ACCEPTED')
        assert.equal(formatYarnStateFilter([]), undefined)
        assert.equal(formatYarnStateFilter(['', '  ']), undefined)
    })
})
