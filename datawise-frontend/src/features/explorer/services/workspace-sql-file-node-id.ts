/** 与后端 PathSegmentSanitizer.sanitizeFileName 对齐 */
export function normalizeWorkspaceSqlFileName(fileName: string): string {
    let cleaned = fileName
        .trim()
        .replace(/\\/g, '-')
        .replace(/\//g, '-')
        .replace(/[^a-zA-Z0-9._\- \u4e00-\u9fff]/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^\.+/g, '')
        .trim()
    if (!cleaned) cleaned = 'console.sql'
    const withExt = cleaned.toLowerCase().endsWith('.sql') ? cleaned : `${cleaned}.sql`
    return withExt.length > 124 ? withExt.slice(0, 124) : withExt
}

function slugSegment(value: string): string {
    const trimmed = value.trim()
    if (!trimmed) return 'unknown'
    const hasNonAscii = [...trimmed].some((ch) => ch.charCodeAt(0) >= 128)
    let ascii = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    if (!hasNonAscii && ascii.length >= 2) {
        if (ascii.length > 48) ascii = ascii.slice(0, 48)
        return ascii
    }
    let hash = 0
    for (let i = 0; i < trimmed.length; i += 1) {
        hash = (hash * 31 + trimmed.charCodeAt(i)) | 0
    }
    return `u${(hash >>> 0).toString(36)}`
}

function base64UrlEncodeUtf8(text: string): string {
    const bytes = new TextEncoder().encode(text)
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function buildWorkspaceSqlFileNodeId(
    connectionId: string,
    instanceName: string,
    fileName: string,
): string {
    const conn = slugSegment(connectionId)
    const inst = slugSegment(instanceName)
    const fileKey = base64UrlEncodeUtf8(normalizeWorkspaceSqlFileName(fileName).toLowerCase())
    return `ws-file-${conn}-${inst}-${fileKey}`
}
