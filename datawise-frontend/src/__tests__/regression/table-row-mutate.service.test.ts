import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    createEmptyInsertDraft,
    isSqlExpressionDefault,
    parseInsertDraftValues,
    resolveNextAutoIncrementValues,
    resolvePrimaryKeyColumns,
} from '@/features/workspace/services/table-row-mutate.service'
import {buildUpdatePayload} from '@/core/composables/useGridPendingEdit'

describe('table-row-mutate.service', () => {
    it('resolvePrimaryKeyColumns returns PRI columns', () => {
        assert.deepEqual(
            resolvePrimaryKeyColumns([
                {ordinal: 1, name: 'id', dataType: 'int', nullable: false, autoIncrement: true, keyType: 'PRI'},
                {ordinal: 2, name: 'name', dataType: 'varchar', nullable: true, autoIncrement: false, keyType: null},
            ]),
            ['id'],
        )
    })

    it('resolvePrimaryKeyColumns accepts PRIMARY / PK key types', () => {
        assert.deepEqual(
            resolvePrimaryKeyColumns([
                {ordinal: 1, name: 'id', dataType: 'int', nullable: false, autoIncrement: true, keyType: 'PRIMARY KEY'},
                {ordinal: 2, name: 'code', dataType: 'varchar', nullable: false, autoIncrement: false, keyType: 'PK'},
            ]),
            ['id', 'code'],
        )
    })

    it('isSqlExpressionDefault detects CURRENT_TIMESTAMP', () => {
        assert.equal(isSqlExpressionDefault('CURRENT_TIMESTAMP'), true)
        assert.equal(isSqlExpressionDefault('guest'), false)
    })

    it('createEmptyInsertDraft fills next auto increment id and skips expression defaults', () => {
        const draft = createEmptyInsertDraft(
            [
                {ordinal: 1, name: 'id', dataType: 'int', nullable: false, autoIncrement: true, keyType: 'PRI'},
                {
                    ordinal: 2,
                    name: 'name',
                    dataType: 'varchar',
                    nullable: true,
                    autoIncrement: false,
                    keyType: null,
                    defaultValue: 'guest'
                },
                {
                    ordinal: 3,
                    name: 'create_time',
                    dataType: 'datetime',
                    nullable: false,
                    autoIncrement: false,
                    keyType: null,
                    defaultValue: 'CURRENT_TIMESTAMP'
                },
            ],
            {
                tableAutoIncrement: '42',
                gridColumns: [{name: 'id'}, {name: 'name'}, {name: 'create_time'}],
                rows: [],
            },
        )
        assert.deepEqual(draft, {id: '42', name: 'guest', create_time: ''})
    })

    it('resolveNextAutoIncrementValues increments pending offset', () => {
        const values = resolveNextAutoIncrementValues(
            [{ordinal: 1, name: 'id', dataType: 'int', nullable: false, autoIncrement: true, keyType: 'PRI'}],
            [{name: 'id'}],
            [{id: 10}],
            null,
            2,
        )
        assert.deepEqual(values, {id: '13'})
    })

    it('parseInsertDraftValues coerces numbers and nulls', () => {
        const values = parseInsertDraftValues(
            {id: '12', note: '  ', create_time: 'CURRENT_TIMESTAMP'},
            [
                {ordinal: 1, name: 'id', dataType: 'int', nullable: false, autoIncrement: false, keyType: 'PRI'},
                {ordinal: 2, name: 'note', dataType: 'varchar', nullable: true, autoIncrement: false, keyType: null},
                {
                    ordinal: 3,
                    name: 'create_time',
                    dataType: 'datetime',
                    nullable: false,
                    autoIncrement: false,
                    keyType: null,
                    defaultValue: 'CURRENT_TIMESTAMP'
                },
            ],
        )
        assert.deepEqual(values, {id: 12, note: null})
    })

    it('buildUpdatePayload sends only changed columns', () => {
        const columns = [{name: 'id', key: 'id'}, {name: 'name', key: 'name'}]
        const original = {id: 1, name: 'old'}
        const payload = buildUpdatePayload(
            original,
            {id: '1', name: 'new'},
            columns,
            [
                {ordinal: 1, name: 'id', dataType: 'int', nullable: false, autoIncrement: false, keyType: 'PRI'},
                {ordinal: 2, name: 'name', dataType: 'varchar', nullable: true, autoIncrement: false, keyType: null},
            ],
            ['id'],
        )
        assert.deepEqual(payload.keyValues, {id: 1})
        assert.deepEqual(payload.values, {name: 'new'})
    })
})
