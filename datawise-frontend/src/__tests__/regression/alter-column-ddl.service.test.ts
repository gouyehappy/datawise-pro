import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildAlterColumnSql,
    buildBatchAlterColumnDdl,
    buildBatchCommentColumnDdl,
    parseBatchAddColumnLines,
    parseBatchCommentColumnLines,
    parseBatchRenameColumnLines,
    supportsAlterColumnWizard,
} from '@/features/workspace/services/alter-column-ddl.service'

describe('alter-column-ddl.service', () => {
    it('supports common JDBC dialects and rejects redis', () => {
        assert.equal(supportsAlterColumnWizard('mysql'), true)
        assert.equal(supportsAlterColumnWizard('postgresql'), true)
        assert.equal(supportsAlterColumnWizard('sqlserver'), true)
        assert.equal(supportsAlterColumnWizard('redis'), false)
        assert.equal(supportsAlterColumnWizard(undefined), false)
    })

    it('builds mysql add / modify / drop column SQL', () => {
        const add = buildAlterColumnSql('add', {
            dbType: 'mysql',
            tableName: 'orders',
            database: 'shop',
            column: {
                name: 'note',
                dataType: 'VARCHAR(64)',
                nullable: true,
                defaultValue: null,
            },
        })
        assert.equal(add, 'ALTER TABLE `shop`.`orders` ADD COLUMN `note` VARCHAR(64);')

        const modify = buildAlterColumnSql('modify', {
            dbType: 'mysql',
            tableName: 'orders',
            database: 'shop',
            column: {
                name: 'note',
                dataType: 'VARCHAR(128)',
                nullable: false,
                defaultValue: "''",
            },
        })
        assert.equal(
            modify,
            "ALTER TABLE `shop`.`orders` MODIFY COLUMN `note` VARCHAR(128) NOT NULL DEFAULT '';",
        )

        const drop = buildAlterColumnSql('drop', {
            dbType: 'mysql',
            tableName: 'orders',
            database: 'shop',
            column: {name: 'note', dataType: '', nullable: true},
        })
        assert.equal(drop, 'ALTER TABLE `shop`.`orders` DROP COLUMN `note`;')
    })

    it('builds postgresql alter as multiple statements', () => {
        const sql = buildAlterColumnSql('modify', {
            dbType: 'postgresql',
            tableName: 'orders',
            database: 'shop',
            column: {
                name: 'note',
                dataType: 'varchar(64)',
                nullable: true,
                defaultValue: null,
            },
        })
        assert.ok(sql)
        assert.match(sql!, /ALTER COLUMN "note" TYPE varchar\(64\);/)
        assert.match(sql!, /DROP NOT NULL;/)
        assert.match(sql!, /DROP DEFAULT;/)
    })

    it('returns null when required fields are missing', () => {
        assert.equal(
            buildAlterColumnSql('add', {
                dbType: 'mysql',
                tableName: 'orders',
                column: {name: '', dataType: 'INT', nullable: true},
            }),
            null,
        )
        assert.equal(
            buildAlterColumnSql('add', {
                dbType: 'mysql',
                tableName: 'orders',
                column: {name: 'id', dataType: '', nullable: true},
            }),
            null,
        )
    })

    it('builds batch drop column DDL', () => {
        const sql = buildBatchAlterColumnDdl('drop', {
            dbType: 'mysql',
            tableName: 'orders',
            database: 'shop',
            columnNames: ['note', 'legacy_flag'],
        })
        assert.equal(
            sql,
            'ALTER TABLE `shop`.`orders` DROP COLUMN `note`;\nALTER TABLE `shop`.`orders` DROP COLUMN `legacy_flag`;',
        )
        assert.equal(
            buildBatchAlterColumnDdl('drop', {
                dbType: 'mysql',
                tableName: 'orders',
                columnNames: [],
            }),
            null,
        )
    })

    it('builds batch add column DDL from specs and line parser', () => {
        const sql = buildBatchAlterColumnDdl('add', {
            dbType: 'mysql',
            tableName: 'orders',
            database: 'shop',
            columns: [
                {name: 'note', dataType: 'VARCHAR(64)', nullable: true},
                {name: 'flag', dataType: 'INT', nullable: false},
            ],
        })
        assert.equal(
            sql,
            'ALTER TABLE `shop`.`orders` ADD COLUMN `note` VARCHAR(64);\nALTER TABLE `shop`.`orders` ADD COLUMN `flag` INT NOT NULL;',
        )
        const parsed = parseBatchAddColumnLines('note VARCHAR(64)\nflag INT NOT NULL\n')
        assert.equal(parsed.length, 2)
        assert.equal(parsed[0]?.name, 'note')
        assert.equal(parsed[1]?.nullable, false)
    })

    it('builds batch modify column DDL', () => {
        const sql = buildBatchAlterColumnDdl('modify', {
            dbType: 'mysql',
            tableName: 'orders',
            database: 'shop',
            columns: [
                {name: 'note', dataType: 'VARCHAR(128)', nullable: true},
                {name: 'flag', dataType: 'BIGINT', nullable: false},
            ],
        })
        assert.equal(
            sql,
            'ALTER TABLE `shop`.`orders` MODIFY COLUMN `note` VARCHAR(128);\nALTER TABLE `shop`.`orders` MODIFY COLUMN `flag` BIGINT NOT NULL;',
        )
        const pg = buildBatchAlterColumnDdl('modify', {
            dbType: 'postgresql',
            tableName: 'orders',
            columns: [{name: 'note', dataType: 'TEXT', nullable: true}],
        })
        assert.ok(pg?.includes('ALTER COLUMN'))
        assert.ok(pg?.includes('TYPE TEXT'))
    })

    it('builds batch rename column DDL and parses lines', () => {
        const sql = buildBatchAlterColumnDdl('rename', {
            dbType: 'mysql',
            tableName: 'orders',
            database: 'shop',
            renames: [
                {from: 'legacy_flag', to: 'flag'},
                {from: 'old_note', to: 'note'},
            ],
        })
        assert.equal(
            sql,
            'ALTER TABLE `shop`.`orders` RENAME COLUMN `legacy_flag` TO `flag`;\nALTER TABLE `shop`.`orders` RENAME COLUMN `old_note` TO `note`;',
        )
        const parsed = parseBatchRenameColumnLines('a b\nold -> new\nx TO y\n')
        assert.deepEqual(parsed, [
            {from: 'a', to: 'b'},
            {from: 'old', to: 'new'},
            {from: 'x', to: 'y'},
        ])
        const pg = buildAlterColumnSql('rename', {
            dbType: 'postgresql',
            tableName: 'orders',
            column: {name: 'a', dataType: '', nullable: true, renameTo: 'b'},
        })
        assert.equal(pg, 'ALTER TABLE "orders" RENAME COLUMN "a" TO "b";')
    })

    it('builds batch comment DDL for postgres and mysql', () => {
        const parsed = parseBatchCommentColumnLines("note: customer memo\nflag IS active\nx 'quoted'")
        assert.deepEqual(parsed, [
            {name: 'note', comment: 'customer memo'},
            {name: 'flag', comment: 'active'},
            {name: 'x', comment: 'quoted'},
        ])

        const pg = buildBatchCommentColumnDdl({
            dbType: 'postgresql',
            tableName: 'orders',
            database: 'shop',
            comments: [{name: 'note', comment: "it's fine"}],
        })
        assert.equal(pg, `COMMENT ON COLUMN "shop"."orders"."note" IS 'it''s fine';`)

        const mysql = buildBatchCommentColumnDdl({
            dbType: 'mysql',
            tableName: 'orders',
            database: 'shop',
            comments: [{name: 'note', comment: 'memo'}],
            columnMeta: [{name: 'note', dataType: 'VARCHAR(64)', nullable: true}],
        })
        assert.equal(
            mysql,
            "ALTER TABLE `shop`.`orders` MODIFY COLUMN `note` VARCHAR(64) COMMENT 'memo';",
        )
        assert.equal(
            buildBatchCommentColumnDdl({
                dbType: 'mysql',
                tableName: 'orders',
                comments: [{name: 'note', comment: 'memo'}],
            }),
            null,
        )
    })
})
