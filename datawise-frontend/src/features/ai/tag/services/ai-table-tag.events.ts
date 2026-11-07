export const AI_TABLE_TAGS_CHANGED_EVENT = 'datawise:ai-table-tags-changed'

export function notifyAiTableTagsChanged() {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent(AI_TABLE_TAGS_CHANGED_EVENT))
}
