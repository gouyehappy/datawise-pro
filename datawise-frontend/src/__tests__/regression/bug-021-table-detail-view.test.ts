import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {API_PATHS} from '@/shared/api/http/paths.ts'

describe('table detail API paths', () => {
    it('builds properties and ddl endpoints with connection context', () => {
        const options = {connectionId: 'conn-1', database: 'admin_db'}
        assert.equal(
            API_PATHS.tableProperties('cdp_tag_layer', options),
            '/api/tables/cdp_tag_layer/properties?connectionId=conn-1&database=admin_db',
        )
        assert.equal(
            API_PATHS.tableDdl('cdp_tag_layer', options),
            '/api/tables/cdp_tag_layer/ddl?connectionId=conn-1&database=admin_db',
        )
    })

    it('adds kind=view for database view metadata', () => {
        const options = {connectionId: 'conn-1', database: 'admin_db', kind: 'view' as const}
        assert.equal(
            API_PATHS.tableProperties('active_users', options),
            '/api/tables/active_users/properties?connectionId=conn-1&database=admin_db&kind=view',
        )
        assert.equal(
            API_PATHS.tableDdl('active_users', options),
            '/api/tables/active_users/ddl?connectionId=conn-1&database=admin_db&kind=view',
        )
    })
})
