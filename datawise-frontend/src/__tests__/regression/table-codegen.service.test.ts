import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    generateTableCode,
    mapJavaType,
    mapTypeScriptType,
    toCamelCase,
    toPascalCase,
} from '@/features/workspace/services/table-codegen.service'
import type {TablePropertiesResult} from '@/shared/api/types'

const sampleProperties: TablePropertiesResult = {
    tableName: 'order_item',
    comment: 'Order line items',
    columns: [
        {
            ordinal: 1,
            name: 'id',
            dataType: 'bigint(20)',
            nullable: false,
            autoIncrement: true,
            keyType: 'PRI',
            comment: 'Primary key',
        },
        {
            ordinal: 2,
            name: 'user_email',
            dataType: 'varchar(255)',
            nullable: false,
            autoIncrement: false,
            keyType: null,
            comment: 'Buyer email',
        },
        {
            ordinal: 3,
            name: 'amount',
            dataType: 'decimal(10,2)',
            nullable: true,
            autoIncrement: false,
            keyType: null,
        },
    ],
    foreignKeys: [],
    indexes: [],
}

describe('table-codegen.service', () => {
    it('converts snake_case names', () => {
        assert.equal(toPascalCase('order_item'), 'OrderItem')
        assert.equal(toCamelCase('user_email'), 'userEmail')
    })

    it('maps SQL types to Java and TypeScript', () => {
        assert.equal(mapJavaType(sampleProperties.columns[0]), 'Long')
        assert.equal(mapJavaType(sampleProperties.columns[2]), 'BigDecimal')
        assert.equal(mapTypeScriptType(sampleProperties.columns[1]), 'string')
        assert.equal(mapTypeScriptType(sampleProperties.columns[2]), 'number | null')
    })

    it('generates JPA entity with table and column annotations', () => {
        const code = generateTableCode('jpa', {properties: sampleProperties})
        assert.match(code, /@Entity/)
        assert.match(code, /@Table\(name = "order_item"\)/)
        assert.match(code, /public class OrderItem/)
        assert.match(code, /@GeneratedValue/)
        assert.match(code, /private String userEmail;/)
    })

    it('generates MyBatis mapper interface', () => {
        const code = generateTableCode('mybatis', {properties: sampleProperties})
        assert.match(code, /public interface OrderItemMapper/)
        assert.match(code, /selectById/)
        assert.match(code, /List<OrderItem> selectAll/)
    })

    it('generates TypeScript interface and insert helper type', () => {
        const code = generateTableCode('typescript', {properties: sampleProperties})
        assert.match(code, /export interface OrderItem/)
        assert.match(code, /userEmail: string/)
        assert.match(code, /amount\?: number \| null/)
        assert.match(code, /export type OrderItemInsert = Omit<OrderItem, 'id'>/)
    })
})
