import {sharesApi} from '@/api/modules/shares'

export interface ShareEmbedOptions {
    height?: number
    title?: string
    width?: string
}

/** iframe snippet for Confluence / Notion / wiki paste. */
export function buildShareEmbedSnippet(
    token: string,
    options: ShareEmbedOptions = {},
): string {
    const url = sharesApi.publicPageUrl(token)
    const height = options.height && options.height > 0 ? Math.round(options.height) : 480
    const width = options.width?.trim() || '100%'
    const title = (options.title?.trim() || 'DataWise shared chart').replace(/"/g, "'")
    return `<iframe src="${url}" title="${title}" width="${width}" height="${height}" style="border:0;border-radius:8px" loading="lazy" referrerpolicy="no-referrer"></iframe>`
}

/** Markdown link + iframe for README / Notion / GitHub paste. */
export function buildShareMarkdownEmbedSnippet(
    token: string,
    options: ShareEmbedOptions = {},
): string {
    const url = sharesApi.publicPageUrl(token)
    const title = (options.title?.trim() || 'DataWise shared chart').replace(/[\[\]]/g, '')
    const iframe = buildShareEmbedSnippet(token, options)
    return `[${title}](${url})\n\n${iframe}`
}
