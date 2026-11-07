import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    canReadClipboard,
    canWriteClipboard,
    readClipboardText,
    writeClipboardText,
} from '../../shared/browser/app-clipboard.ts'

describe('app-clipboard', () => {
    it('prefers desktop bridge for read and write', async () => {
        let written = ''
        const deps = {
            hostClipboard: () => ({
                readText: async () => 'from-bridge',
                writeText: async (text: string) => {
                    written = text
                },
            }),
            browserClipboard: () => undefined,
            execCopy: () => false,
        }
        assert.equal(canReadClipboard(deps), true)
        assert.equal(canWriteClipboard(deps), true)
        assert.equal(await readClipboardText(deps), 'from-bridge')
        assert.equal(await writeClipboardText('hello', deps), true)
        assert.equal(written, 'hello')
    })

    it('falls back to execCopy when browser write fails', async () => {
        const deps = {
            hostClipboard: () => undefined,
            browserClipboard: () => ({
                writeText: async () => {
                    throw new DOMException('denied', 'NotAllowedError')
                },
            } as Clipboard),
            execCopy: () => true,
        }
        assert.equal(await writeClipboardText('x', deps), true)
    })

    it('returns null when no read path exists', async () => {
        const deps = {
            hostClipboard: () => undefined,
            browserClipboard: () => undefined,
        }
        assert.equal(canReadClipboard(deps), false)
        assert.equal(await readClipboardText(deps), null)
    })
})
