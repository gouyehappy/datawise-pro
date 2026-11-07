import {joinLocalPath, localFileParentPath, normalizeLocalPathKey} from '@/features/local-files/services/local-files-path'
import {readLocalFileDataUrl} from '@/features/local-files/services/local-files.service'

const REMOTE_OR_SPECIAL = /^(https?:|mailto:|data:|file:|#)/i

/** Collect relative image targets from markdown + allowlisted HTML img tags. */
export function collectLocalMarkdownAssetRefs(source: string): string[] {
    const found = new Set<string>()
    const mdImage = /!\[[^\]]*]\(([^)]+)\)/g
    let match: RegExpExecArray | null
    while ((match = mdImage.exec(source)) !== null) {
        const ref = match[1].trim()
        if (ref && !REMOTE_OR_SPECIAL.test(ref)) found.add(ref)
    }
    const htmlImg = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi
    while ((match = htmlImg.exec(source)) !== null) {
        const ref = (match[1] ?? match[2] ?? match[3] ?? '').trim()
        if (ref && !REMOTE_OR_SPECIAL.test(ref)) found.add(ref)
    }
    return [...found]
}

/**
 * Load workspace-local image refs as data URLs (JCEF blocks file:// from http origin).
 * Keys include the original ref, ./ref, and absolute path variants.
 */
export async function loadLocalMarkdownAssetDataUrls(
    markdownPath: string,
    source: string,
): Promise<Record<string, string>> {
    const parent = localFileParentPath(markdownPath)
    if (!parent) return {}
    const refs = collectLocalMarkdownAssetRefs(source)
    if (!refs.length) return {}

    const out: Record<string, string> = {}
    await Promise.all(
        refs.map(async (ref) => {
            const rel = ref.replace(/^\.\//, '')
            const abs = joinLocalPath(parent, rel)
            try {
                const dataUrl = await readLocalFileDataUrl(abs)
                out[ref] = dataUrl
                out[rel] = dataUrl
                out[`./${rel}`] = dataUrl
                out[abs] = dataUrl
                out[normalizeLocalPathKey(abs)] = dataUrl
            } catch {
                /* leave unresolved — preview shows alt text / broken icon */
            }
        }),
    )
    return out
}
