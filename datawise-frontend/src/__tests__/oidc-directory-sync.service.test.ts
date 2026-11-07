import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    claimMapPreviewRows,
    directorySyncScopesIncomplete,
    parseClaimMap,
    withRecommendedDirectorySyncScopes,
} from '@/features/settings/services/oidc-directory-sync.service'

describe('oidc-directory-sync.service', () => {
    it('parses claim map lines', () => {
        const map = parseClaimMap('admins=tenant_admin\n# comment\nanalysts=analyst')
        assert.deepEqual(map, {admins: 'tenant_admin', analysts: 'analyst'})
    })

    it('flags missing groups scope when syncing roles', () => {
        assert.equal(directorySyncScopesIncomplete('openid profile email', 'groups'), true)
        assert.equal(directorySyncScopesIncomplete('openid profile email groups', 'groups'), false)
    })

    it('appends groups without duplicating', () => {
        assert.equal(
            withRecommendedDirectorySyncScopes('openid profile email', 'groups'),
            'openid profile email groups',
        )
        assert.equal(
            withRecommendedDirectorySyncScopes('openid profile email groups', 'groups'),
            'openid profile email groups',
        )
    })

    it('builds claim map preview rows', () => {
        assert.deepEqual(claimMapPreviewRows('a=b\nc=d'), [
            {from: 'a', to: 'b'},
            {from: 'c', to: 'd'},
        ])
    })
})
