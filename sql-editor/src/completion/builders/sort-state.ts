import type {CompletionSortProfile} from '../completion-phase'
import type {SqlCompletionPlan} from '../grammar/types'
import {sortTextForProfile} from '../completion-phase'

let activePlan: SqlCompletionPlan | null = null

export function setActiveCompletionPlan(plan: SqlCompletionPlan | null): void {
    activePlan = plan
}

export function getActiveSortProfile(): CompletionSortProfile {
    return activePlan?.sortProfile ?? 'column-first'
}

export function completionSort(
    group: 'keyword' | 'snippet' | 'column' | 'alias' | 'table' | 'fkjoin' | 'expand' | 'ai' | 'function' | 'recent',
    index: number,
): string {
    return sortTextForProfile(getActiveSortProfile(), group, index)
}
