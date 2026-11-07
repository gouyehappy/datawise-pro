import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildSchemaCompareAiMigrationPrompt,
    formatSchemaCompareDiffSummary,
    parseSchemaCompareAiMigrationReply,
} from '@/features/schema-compare/services/schema-compare-ai-migration.service'
import type {SchemaCompareResult} from '@/features/schema-compare/types/schema-compare.types'

const result: SchemaCompareResult = {
    tableDiffs: [
        {
            tableName: 'users',
            status: 'changed',
            columnDiffs: [
                {
                    name: 'email',
                    status: 'modified',
                    left: {
                        name: 'email',
                        dataType: 'varchar(255)',
                        nullable: false,
                        autoIncrement: false,
                    },
                    right: {
                        name: 'email',
                        dataType: 'varchar(128)',
                        nullable: false,
                        autoIncrement: false,
                    },
                    changes: ['dataType'],
                },
            ],
        },
    ],
    ddl: '',
    summary: {added: 0, removed: 0, changed: 1, unchanged: 0},
    createDdls: {},
}

describe('schema-compare-ai-migration.service', () => {
    it('formats selected diff summary', () => {
        const summary = formatSchemaCompareDiffSummary(
            result,
            new Set(['users']),
            new Map([['users', new Set(['email'])]]),
        )
        assert.match(summary, /users \(changed\)/)
        assert.match(summary, /email: modified/)
    })

    it('builds ai migration prompt with scopes and baseline', () => {
        const prompt = buildSchemaCompareAiMigrationPrompt({
            left: {
                connectionId: 'l1',
                database: 'ref_db',
                connectionLabel: 'Ref',
                dbType: 'mysql',
            },
            right: {
                connectionId: 'r1',
                database: 'tgt_db',
                connectionLabel: 'Tgt',
                dbType: 'postgresql',
            },
            baselineDdl: 'ALTER TABLE users ADD COLUMN email varchar(255);',
            diffSummary: '- users (changed)',
            locale: 'en-US',
        })
        assert.match(prompt, /postgresql/i)
        assert.match(prompt, /-- UP/)
        assert.match(prompt, /ALTER TABLE users/)
    })

    it('parses UP and DOWN sections from ai reply', () => {
        const parsed = parseSchemaCompareAiMigrationReply(`-- UP
ALTER TABLE users ADD COLUMN email varchar(255);

-- DOWN
ALTER TABLE users DROP COLUMN email;`)
        assert.match(parsed?.up ?? '', /ADD COLUMN email/)
        assert.match(parsed?.down ?? '', /DROP COLUMN email/)
    })

    it('falls back to full text when markers missing', () => {
        const parsed = parseSchemaCompareAiMigrationReply('ALTER TABLE t ADD COLUMN c int;')
        assert.equal(parsed?.up, 'ALTER TABLE t ADD COLUMN c int;')
    })
})
