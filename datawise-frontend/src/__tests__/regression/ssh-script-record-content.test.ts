import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    looksLikeStoredHtml,
    toPlainCommandText,
    toStoredCommandText,
} from '@/features/ssh/services/ssh-script-record-content.service'

describe('ssh-script-record-content.service', () => {
    it('stores and reloads plain command text without html wrappers', () => {
        const source = '# 查看应用列表\nyarn application -list'
        const stored = toStoredCommandText(source)
        assert.equal(stored.includes('<pre>'), false)
        assert.equal(toPlainCommandText(stored), source)
        assert.equal(looksLikeStoredHtml(stored), false)
    })

    it('reads legacy paragraph html', () => {
        const text = toPlainCommandText('<p># 标题</p><p>uptime</p>')
        assert.ok(text.includes('# 标题'))
        assert.ok(text.includes('uptime'))
        assert.equal(looksLikeStoredHtml('<p># 标题</p><p>uptime</p>'), true)
    })

    it('reads legacy pre html', () => {
        const text = toPlainCommandText('<pre>@run\nuptime</pre>')
        assert.ok(text.includes('@run'))
        assert.ok(text.includes('uptime'))
    })

    it('does not treat shell redirects as html', () => {
        const source = 'cat file.txt > out.log'
        assert.equal(looksLikeStoredHtml(source), false)
        assert.equal(toPlainCommandText(source), source)
    })
})
