import {describe, it, afterEach} from 'node:test'
import assert from 'node:assert/strict'
import {effectScope} from 'vue'
import {createSqlEditorRuntime} from '../runtime/create-runtime.ts'
import {useSqlEditorShortcutsController} from '../composables/useSqlEditorShortcutsController.ts'
import type {SqlEditorShortcutsLayer} from '../types.ts'
import type {SqlEditorShortcutsPersistence} from '../settings/persistence.ts'

function createMemoryPersistence(initial?: {
    personal?: SqlEditorShortcutsLayer
    shared?: SqlEditorShortcutsLayer
}) {
    let personal: SqlEditorShortcutsLayer = {...(initial?.personal ?? {})}
    let shared: SqlEditorShortcutsLayer = {...(initial?.shared ?? {})}
    const persistence: SqlEditorShortcutsPersistence = {
        readPersonal: () => personal,
        writePersonal: (layer) => {
            personal = {...layer}
        },
        readShared: () => shared,
        writeShared: (layer) => {
            shared = {...layer}
        },
    }
    return {
        persistence,
        getPersonal: () => personal,
        getShared: () => shared,
    }
}

describe('useSqlEditorShortcutsController', () => {
    const scopes: Array<ReturnType<typeof effectScope>> = []

    afterEach(() => {
        while (scopes.length) scopes.pop()?.stop()
    })

    function runController(options: {
        persistence: SqlEditorShortcutsPersistence
        parseSharedConfigText?: (text: string) => SqlEditorShortcutsLayer | null
    }) {
        const runtime = createSqlEditorRuntime({sync: false})
        let controller!: ReturnType<typeof useSqlEditorShortcutsController>
        const scope = effectScope()
        scopes.push(scope)
        scope.run(() => {
            controller = useSqlEditorShortcutsController(runtime, options)
        })
        return {runtime, controller: controller!}
    }

    it('patchSettings persists personal layer and syncs runtime', () => {
        const mem = createMemoryPersistence()
        const {runtime, controller} = runController({persistence: mem.persistence})

        controller.patchSettings({autoTableAlias: false})
        assert.equal(mem.getPersonal().autoTableAlias, false)
        assert.equal(runtime.getEffectiveSettings().autoTableAlias, false)
    })

    it('shared persistence: applyShared and importSharedConfigText', () => {
        const mem = createMemoryPersistence()
        const {controller} = runController({
            persistence: mem.persistence,
            parseSharedConfigText: (text) => JSON.parse(text) as SqlEditorShortcutsLayer,
        })

        controller.applyShared({
            snippets: [{id: 'x', label: 'x', insertText: '1', enabled: true, slots: ['where']}],
        })
        assert.equal(mem.getShared().snippets?.length, 1)

        const ok = controller.importSharedConfigText(JSON.stringify({autoTableAlias: true}))
        assert.equal(ok, true)
        assert.equal(mem.getShared().autoTableAlias, true)
    })

    it('defaults showHintBar to true for new users', () => {
        const mem = createMemoryPersistence()
        const {runtime} = runController({persistence: mem.persistence})
        assert.equal(runtime.getEffectiveSettings().showHintBar, true)
    })

    it('patchSettings showHintBar persists and updates effective settings', () => {
        const mem = createMemoryPersistence()
        const {controller, runtime} = runController({persistence: mem.persistence})
        controller.patchSettings({showHintBar: false})
        assert.equal(mem.getPersonal().showHintBar, false)
        assert.equal(runtime.getEffectiveSettings().showHintBar, false)
        controller.patchSettings({showHintBar: true})
        assert.equal(runtime.getEffectiveSettings().showHintBar, true)
    })

    it('addCustomSnippet uses custom- id prefix', () => {
        const mem = createMemoryPersistence()
        const {controller} = runController({persistence: mem.persistence})

        const id = controller.addCustomSnippet({
            label: 'my',
            insertText: 'SELECT 1',
            slots: ['statement_start'],
        })
        assert.ok(id?.startsWith('custom-'))
        assert.equal(controller.isCustomSnippetId(id!), true)
    })

    it('resetPersonal clears personal layer', () => {
        const mem = createMemoryPersistence({personal: {fontSize: 20}})
        const {controller} = runController({persistence: mem.persistence})

        controller.resetPersonal()
        assert.deepEqual(mem.getPersonal(), {})
    })
})
