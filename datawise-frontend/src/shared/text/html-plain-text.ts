/** Convert HTML (e.g. rich-text / script records) to plain text, keeping paragraph breaks. */
export function htmlToPlainText(html: string): string {
    if (!html?.trim()) return ''
    const htmlWithBreaks = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|pre|li|h[1-6]|tr)>/gi, '\n')
        .replace(/<\/(td|th)>/gi, '\t')

    if (typeof DOMParser !== 'undefined') {
        try {
            const doc = new DOMParser().parseFromString(htmlWithBreaks, 'text/html')
            const text = doc.body?.textContent ?? doc.documentElement?.textContent
            if (typeof text === 'string') {
                return normalizePlainText(text)
            }
        } catch {
            // fall through to tag strip
        }
    }
    return normalizePlainText(htmlWithBreaks.replace(/<[^>]+>/g, ''))
}

function normalizePlainText(value: string): string {
    return value
        .replace(/\r\n/g, '\n')
        .replace(/\u00a0/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}
