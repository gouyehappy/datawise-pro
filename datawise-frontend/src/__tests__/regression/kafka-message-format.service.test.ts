import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    isStructuredMessageValue,
    summarizeMessageValue,
    tryFormatMessageValue,
} from '@/features/explorer/services/kafka-message-format.service'

describe('kafka-message-format.service', () => {
    it('pretty-prints JSON objects', () => {
        const raw = '{"a":1,"b":"x"}'
        assert.equal(tryFormatMessageValue(raw), JSON.stringify({a: 1, b: 'x'}, null, 2))
    })

    it('unwraps JSON string payloads', () => {
        const inner = JSON.stringify({event: 'order', id: 1})
        const raw = JSON.stringify(inner)
        assert.equal(tryFormatMessageValue(raw), JSON.stringify({event: 'order', id: 1}, null, 2))
    })

    it('unescapes literal escape sequences before parsing', () => {
        const raw = '{\\n\\t\\"id\\": 1,\\n\\t\\"name\\": \\"demo\\"\\n}'
        const formatted = tryFormatMessageValue(raw)
        assert.match(formatted, /"id": 1/)
        assert.doesNotMatch(formatted, /\\n/)
        assert.equal(isStructuredMessageValue(raw), true)
    })

    it('summarizes formatted values on one line', () => {
        const raw = '{"id":1,"name":"demo"}'
        assert.equal(summarizeMessageValue(raw, 40), '{ "id": 1, "name": "demo" }')
    })
})
