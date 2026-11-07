import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    bytesToHexDump,
    decodeBinaryCellContent,
    detectImageMimeFromBytes,
} from '@/core/data-grid/services/cell-binary-preview.service'

describe('cell-binary-preview.service', () => {
    it('decodes hex and dumps rows', () => {
        const bytes = decodeBinaryCellContent('ff d8 ff e0')
        assert.ok(bytes)
        assert.equal(bytes.length, 4)
        assert.equal(detectImageMimeFromBytes(bytes), 'image/jpeg')
        const dump = bytesToHexDump(bytes)
        assert.match(dump, /00000000/)
        assert.match(dump, /ff d8 ff e0/)
    })

    it('decodes base64 png signature', () => {
        // PNG magic: 89 50 4E 47
        const bytes = decodeBinaryCellContent(btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)))
        assert.ok(bytes)
        assert.equal(detectImageMimeFromBytes(bytes), 'image/png')
    })
})
