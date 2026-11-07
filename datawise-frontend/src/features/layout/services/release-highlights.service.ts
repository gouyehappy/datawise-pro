export type ReleaseHighlightScope = 'dashboard' | 'platform'

export type ReleaseHighlightAction =
    | 'open_federated_wizard'
    | 'open_sql_console'
    | 'open_ai'

export interface ReleaseHighlightCard {
    id: string
    action?: ReleaseHighlightAction
}

export const RELEASE_HIGHLIGHTS_VERSION = 'v4.1.7'

export const RELEASE_HIGHLIGHT_CARDS: ReleaseHighlightCard[] = [
    {id: 'federatedJoin', action: 'open_federated_wizard'},
    {id: 'sqlReviewExplain', action: 'open_sql_console'},
    {id: 'firstInsight', action: 'open_ai'},
]

function dismissedKey(scope: ReleaseHighlightScope): string {
    return `dw-cli-release-highlights-dismissed:${scope}:${RELEASE_HIGHLIGHTS_VERSION}`
}

export function isReleaseHighlightsDismissed(scope: ReleaseHighlightScope, storage: Storage = localStorage): boolean {
    return storage.getItem(dismissedKey(scope)) === '1'
}

export function markReleaseHighlightsDismissed(scope: ReleaseHighlightScope, storage: Storage = localStorage): void {
    storage.setItem(dismissedKey(scope), '1')
}

