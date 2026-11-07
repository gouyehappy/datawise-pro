import type {InjectionKey} from 'vue'
import {inject, provide} from 'vue'
import {useAiTaggedScope} from '@/features/ai/datasource/composables/useAiTaggedScope'

export type AiTaggedScopeContext = ReturnType<typeof useAiTaggedScope>

const AI_TAGGED_SCOPE_KEY: InjectionKey<AiTaggedScopeContext> = Symbol('aiTaggedScope')

export function provideAiTaggedScope() {
    const scope = useAiTaggedScope()
    provide(AI_TAGGED_SCOPE_KEY, scope)
    return scope
}

export function useAiTaggedScopeContext() {
    const scope = inject(AI_TAGGED_SCOPE_KEY, null)
    if (!scope) {
        throw new Error('AiTaggedScope context is not provided')
    }
    return scope
}
