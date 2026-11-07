import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {createDefaultConnection} from '@/features/connection/utils/connection-defaults'

describe('connection redis defaults', () => {
    it('createDefaultConnection leaves redis username empty and auth none', () => {
        const config = createDefaultConnection('redis')
        assert.equal(config.user, '')
        assert.equal(config.auth, 'NONE')
    })
})
