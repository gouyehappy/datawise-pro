import {formatBytes} from '@/features/settings/services/system-metrics-format.service'

/** Native `title` tooltip: path, plus size/mtime when available. */
export function formatLocalFileTooltip(
    node: {path: string; isDirectory: boolean; size: number; mtimeMs: number},
    locale?: string,
): string {
    const lines = [node.path]
    const meta: string[] = []
    if (!node.isDirectory && Number.isFinite(node.size) && node.size >= 0) {
        meta.push(formatBytes(node.size))
    }
    if (Number.isFinite(node.mtimeMs) && node.mtimeMs > 0) {
        meta.push(new Date(node.mtimeMs).toLocaleString(locale || undefined))
    }
    if (meta.length) lines.push(meta.join(' · '))
    return lines.join('\n')
}
