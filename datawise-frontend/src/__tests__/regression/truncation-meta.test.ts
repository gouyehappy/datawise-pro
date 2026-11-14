import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {truncateTextWithMeta} from '@/shared/truncation/truncation-meta'
import {AI_SELECTION_MAX_CHARS, truncateAiSelectionText} from '@/features/ai/shared/services/ai-ask.service'
import {CHAT_ATTACHMENT_MAX_CHARS, buildPromptWithAttachments} from '@/features/ai/chat/services/chat-attachment.service'

describe('T-TRUNC-1 TruncationMeta', () => {
    it('truncateTextWithMeta marks oversize text', () => {
        const {text, truncation} = truncateTextWithMeta('abcdef', 4, {unit: 'chars', reason: 'preview'})
        assert.equal(text, 'abcd')
        assert.equal(truncation.truncated, true)
        assert.equal(truncation.originalLength, 6)
        assert.equal(truncation.limit, 4)
        assert.equal(truncation.unit, 'chars')
        assert.equal(truncation.reason, 'preview')
    })

    it('AI selection includes truncation meta', () => {
        const selection = truncateAiSelectionText('a'.repeat(AI_SELECTION_MAX_CHARS + 3))
        assert.equal(selection.truncated, true)
        assert.equal(selection.truncation?.truncated, true)
        assert.equal(selection.truncation?.limit, AI_SELECTION_MAX_CHARS)
        assert.equal(selection.truncation?.unit, 'chars')
    })

    it('chat attachments report truncations when oversize', async () => {
        const body = 'x'.repeat(CHAT_ATTACHMENT_MAX_CHARS + 20)
        const file = new File([body], 'big.sql', {type: 'text/plain'})
        const result = await buildPromptWithAttachments('Explain', [
            {id: '1', name: 'big.sql', file},
        ])
        assert.equal(result.truncations.length, 1)
        assert.equal(result.truncations[0].truncated, true)
        assert.equal(result.truncations[0].limit, CHAT_ATTACHMENT_MAX_CHARS)
        assert.match(result.prompt, /…\(truncated\)/)
    })
})
