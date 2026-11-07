import {describe, expect, it} from 'vitest'
import type {WorkspaceTab} from '@/core/types'
import {
    planOpenKafkaTopics,
    planOpenRedisKey,
    planOpenRedisConsole,
} from '@/features/workspace/services/workspace-stateless-open.service'
import {findConfigCenterWorkbenchTab} from '@/features/workspace/services/workspace-platform-open.service'

function tab(partial: Partial<WorkspaceTab> & Pick<WorkspaceTab, 'id' | 'title' | 'type'>): WorkspaceTab {
    return {closable: true, ...partial}
}

describe('workspace-stateless-open.service', () => {
    it('planOpenRedisKey reuses matching connection+key and creates otherwise', () => {
        const existing = tab({
            id: 'redis-1',
            title: 'user:1',
            type: 'redis-key',
            connectionId: 'c1',
            params: {redisKey: 'user:1'},
        })
        const reuse = planOpenRedisKey([existing], {connectionId: 'c1', key: 'user:1'})
        expect('reuse' in reuse && reuse.reuse).toBe(existing)

        const create = planOpenRedisKey([existing], {connectionId: 'c1', key: 'user:2'})
        expect('create' in create && create.create).toMatchObject({
            type: 'redis-key',
            title: 'user:2',
            connectionId: 'c1',
            params: {redisKey: 'user:2'},
            dbType: 'redis',
        })
    })

    it('planOpenRedisConsole patches redisView on reuse', () => {
        const existing = tab({
            id: 'redis-console-1',
            title: 'Redis',
            type: 'redis-console',
            connectionId: 'c1',
            params: {redisView: 'keys'},
        })
        const decision = planOpenRedisConsole([existing], {
            connectionId: 'c1',
            view: 'command',
        })
        expect(decision).toEqual({
            reuse: existing,
            patches: {params: {redisView: 'command'}},
        })
    })

    it('planOpenKafkaTopics reuses and patches topic; findConfigCenterWorkbenchTab spans types', () => {
        const kafka = tab({
            id: 'kafka-topics-1',
            title: 'Kafka',
            type: 'kafka-topics',
            connectionId: 'k1',
        })
        const withTopic = planOpenKafkaTopics([kafka], {
            connectionId: 'k1',
            topic: 'orders',
        })
        expect(withTopic).toEqual({
            reuse: kafka,
            patches: {params: {kafkaTopic: 'orders'}},
        })

        const polaris = tab({
            id: 'polaris-1',
            title: 'Polaris',
            type: 'polaris-services',
            connectionId: 'p1',
            dbType: 'polaris',
        })
        expect(findConfigCenterWorkbenchTab([polaris], 'p1', 'polaris')).toBe(polaris)
        expect(findConfigCenterWorkbenchTab([polaris], 'other', 'polaris')).toBeUndefined()
    })
})
