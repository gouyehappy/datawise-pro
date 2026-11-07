/** Pretty-print JSON text; throws SyntaxError (or TypeError) on invalid input. */
export function formatLocalJson(text: string, spaces = 2): string {
    const trimmed = text.trim()
    if (!trimmed) {
        throw new SyntaxError('empty_json')
    }
    const parsed = JSON.parse(trimmed) as unknown
    return `${JSON.stringify(parsed, null, spaces)}\n`
}
