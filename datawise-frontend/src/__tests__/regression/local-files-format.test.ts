import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {formatLocalFileTooltip} from '@/features/local-files/services/local-files-format'

describe('formatLocalFileTooltip', () => {
    it('includes path, size, and mtime for files', () => {
        const tip = formatLocalFileTooltip({
            path: 'C:/ws/a.sql',
            isDirectory: false,
            size: 2048,
            mtimeMs: Date.UTC(2026, 0, 2, 3, 4, 5),
        }, 'en-US')
        assert.ok(tip.startsWith('C:/ws/a.sql'))
        assert.match(tip, /2\.0 KB/)
        assert.ok(tip.includes('\n'))
    })

    it('omits size for directories', () => {
        const tip = formatLocalFileTooltip({
            path: '/tmp/dir',
            isDirectory: true,
            size: 0,
            mtimeMs: 0,
        })
        assert.equal(tip, '/tmp/dir')
    })
})
