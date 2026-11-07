import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    applyDataQualityUserTemplate,
    createDataQualityUserTemplate,
    findDataQualityUserTemplate,
    readDataQualityUserTemplates,
    removeDataQualityUserTemplate,
    upsertDataQualityUserTemplate,
    writeDataQualityUserTemplates,
} from '@/features/platform/services/data-quality-user-templates.service'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {canPersistLocalResource} from '@/features/auth/services/user-resource-policy'

class MemoryStorage implements Storage {
    private readonly map = new Map<string, string>()
    get length() { return this.map.size }
    clear() { this.map.clear() }
    getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null }
    key(index: number) { return [...this.map.keys()][index] ?? null }
    removeItem(key: string) { this.map.delete(key) }
    setItem(key: string, value: string) { this.map.set(key, String(value)) }
}

describe('data-quality-user-templates', () => {
    it('create/apply/upsert/remove round-trip in memory storage', () => {
        if (!canPersistLocalResource(UserResource.DataQualityTemplates)) {
            // Guest / no session in unit test — still validate pure helpers.
            const created = createDataQualityUserTemplate({
                name: 'No negatives',
                sql: 'SELECT id FROM {table} WHERE amount < 0',
                assertion: 'empty_result',
                blocking: true,
            })
            assert.ok(created)
            assert.equal(applyDataQualityUserTemplate(created!).dqBlocking, true)
            assert.equal(applyDataQualityUserTemplate(created!).name, 'No negatives')
            const list = upsertDataQualityUserTemplate([], created!)
            assert.equal(list.length, 1)
            assert.equal(findDataQualityUserTemplate(created!.id, list)?.name, 'No negatives')
            assert.equal(removeDataQualityUserTemplate(list, created!.id).length, 0)
            return
        }

        const storage = new MemoryStorage()
        const created = createDataQualityUserTemplate({
            name: 'No negatives',
            sql: 'SELECT id FROM {table} WHERE amount < 0',
            assertion: 'empty_result',
            blocking: true,
        })
        assert.ok(created)
        const written = writeDataQualityUserTemplates(
            upsertDataQualityUserTemplate([], created!),
            storage,
        )
        assert.equal(written, true)
        const loaded = readDataQualityUserTemplates(storage)
        assert.equal(loaded.length, 1)
        assert.equal(loaded[0].name, 'No negatives')
        assert.equal(applyDataQualityUserTemplate(loaded[0]).sql.includes('{table}'), true)
    })

    it('rejects blank name or sql', () => {
        assert.equal(createDataQualityUserTemplate({
            name: '  ',
            sql: 'SELECT 1',
            assertion: 'empty_result',
        }), null)
        assert.equal(createDataQualityUserTemplate({
            name: 'x',
            sql: '  ',
            assertion: 'empty_result',
        }), null)
    })
})
