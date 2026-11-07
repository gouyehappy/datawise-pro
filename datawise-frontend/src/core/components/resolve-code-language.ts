/**
 * Resolve a Monaco language id from explicit hint, file name, or content sniff.
 */
export type ResolveCodeLanguageInput = {
    language?: string | null
    /** Nacos `type`, content-type, etc. */
    typeHint?: string | null
    /** e.g. dataId / file name with extension */
    filename?: string | null
    content?: string | null
}

const TYPE_ALIASES: Record<string, string> = {
    yml: 'yaml',
    yaml: 'yaml',
    json: 'json',
    xml: 'xml',
    html: 'html',
    htm: 'html',
    text: 'plaintext',
    txt: 'plaintext',
    plain: 'plaintext',
    plaintext: 'plaintext',
    properties: 'ini',
    props: 'ini',
    ini: 'ini',
    conf: 'ini',
    config: 'ini',
    md: 'markdown',
    markdown: 'markdown',
    js: 'javascript',
    javascript: 'javascript',
    ts: 'typescript',
    typescript: 'typescript',
    sql: 'sql',
    shell: 'shell',
    sh: 'shell',
    bash: 'shell',
}

function normalizeHint(raw: string | null | undefined): string | null {
    if (!raw) return null
    const value = raw.trim().toLowerCase()
    if (!value) return null
    const bare = value.includes('/') ? value.slice(value.lastIndexOf('/') + 1) : value
    return TYPE_ALIASES[bare] ?? (bare in TYPE_ALIASES ? TYPE_ALIASES[bare] : bare)
}

function fromFilename(filename: string | null | undefined): string | null {
    if (!filename) return null
    const base = filename.trim().split(/[\\/]/).pop() ?? ''
    const dot = base.lastIndexOf('.')
    if (dot <= 0 || dot === base.length - 1) return null
    return normalizeHint(base.slice(dot + 1))
}

function fromContent(content: string | null | undefined): string | null {
    if (!content) return null
    const trimmed = content.trim()
    if (!trimmed) return null
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json'
    if (trimmed.startsWith('<?xml') || /^<[a-zA-Z!?]/.test(trimmed)) return 'xml'
    if (trimmed.startsWith('---') || /^[a-zA-Z0-9_.-]+\s*:\s*\S/m.test(trimmed.slice(0, 400))) {
        return 'yaml'
    }
    if (/^[a-zA-Z0-9._-]+\s*=\s*.+$/m.test(trimmed.slice(0, 400))) return 'ini'
    return null
}

export function resolveCodeLanguage(input: ResolveCodeLanguageInput): string {
    return (
        normalizeHint(input.language)
        ?? normalizeHint(input.typeHint)
        ?? fromFilename(input.filename)
        ?? fromContent(input.content)
        ?? 'plaintext'
    )
}

export function codeLanguageLabel(language: string): string {
    const map: Record<string, string> = {
        yaml: 'YAML',
        json: 'JSON',
        xml: 'XML',
        html: 'HTML',
        ini: 'Properties',
        plaintext: 'Text',
        markdown: 'Markdown',
        javascript: 'JavaScript',
        typescript: 'TypeScript',
        sql: 'SQL',
        shell: 'Shell',
    }
    return map[language] ?? language.toUpperCase()
}
