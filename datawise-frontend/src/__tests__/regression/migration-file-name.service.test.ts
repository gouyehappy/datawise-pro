import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildDefaultMigrationFileName,
    isValidMigrationFileName,
    normalizeMigrationFileName,
    sanitizeMigrationSlug,
} from '@/features/workspace/services/migration-file-name.service'

describe('migration-file-name.service', () => {
    it('sanitizeMigrationSlug normalizes labels', () => {
        assert.equal(sanitizeMigrationSlug('Add Users Table'), 'Add_Users_Table')
        assert.equal(sanitizeMigrationSlug('  '), '')
    })

    it('buildDefaultMigrationFileName uses V timestamp prefix', () => {
        const name = buildDefaultMigrationFileName('add_index')
        assert.match(name, /^V\d+_add_index\.sql$/)
    })

    it('validates migration file names', () => {
        assert.equal(isValidMigrationFileName('V123_add_users.sql'), true)
        assert.equal(isValidMigrationFileName('add_users.sql'), false)
        assert.equal(isValidMigrationFileName('V123.sql'), false)
    })

    it('normalizeMigrationFileName adds .sql suffix', () => {
        assert.equal(normalizeMigrationFileName('V123_add_users'), 'V123_add_users.sql')
        assert.equal(normalizeMigrationFileName('bad-name'), null)
    })
})
