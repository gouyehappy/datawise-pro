import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildCreateTableDdlFromColumns,
    buildSchemaMigrateDdl,
} from '@/features/schema-compare/services/schema-compare-ddl.service'
import type {ColumnSchemaSnapshot, TableSchemaDiff} from '@/features/schema-compare/types/schema-compare.types'

const columns: ColumnSchemaSnapshot[] = [
    {
        name: 'id',
        dataType: 'INT',
        nullable: false,
        autoIncrement: true,
        keyType: 'PRI',
    },
    {
        name: 'name',
        dataType: 'VARCHAR(64)',
        nullable: true,
        autoIncrement: false,
        defaultValue: null,
    },
]

describe('schema-compare-ddl.service', () => {
    it('synthesizes CREATE TABLE from column snapshots', () => {
        const ddl = buildCreateTableDdlFromColumns('mysql', 'orders', columns, 'shop')
        assert.ok(ddl)
        assert.match(ddl!, /CREATE TABLE/)
        assert.match(ddl!, /orders/)
        assert.match(ddl!, /`id` INT NOT NULL AUTO_INCREMENT/)
        assert.match(ddl!, /`name` VARCHAR\(64\)/)
        assert.doesNotMatch(ddl!, /TODO/)
    })

    it('returns null when columns are empty', () => {
        assert.equal(buildCreateTableDdlFromColumns('mysql', 'orders', []), null)
    })

    it('uses createDdls map and avoids TODO when DDL is missing', () => {
        const diffs: TableSchemaDiff[] = [
            {tableName: 'orders', status: 'added', columnDiffs: []},
            {tableName: 'ghost', status: 'added', columnDiffs: []},
        ]
        const createDdls = new Map([['orders', 'CREATE TABLE orders (id INT);']])
        const ddl = buildSchemaMigrateDdl(diffs, 'mysql', createDdls, 'shop')
        assert.match(ddl, /CREATE TABLE orders \(id INT\);/)
        assert.match(ddl, /Unable to generate CREATE TABLE/)
        assert.doesNotMatch(ddl, /TODO/)
    })
})
