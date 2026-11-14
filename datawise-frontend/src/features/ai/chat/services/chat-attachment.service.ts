import {truncateTextWithMeta, type TruncationMeta} from '@/shared/truncation/truncation-meta'

export type ChatAttachment = {
    id: string
    name: string
    file: File
}

/** Text attachment inline body cap (T-TRUNC-1). */
export const CHAT_ATTACHMENT_MAX_CHARS = 32_000

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

export type ChatAttachmentTextBlock = {
    name: string
    text: string
    truncation: TruncationMeta
}

async function readTextAttachments(items: ChatAttachment[]): Promise<ChatAttachmentTextBlock[]> {
    const results: ChatAttachmentTextBlock[] = []
    for (const item of items) {
        const text = await item.file.text()
        const trimmed = text.trim()
        if (!trimmed) continue
        const {text: sliced, truncation} = truncateTextWithMeta(trimmed, CHAT_ATTACHMENT_MAX_CHARS, {
            unit: 'chars',
            reason: 'token_budget',
        })
        results.push({
            name: item.name,
            text: truncation.truncated ? `${sliced}\n…(truncated)` : sliced,
            truncation,
        })
    }
    return results
}

export async function buildPromptWithAttachments(
    prompt: string,
    attachments: ChatAttachment[],
): Promise<{prompt: string; skipped: string[]; truncations: TruncationMeta[]}> {
    if (!attachments.length) {
        return {prompt, skipped: [], truncations: []}
    }

    const textFiles = attachments.filter((item) => isTextAttachment(item.file))
    const skipped = attachments
        .filter((item) => !isTextAttachment(item.file))
        .map((item) => item.name)

    if (!textFiles.length) {
        return {prompt, skipped: attachments.map((item) => item.name), truncations: []}
    }

    const blocks = await readTextAttachments(textFiles)
    const attachmentSection = blocks
        .map((block) => `--- ${block.name} ---\n${block.text}`)
        .join('\n\n')

    const combined = `${prompt.trim()}\n\n[Attachments]\n${attachmentSection}`.trim()
    return {
        prompt: combined,
        skipped,
        truncations: blocks.map((b) => b.truncation).filter((t) => t.truncated),
    }
}
