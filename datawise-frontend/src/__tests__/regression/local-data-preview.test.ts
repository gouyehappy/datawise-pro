import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    isLocalDataPreviewFileName,
    matchLocalDataPreviewProvider,
    type LocalDataPreviewProvider,
} from '@/features/local-files/services/local-data-preview.service'
import {isLocalBinaryFileName} from '@/features/local-files/services/local-files-path'

describe('T-FILE-1 local data preview', () => {
    it('detects parquet/csv/json extensions', () => {
        assert.equal(isLocalDataPreviewFileName('a.parquet'), true)
        assert.equal(isLocalDataPreviewFileName('b.CSV'), true)
        assert.equal(isLocalDataPreviewFileName('c.jsonl'), true)
        assert.equal(isLocalDataPreviewFileName('d.sql'), false)
    })

    it('treats parquet as binary so default open does not dump bytes', () => {
        assert.equal(isLocalBinaryFileName('lake/orders.parquet'), true)
    })

    it('matches provider by extension without hardcoding plugin id', () => {
        const providers: LocalDataPreviewProvider[] = [
            {
                pluginId: 'io.example.files',
                providerId: 'io.example.files.conn',
                pluginName: 'Files',
                extensions: ['.parquet', '.csv'],
            },
        ]
        const hit = matchLocalDataPreviewProvider(providers, 'C:\\data\\t.parquet')
        assert.equal(hit?.pluginId, 'io.example.files')
        assert.equal(matchLocalDataPreviewProvider(providers, 'notes.md'), null)
    })
})
