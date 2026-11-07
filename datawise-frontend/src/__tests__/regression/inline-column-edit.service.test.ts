import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {buildInlineColumnCellAlterSql} from '@/features/workspace/services/inline-column-edit.service'
import type {TableColumnDetail} from '@/shared/api/types'

const baseColumn: TableColumnDetail = {
    ordinal: 1,
    name: 'note',
    dataType: 'VARCHAR(64)',
    nullable: true,
    autoIncrement: false,
    defaultValue: null,
    comment: 'memo',
}

describe('inline-column-edit.service', () => {
    it('builds rename / modify / comment SQL and skips no-ops', () => {
        const rename = buildInlineColumnCellAlterSql({
            dbType: 'mysql',
            tableName: 'orders',
            database: 'shop',
            original: baseColumn,
            field: 'name',
            nextValue: 'remark',
        })
        assert.equal(rename, 'ALTER TABLE `shop`.`orders` RENAME COLUMN `note` TO `remark`;')

        const type = buildInlineColumnCellAlterSql({
            dbType: 'mysql',
            tableName: 'orders',
            database: 'shop',
            original: baseColumn,
            field: 'dataType',
            nextValue: 'VARCHAR(128)',
        })
        assert.equal(type, 'ALTER TABLE `shop`.`orders` MODIFY COLUMN `note` VARCHAR(128);')

        const comment = buildInlineColumnCellAlterSql({
            dbType: 'mysql',
            tableName: 'orders',
            database: 'shop',
            original: baseColumn,
            field: 'comment',
            nextValue: 'updated',
        })
        assert.equal(
            comment,
            "ALTER TABLE `shop`.`orders` MODIFY COLUMN `note` VARCHAR(64) COMMENT 'updated';",
        )

        assert.equal(
            buildInlineColumnCellAlterSql({
                dbType: 'mysql',
                tableName: 'orders',
                original: baseColumn,
                field: 'name',
                nextValue: 'note',
            }),
            null,
        )
    })

    it('toggles nullable with modify SQL', () => {
        const sql = buildInlineColumnCellAlterSql({
            dbType: 'mysql',
            tableName: 'orders',
            database: 'shop',
            original: baseColumn,
            field: 'nullable',
            nextValue: false,
        })
        assert.equal(sql, 'ALTER TABLE `shop`.`orders` MODIFY COLUMN `note` VARCHAR(64) NOT NULL;')
    })
})
