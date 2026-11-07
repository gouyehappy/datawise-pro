import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {API_PATHS} from '@/shared/api/http/paths'

describe('explorer redis API paths', () => {
    it('redisKey path does not embed query string', () => {
        const path = API_PATHS.explorer.redisKey('conn-1')
        assert.equal(path, '/api/explorer/connections/conn-1/redis/key')
        assert.equal(path.includes('?'), false)
    })
})

describe('getJson query merge', () => {
    it('appends extra params with ampersand when path already has query', () => {
        const path = '/api/foo?key=bar'
        const params = new URLSearchParams({database: '1'})
        const qs = params.toString()
        const url = `${path}${path.includes('?') ? '&' : '?'}${qs}`
        assert.equal(url, '/api/foo?key=bar&database=1')
    })
})
