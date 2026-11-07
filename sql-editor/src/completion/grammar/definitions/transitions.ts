import type {SqlCompletionContext} from '../../context'
import type {TransitionId} from './types'
import {hasSignal} from '../engine/signals'

/** 评估转移条件 — 只读 ctx.signals，不再读散落 bool */
export function evaluateTransition(when: TransitionId, ctx: SqlCompletionContext): boolean {
    if (when === 'always') return true
    return hasSignal(ctx, when)
}

export {PREDICATE_CHAIN_STATES} from './transitions-predicate'
export type {TransitionId} from './types'
