import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    fromJoinQualifiedLocalPartial,
    fromJoinQualifiedUsesCursorInsert,
    isCatalogSchemaTableStage,
    parseFromJoinQualifiedInput,
} from '../utils/from-qualified-input.ts'
import type {SqlEditorSchema} from '../types.ts'

describe('from-qualified-input', () => {
    const trinoSchema: Pick<SqlEditorSchema, 'catalogs'> = {catalogs: ['hive']}

    it('parseFromJoinQualifiedInput handles trailing dot', () => {
        assert.deepEqual(parseFromJoinQualifiedInput('hive.'), {
            raw: 'hive.',
            segments: ['hive'],
            trailingDot: true,
            localPartial: '',
            databaseScope: undefined,
        })
    })

    it('parseFromJoinQualifiedInput handles catalog.schema.', () => {
        assert.deepEqual(parseFromJoinQualifiedInput('hive.a003.'), {
            raw: 'hive.a003.',
            segments: ['hive', 'a003'],
            trailingDot: true,
            localPartial: '',
            databaseScope: 'hive.a003',
        })
    })

    it('local partial is last segment without trailing dot', () => {
        assert.equal(fromJoinQualifiedLocalPartial('hive.a003.t'), 't')
        assert.equal(fromJoinQualifiedLocalPartial('hive.a003.'), '')
    })

    it('trailing dot uses cursor insert', () => {
        assert.equal(fromJoinQualifiedUsesCursorInsert('hive.'), true)
        assert.equal(fromJoinQualifiedUsesCursorInsert('hive.a003'), false)
    })

    it('flat tables only for unqualified FROM input', () => {
        assert.equal(isCatalogSchemaTableStage(trinoSchema, 'hive.'), false)
        assert.equal(isCatalogSchemaTableStage(trinoSchema, 'kudu.a003.'), false)
        assert.equal(isCatalogSchemaTableStage(trinoSchema, 't'), true)
    })
})
