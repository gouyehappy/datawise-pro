import {describe, expect, it} from 'vitest'
import {resolveTargetIdsFromWorkbenchFocus} from '@/features/ai/context/services/resolve-targets-from-focus'
import type {AiDatabaseTarget} from '@/features/ai/shared/utils/database-targets'

const targets: AiDatabaseTarget[] = [
    {
        id: 'c1:orders',
        connectionId: 'c1',
        connectionLabel: 'Orders DB',
        databaseId: 'orders',
        databaseLabel: 'orders',
        level: 'database',
        dbType: 'mysql',
    },
    {
        id: 'c1:orders:line_items',
        connectionId: 'c1',
        connectionLabel: 'Orders DB',
        databaseId: 'orders',
        databaseLabel: 'orders',
        tableId: 'line_items',
        tableLabel: 'line_items',
        level: 'table',
        dbType: 'mysql',
    },
    {
        id: 'c2:app',
        connectionId: 'c2',
        connectionLabel: 'App',
        databaseId: 'app',
        databaseLabel: 'app',
        level: 'database',
        dbType: 'postgresql',
    },
]

describe('resolveTargetIdsFromWorkbenchFocus', () => {
    it('prefers table target when objectName matches', () => {
        const ids = resolveTargetIdsFromWorkbenchFocus(targets, {
            surface: 'workspace',
            connectionId: 'c1',
            database: 'orders',
            objectKind: 'table',
            objectName: 'line_items',
        })
        expect(ids).toEqual(['c1:orders:line_items'])
    })

    it('falls back to database target', () => {
        const ids = resolveTargetIdsFromWorkbenchFocus(targets, {
            surface: 'workspace',
            connectionId: 'c1',
            database: 'orders',
        })
        expect(ids).toEqual(['c1:orders'])
    })

    it('returns empty when connection unknown', () => {
        expect(resolveTargetIdsFromWorkbenchFocus(targets, {
            surface: 'workspace',
            connectionId: 'missing',
        })).toEqual([])
    })
})
