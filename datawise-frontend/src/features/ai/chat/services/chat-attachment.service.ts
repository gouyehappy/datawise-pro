export type ChatAttachment = {
    id: string
    name: string
    file: File
}

export const TEXT_ATTACHMENT_EXTENSIONS = [
    '.txt',
    '.md',
    '.sql',
    '.csv',
    '.json',
    '.xml',
    '.yaml',
    '.yml',
    '.log',
] as const

const TEXT_ATTACHMENT_EXT_SET = new Set<string>(TEXT_ATTACHMENT_EXTENSIONS)

/** HTML file-input accept list for text attachments. */
export const TEXT_ATTACHMENT_ACCEPT = [
    ...TEXT_ATTACHMENT_EXTENSIONS,
    'text/*',
    'application/json',
    'application/xml',
].join(',')

const TEXT_ATTACHMENT_MIME_PREFIXES = ['text/', 'application/json', 'application/xml']

export function isTextAttachment(file: File): boolean {
    const lower = file.name.toLowerCase()
    for (const ext of TEXT_ATTACHMENT_EXT_SET) {
        if (lower.endsWith(ext)) return true
    }
    if (file.type && TEXT_ATTACHMENT_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix))) {
        return true
    }
    return false
}

async function readTextAttachments(items: ChatAttachment[]): Promise<Array<{ name: string; text: string }>> {
    const results: Array<{ name: string; text: string }> = []
    for (const item of items) {
        const text = await item.file.text()
        const trimmed = text.trim()
        if (!trimmed) continue
        const maxLen = 32_000
        results.push({
            name: item.name,
            text: trimmed.length > maxLen ? `${trimmed.slice(0, maxLen)}\n…(truncated)` : trimmed,
        })
    }
    return results
}

export async function buildPromptWithAttachments(
    prompt: string,
    attachments: ChatAttachment[],
): Promise<{ prompt: string; skipped: string[] }> {
    if (!attachments.length) {
        return {prompt, skipped: []}
    }

    const textFiles = attachments.filter((item) => isTextAttachment(item.file))
    const skipped = attachments
        .filter((item) => !isTextAttachment(item.file))
        .map((item) => item.name)

    if (!textFiles.length) {
        return {prompt, skipped: attachments.map((item) => item.name)}
    }

    const blocks = await readTextAttachments(textFiles)
    const attachmentSection = blocks
        .map((block) => `--- ${block.name} ---\n${block.text}`)
        .join('\n\n')

    const combined = `${prompt.trim()}\n\n[Attachments]\n${attachmentSection}`.trim()
    return {prompt: combined, skipped}
}
