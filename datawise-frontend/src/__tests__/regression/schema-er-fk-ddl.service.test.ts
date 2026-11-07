import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildAddForeignKeySql,
    buildDropForeignKeySql,
} from '@/features/workspace/services/schema-er-fk-ddl.service'

describe('schema-er-fk-ddl.service', () => {
    it('builds mysql add foreign key', () => {
        const sql = buildAddForeignKeySql({
            sourceTable: 'orders',
            sourceColumn: 'user_id',
            targetTable: 'users',
            targetColumn: 'id',
        }, {dbType: 'mysql', database: 'shop'})
        assert.match(sql, /ALTER TABLE `shop`\.`orders`/)
        assert.match(sql, /FOREIGN KEY \(`user_id`\) REFERENCES `shop`\.`users` \(`id`\)/)
    })

    it('builds mysql drop foreign key', () => {
        const sql = buildDropForeignKeySql({
            sourceTable: 'orders',
            sourceColumn: 'user_id',
            targetTable: 'users',
            targetColumn: 'id',
            constraintName: 'fk_orders_user',
        }, {dbType: 'mysql', database: 'shop'})
        assert.match(sql, /DROP FOREIGN KEY `fk_orders_user`/)
    })

    it('builds postgres drop constraint', () => {
        const sql = buildDropForeignKeySql({
            sourceTable: 'orders',
            sourceColumn: 'user_id',
            targetTable: 'users',
            targetColumn: 'id',
            constraintName: 'fk_orders_user',
        }, {dbType: 'postgresql', database: 'public'})
        assert.match(sql, /DROP CONSTRAINT "fk_orders_user"/)
    })
})
