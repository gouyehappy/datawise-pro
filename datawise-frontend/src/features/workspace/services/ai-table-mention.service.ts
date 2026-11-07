/** Parse / append @table mentions for console AI context (F-22). */

const MENTION_RE = /@([A-Za-z_][\w.$]*)/g

export function extractAiTableMentions(prompt: string): string[] {
    const found = new Set<string>()
    for (const match of prompt.matchAll(MENTION_RE)) {
        const name = match[1]?.trim()
        if (name) found.add(name)
    }
    return [...found]
}

export function appendAiTableMention(prompt: string, tableName: string): string {
    const name = tableName.trim()
    if (!name) return prompt
    const mention = `@${name}`
    if (extractAiTableMentions(prompt).some((item) => item.toLowerCase() === name.toLowerCase())) {
        return prompt
    }
    const trimmed = prompt.trimEnd()
    if (!trimmed) return `${mention} `
    return `${trimmed} ${mention} `
}

export function buildAiPromptWithTableContext(prompt: string, tables: string[]): string {
    const unique = [...new Set(tables.map((t) => t.trim()).filter(Boolean))]
    if (!unique.length) return prompt
    const header = `Tables in context: ${unique.join(', ')}.`
    return `${header}\n${prompt}`
}
