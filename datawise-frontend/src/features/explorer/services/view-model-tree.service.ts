/** Explorer 视图模型节点 meta：published | draft */
export const VIEW_MODEL_TREE_META = {
    published: 'published',
    draft: 'draft',
} as const

export type ViewModelTreeMeta = typeof VIEW_MODEL_TREE_META[keyof typeof VIEW_MODEL_TREE_META]

export function isViewModelStatusMeta(meta?: string | null): meta is ViewModelTreeMeta {
    return meta === VIEW_MODEL_TREE_META.published || meta === VIEW_MODEL_TREE_META.draft
}

export function viewModelStatusVariant(meta?: string | null): 'success' | 'warn' {
    return meta === VIEW_MODEL_TREE_META.draft ? 'warn' : 'success'
}

export function isViewModelDraftNode(node: {type?: string; meta?: string | null}): boolean {
    return node.type === 'view_model' && node.meta === VIEW_MODEL_TREE_META.draft
}
