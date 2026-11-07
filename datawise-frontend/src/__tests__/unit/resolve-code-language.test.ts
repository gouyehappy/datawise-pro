import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    codeLanguageLabel,
    resolveCodeLanguage,
} from '../../core/components/resolve-code-language.ts'

describe('resolveCodeLanguage', () => {
    it('prefers explicit language and type hints', () => {
        assert.equal(resolveCodeLanguage({language: 'YAML'}), 'yaml')
        assert.equal(resolveCodeLanguage({typeHint: 'properties'}), 'ini')
        assert.equal(resolveCodeLanguage({typeHint: 'application/json'}), 'json')
    })

    it('sniffs filename extensions', () => {
        assert.equal(resolveCodeLanguage({filename: 'app.yml'}), 'yaml')
        assert.equal(resolveCodeLanguage({filename: 'config.xml'}), 'xml')
        assert.equal(resolveCodeLanguage({filename: 'a.b.json'}), 'json')
    })

    it('sniffs content when hints are missing', () => {
        assert.equal(resolveCodeLanguage({content: '{"a":1}'}), 'json')
        assert.equal(resolveCodeLanguage({content: '<?xml version="1.0"?><a/>'}), 'xml')
        assert.equal(resolveCodeLanguage({content: '---\nname: demo\n'}), 'yaml')
        assert.equal(resolveCodeLanguage({content: 'server.port=8080\n'}), 'ini')
    })

    it('falls back to plaintext', () => {
        assert.equal(resolveCodeLanguage({content: 'hello'}), 'plaintext')
        assert.equal(codeLanguageLabel('yaml'), 'YAML')
        assert.equal(codeLanguageLabel('ini'), 'Properties')
    })
})
