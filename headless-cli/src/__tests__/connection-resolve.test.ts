import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {formatCliError} from '../cli-error.js'
import {DatawiseApiError} from '../client.js'
import {formatVisibleConnections, resolveConnectionRef} from '../connection-resolve.js'
import type {SqlVisibleConnection} from '../types.js'

const catalog: SqlVisibleConnection[] = [
    {id: 'conn-1', name: 'Staging', dbType: 'mysql', env: 'staging', access: 'ddl', shared: false},
    {id: 'conn-prod', name: 'Prod Orders', dbType: 'mysql', env: 'prod', access: 'readonly', shared: true},
    {id: 'conn-a', name: 'Dup', dbType: 'pg', env: 'dev', access: 'readwrite', shared: true},
    {id: 'conn-b', name: 'Dup', dbType: 'pg', env: 'dev', access: 'ddl', shared: false},
]

describe('resolveConnectionRef', () => {
    it('resolves by id', () => {
        assert.equal(resolveConnectionRef('conn-prod', catalog).id, 'conn-prod')
    })

    it('resolves by unique name (case-insensitive)', () => {
        assert.equal(resolveConnectionRef('staging', catalog).id, 'conn-1')
    })

    it('rejects ambiguous names', () => {
        assert.throws(
            () => resolveConnectionRef('Dup', catalog),
            /Ambiguous connection name/,
        )
    })
})

describe('formatCliError', () => {
    it('explains production approval blocks', () => {
        const message = formatCliError(
            new DatawiseApiError(403, 'SQL_PRODUCTION_APPROVAL_REQUIRED', 'SQL_PRODUCTION_APPROVAL_REQUIRED'),
        )
        assert.match(message, /team approval/i)
    })

    it('explains shared connection access denial', () => {
        const message = formatCliError(
            new DatawiseApiError(403, 'CONNECTION_ACCESS_DENIED', 'CONNECTION_ACCESS_DENIED'),
        )
        assert.match(message, /readonly/)
    })
})

describe('formatVisibleConnections', () => {
    it('renders a TSV table', () => {
        const text = formatVisibleConnections([catalog[1]!], false)
        assert.match(text, /conn-prod/)
        assert.match(text, /yes/)
    })
})
