import assert from 'node:assert/strict'

import {describe, it} from 'node:test'

import {
    commandNeedsParams,
    extractCommandParams,
    missingCommandParams,
    resolveCommandTemplate,
} from '@/features/ssh/services/ssh-command-params.service'

describe('ssh-command-params.service', () => {
    it('extracts unique parameter names', () => {
        const params = extractCommandParams('yarn logs -applicationId {{appId}} && echo {{appId}}')
        assert.deepEqual(params, ['appId'])
    })

    it('resolves template placeholders', () => {
        const resolved = resolveCommandTemplate(
            'yarn application -kill {{appId}}',
            {appId: 'application_123_456'},
        )
        assert.equal(resolved, 'yarn application -kill application_123_456')
    })

    it('detects missing params', () => {
        assert.equal(commandNeedsParams('yarn logs {{appId}}'), true)
        assert.equal(commandNeedsParams('yarn application -list'), false)
        assert.deepEqual(
            missingCommandParams('kill {{appId}}', {appId: ''}),
            ['appId'],
        )
    })
})
