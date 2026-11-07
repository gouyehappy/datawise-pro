import assert from 'node:assert/strict'
import {afterEach, describe, it} from 'node:test'
import {saveExportBlob} from '@/shared/utils/export-save'

describe('saveExportBlob', () => {
    const previousDatawise = (globalThis as {datawise?: unknown}).datawise
    const previousWindowDatawise = globalThis.window?.datawise

    afterEach(() => {
        ;(globalThis as {datawise?: unknown}).datawise = previousDatawise
        if (globalThis.window) {
            ;(globalThis.window as Window & {datawise?: unknown}).datawise = previousWindowDatawise
        }
    })

    it('writes under workspace exports/ when desktop fs is available', async () => {
        const writes: Array<{path: string; base64: string}> = []
        const mkdirs: string[] = []
        const host = {
            config: {
                getSettings: async () => ({
                    configured: null,
                    resolved: 'C:\\DataWise\\ws',
                    defaultPath: 'C:\\DataWise\\ws',
                    canChange: true,
                    recentWorkspaces: [],
                }),
            },
            fs: {
                registerRoot: async () => ({ok: true, path: 'C:\\DataWise\\ws'}),
                mkdir: async (path: string) => {
                    mkdirs.push(path)
                    return {ok: true, path}
                },
                writeBinaryFile: async (path: string, base64: string) => {
                    writes.push({path, base64})
                    return {ok: true, path}
                },
            },
        }
        // test-setup aliases window → globalThis; set both so host lookup always hits the mock.
        ;(globalThis as {datawise?: unknown}).datawise = host
        if (globalThis.window) {
            ;(globalThis.window as Window & {datawise?: unknown}).datawise = host as never
        }

        const blob = new Blob(['a,b\n1,2\n'], {type: 'text/csv'})
        const result = await saveExportBlob(blob, 'sys_menu_api.csv')

        assert.equal(result.mode, 'workspace')
        assert.equal(result.fileName, 'sys_menu_api.csv')
        assert.equal(result.path, 'C:\\DataWise\\ws\\exports\\sys_menu_api.csv')
        assert.deepEqual(mkdirs, ['C:\\DataWise\\ws\\exports'])
        assert.equal(writes.length, 1)
        assert.equal(writes[0]?.path, 'C:\\DataWise\\ws\\exports\\sys_menu_api.csv')
    })
})
