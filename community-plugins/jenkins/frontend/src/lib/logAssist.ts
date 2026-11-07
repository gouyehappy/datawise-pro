/** Pull a short failure hint from console text. */
export function extractFailSummary(log: string, maxLines = 6): string {
  const raw = (log || '').replace(/\r\n/g, '\n')
  if (!raw.trim()) return ''
  const lines = raw.split('\n').map((l) => l.replace(/\s+$/g, '')).filter((l) => l.trim())
  if (!lines.length) return ''

  const interesting = /error|exception|failed|failure|fatal|traceback|caused by|assert|错误|失败/i
  let lastHit = -1
  for (let i = 0; i < lines.length; i++) {
    if (interesting.test(lines[i])) lastHit = i
  }
  const slice =
    lastHit >= 0
      ? lines.slice(Math.max(0, lastHit - 1), Math.min(lines.length, lastHit + maxLines))
      : lines.slice(-maxLines)
  return slice.join('\n').slice(0, 720)
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Case-insensitive highlight; returns HTML safe for log panes. */
export function highlightLogHtml(text: string, query: string): string {
  const escaped = escapeHtml(text || '')
  const q = (query || '').trim()
  if (!q) return escaped
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  try {
    const re = new RegExp(`(${safe})`, 'gi')
    return escaped.replace(re, '<mark class="log-hit">$1</mark>')
  } catch {
    return escaped
  }
}

export function countLogMatches(text: string, query: string): number {
  const q = (query || '').trim()
  if (!q || !text) return 0
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  try {
    const re = new RegExp(safe, 'gi')
    return (text.match(re) || []).length
  } catch {
    return 0
  }
}
