import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildFakeDataInsertSql,
    buildFakeDataRows,
    clampFakeDataRowCount,
    columnsForFakeInsert,
    generateFakeCellValue,
} from '@/features/workspace/services/fake-data.service'
import type {TablePropertiesResult} from '@/shared/api/types'

const sampleProperties: TablePropertiesResult = {
    tableName: 'users',
    columns: [
        {
            ordinal: 1,
            name: 'id',
            dataType: 'bigint(20)',
            nullable: false,
            autoIncrement: true,
            keyType: 'PRI',
        },
        {
            ordinal: 2,
            name: 'email',
            dataType: 'varchar(255)',
            nullable: false,
            autoIncrement: false,
            keyType: null,
        },
        {
            ordinal: 3,
            name: 'age',
            dataType: 'int(11)',
            nullable: true,
            autoIncrement: false,
            keyType: null,
        },
    ],
    foreignKeys: [],
    indexes: [],
}

describe('fake-data.service', () => {
    it('skips auto-increment primary keys', () => {
        const columns = columnsForFakeInsert(sampleProperties.columns)
        assert.deepEqual(columns.map((column) => column.name), ['email', 'age'])
    })

    it('clamps row count', () => {
        assert.equal(clampFakeDataRowCount(0), 1)
        assert.equal(clampFakeDataRowCount(9999), 500)
        assert.equal(clampFakeDataRowCount(12.7), 13)
    })

    it('generates typed sample values', () => {
        assert.equal(generateFakeCellValue(sampleProperties.columns[1], 0), 'user1@example.com')
        assert.equal(generateFakeCellValue(sampleProperties.columns[2], 0), 1000)
    })

    it('generates heuristic values from column names', () => {
        assert.equal(
            generateFakeCellValue({name: 'status', dataType: 'varchar(32)', nullable: true, autoIncrement: false, ordinal: 1, keyType: null}, 0),
            'active',
        )
        assert.equal(
            generateFakeCellValue({name: 'order_code', dataType: 'varchar(32)', nullable: true, autoIncrement: false, ordinal: 1, keyType: null}, 1),
            'CODE-1002',
        )
        assert.equal(
            generateFakeCellValue({name: 'unit_price', dataType: 'decimal(10,2)', nullable: true, autoIncrement: false, ordinal: 1, keyType: null}, 2),
            29.97,
        )
    })

    it('builds requested number of rows', () => {
        const rows = buildFakeDataRows(sampleProperties, 3)
        assert.equal(rows.length, 3)
        assert.equal(rows[0].email, 'user1@example.com')
        assert.equal(rows[2].email, 'user3@example.com')
        assert.equal('id' in rows[0], false)
    })

    it('builds insert sql with qualified table name', () => {
        const rows = buildFakeDataRows(sampleProperties, 2)
        const sql = buildFakeDataInsertSql({
            properties: sampleProperties,
            rows,
            dbType: 'mysql',
            database: 'shop',
        })
        assert.match(sql, /INSERT INTO `shop`\.`users`/i)
        assert.match(sql, /`email`, `age`/i)
        assert.match(sql, /user1@example.com/)
        assert.match(sql, /user2@example.com/)
    })
})
