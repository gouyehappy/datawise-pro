import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    isConnectionProfilePackage,
    profileImportConnectionCount,
} from '@/features/explorer/services/import-connection-file.service'

describe('import-connection-file.service', () => {
    it('detects dwprofile packages by extension', () => {
        assert.equal(isConnectionProfilePackage(new File([], 'a.dwprofile')), true)
        assert.equal(isConnectionProfilePackage(new File([], 'a.DWPROFILE')), true)
        assert.equal(isConnectionProfilePackage(new File([], 'snapshot.json')), false)
    })

    it('reads connection count from import result', () => {
        assert.equal(profileImportConnectionCount({connections: 3}), 3)
        assert.equal(profileImportConnectionCount({}), 0)
    })
})
