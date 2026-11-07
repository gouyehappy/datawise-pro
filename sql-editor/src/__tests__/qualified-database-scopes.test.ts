import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    extractCatalogSchemaRefreshPrefixes,
    extractDatabaseTableScopes,
    extractQualifiedDatabaseScopes,
} from '../utils/qualified-database-scopes.ts'
import {catalogUsesSchemaLevel} from '../utils/from-qualified-input.ts'

describe('qualified-database-scopes', () => {
    const trinoSchemas = {hive: ['a003'], kudu: ['a003']}

    it('extracts catalog.schema from FROM clause', () => {
        assert.deepEqual(
            extractQualifiedDatabaseScopes('SELECT * FROM hive.a003_a'),
            ['hive.a003_a'],
        )
    })

    it('extracts scope when trailing dot is present in editor', () => {
        assert.deepEqual(
            extractQualifiedDatabaseScopes('SELECT * FROM hive.a003_a.'),
            ['hive.a003_a'],
        )
    })

    it('extracts MySQL database scope after db dot', () => {
        assert.deepEqual(
            extractDatabaseTableScopes('SELECT * FROM admin_db.', {}),
            ['admin_db'],
        )
    })

    it('does not treat Trino catalog dot as table scope', () => {
        assert.deepEqual(
            extractDatabaseTableScopes('SELECT * FROM hive.', {schemasByCatalog: trinoSchemas}),
            [],
        )
    })

    it('detects missing Trino schema index for catalog dot', () => {
        assert.deepEqual(
            extractCatalogSchemaRefreshPrefixes('SELECT * FROM hive.', {hive: []}),
            ['hive'],
        )
    })

    it('catalogUsesSchemaLevel distinguishes Trino vs MySQL', () => {
        assert.equal(catalogUsesSchemaLevel({schemasByCatalog: trinoSchemas}, 'hive'), true)
        assert.equal(catalogUsesSchemaLevel({schemasByCatalog: {}}, 'admin_db'), false)
    })
})
