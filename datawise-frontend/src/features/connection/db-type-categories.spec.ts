import {describe, expect, it} from 'vitest'
import type {DbType} from '@/core/types'
import {
    assertDbTypeCategoriesComplete,
    categoryForDbType,
    DB_TYPE_CATEGORIES,
    DB_TYPE_CATEGORY_MAP,
} from '@/features/connection/constants/db-type-categories'

const ALL_DB_TYPES = Object.keys(DB_TYPE_CATEGORY_MAP) as DbType[]

describe('db-type-categories', () => {
    it('maps every DbType entry to a known category', () => {
        assertDbTypeCategoriesComplete(ALL_DB_TYPES)
        for (const dbType of ALL_DB_TYPES) {
            const cat = categoryForDbType(dbType)
            expect(DB_TYPE_CATEGORIES.some((c) => c.key === cat)).toBe(true)
        }
    })

    it('places kafka under mq and dm under domestic', () => {
        expect(categoryForDbType('kafka')).toBe('mq')
        expect(categoryForDbType('dm')).toBe('domestic')
        expect(categoryForDbType('mysql')).toBe('sql')
        expect(categoryForDbType('kubernetes')).toBe('ops')
        expect(categoryForDbType('plugin')).toBe('plugins')
    })

    it('rejects unmapped ids', () => {
        expect(() => assertDbTypeCategoriesComplete([...ALL_DB_TYPES, 'not-a-real-db'])).toThrow(/unmapped/)
    })
})
