import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {normalizeLlmBaseUrl} from '@/shared/api/internal/llm-base-url'

describe('bug-027-llm-base-url-normalize', () => {
    it('strips trailing /v1 so Spring AI does not double-append path', () => {
        assert.equal(normalizeLlmBaseUrl('https://api.openai.com/v1'), 'https://api.openai.com')
        assert.equal(normalizeLlmBaseUrl('https://api.openai.com/v1/'), 'https://api.openai.com')
    })

    it('strips full /v1/chat/completions endpoint if pasted', () => {
        assert.equal(
            normalizeLlmBaseUrl('https://api.openai.com/v1/chat/completions'),
            'https://api.openai.com',
        )
    })

    it('keeps host-only base urls unchanged', () => {
        assert.equal(normalizeLlmBaseUrl('https://api.deepseek.com'), 'https://api.deepseek.com')
    })
})
