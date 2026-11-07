/**
 * Local-file Markdown preview — shared safe renderer lives in core.
 */
export {
    renderSafeMarkdown as renderLocalMarkdown,
    type RenderSafeMarkdownOptions as RenderLocalMarkdownOptions,
    absolutePathToFileUrl,
} from '@/core/markdown/safe-markdown'

export {
    extractMarkdownOutline,
    buildMarkdownOutlineTree,
    findOutlineIdAtLine,
    type MarkdownOutlineItem,
    type MarkdownOutlineNode,
} from '@/core/markdown/markdown-outline'
