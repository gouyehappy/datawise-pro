import {describe, expect, it} from 'vitest'
import {
    buildAssistantRenderBlocks,
    buildAssistantRenderBlocksCached,
    createAssistantRenderBlocksCache,
    findLastClosedFenceEnd,
} from '@/features/ai/chat/services/ai-chat.service'

describe('assistant render blocks (PERF-02)', () => {
    it('finds the end of the last closed fence', () => {
        expect(findLastClosedFenceEnd('hello')).toBe(0)
        expect(findLastClosedFenceEnd('```sql\nselect 1\n```\ntail')).toBe('```sql\nselect 1\n```'.length)
        expect(findLastClosedFenceEnd('```sql\nselect 1\n```\n```js\nx')).toBe(
            '```sql\nselect 1\n```'.length,
        )
    })

    it('matches full rebuild when not streaming', () => {
        const cache = createAssistantRenderBlocksCache()
        const content = 'intro\n```sql\nselect 1\n```\noutro'
        expect(buildAssistantRenderBlocksCached(content, cache)).toEqual(
            buildAssistantRenderBlocks(content),
        )
    })

    it('reuses sealed fence blocks while the tail grows', () => {
        const cache = createAssistantRenderBlocksCache()
        const fence = '```sql\nselect 1\n```'
        const first = buildAssistantRenderBlocksCached(`${fence}\na`, cache, {streaming: true})
        expect(first.some((block) => block.type === 'code')).toBe(true)
        const sealedCode = first.find((block) => block.type === 'code')
        const second = buildAssistantRenderBlocksCached(`${fence}\nab`, cache, {streaming: true})
        const secondCode = second.find((block) => block.type === 'code')
        expect(secondCode).toBe(sealedCode)
        expect(cache.sealedSource).toBe(fence)
    })
})
