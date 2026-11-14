import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    CONSOLE_AI_PROMPT_TIP_SEEN_KEY,
    isConsoleAiPromptTipSeen,
    markConsoleAiPromptTipSeen,
    maybeNotifyConsoleAiPromptTip,
} from '../../features/workspace/services/console-ai-prompt-tip.service.ts'

function memoryStorage(): Storage {
    const map = new Map<string, string>()
    return {
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => {
            map.set(key, value)
        },
        removeItem: (key: string) => {
            map.delete(key)
        },
        clear: () => map.clear(),
        key: () => null,
        length: 0,
    }
}

describe('console-ai-prompt-tip.service', () => {
    it('shows StatusBar tip only once (A3-2)', () => {
        const storage = memoryStorage()
        const messages: string[] = []
        assert.equal(isConsoleAiPromptTipSeen(storage), false)

        const first = maybeNotifyConsoleAiPromptTip(
            (message) => messages.push(message),
            'tip',
            storage,
        )
        assert.equal(first, true)
        assert.deepEqual(messages, ['tip'])
        assert.equal(storage.getItem(CONSOLE_AI_PROMPT_TIP_SEEN_KEY), '1')

        const second = maybeNotifyConsoleAiPromptTip(
            (message) => messages.push(message),
            'tip-again',
            storage,
        )
        assert.equal(second, false)
        assert.deepEqual(messages, ['tip'])
    })

    it('markConsoleAiPromptTipSeen persists the flag', () => {
        const storage = memoryStorage()
        markConsoleAiPromptTipSeen(storage)
        assert.equal(isConsoleAiPromptTipSeen(storage), true)
    })
})
