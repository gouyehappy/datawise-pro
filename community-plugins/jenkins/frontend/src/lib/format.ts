export function formatDuration(ms?: number | null): string {
  if (!ms || ms <= 0) return '—'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

/** Elapsed wall time from a start timestamp (for running builds). */
export function formatElapsed(startedAt?: number | null): string {
  if (!startedAt || startedAt <= 0) return '—'
  return formatDuration(Math.max(0, Date.now() - startedAt))
}

export function formatRelative(ms?: number | null, locale = 'zh-CN'): string {
  if (!ms || ms <= 0) return '—'
  const diff = Math.max(0, Date.now() - ms)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return locale.startsWith('zh') ? '刚刚' : 'just now'
  if (minutes < 60) return locale.startsWith('zh') ? `${minutes} 分钟前` : `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return locale.startsWith('zh') ? `${hours} 小时前` : `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 14) return locale.startsWith('zh') ? `${days} 天前` : `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 9) return locale.startsWith('zh') ? `${weeks} 周前` : `${weeks}w ago`
  return locale.startsWith('zh') ? `${Math.floor(days / 30)} 月前` : `${Math.floor(days / 30)}mo ago`
}

export function formatTime(ms?: number | null): string {
  if (!ms || ms <= 0) return '—'
  return new Date(ms).toLocaleString()
}

export function formatBytes(n?: number | null): string {
  if (n == null || !Number.isFinite(n) || n < 0) return ''
  if (n < 1024) return `${Math.round(n)} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}

export type StatusTone = 'ok' | 'bad' | 'warn' | 'run' | 'muted'

export function statusFromJob(color?: string | null, result?: string | null, building?: boolean): {
  tone: StatusTone
  key: 'building' | 'success' | 'failure' | 'unstable' | 'aborted' | 'disabled' | 'notBuilt' | 'unknown'
} {
  if (building || (color || '').endsWith('_anime')) return { tone: 'run', key: 'building' }
  const r = (result || '').toUpperCase()
  const c = (color || '').toLowerCase()
  if (r === 'SUCCESS' || c.startsWith('blue')) return { tone: 'ok', key: 'success' }
  if (r === 'FAILURE' || r === 'FAILED' || c.startsWith('red')) return { tone: 'bad', key: 'failure' }
  if (r === 'UNSTABLE' || c.startsWith('yellow')) return { tone: 'warn', key: 'unstable' }
  if (r === 'ABORTED' || c.startsWith('aborted')) return { tone: 'muted', key: 'aborted' }
  if (c === 'disabled') return { tone: 'muted', key: 'disabled' }
  if (c.startsWith('notbuilt') || r === 'NOT_BUILT') return { tone: 'muted', key: 'notBuilt' }
  return { tone: 'muted', key: 'unknown' }
}

/** Jenkins "weather" heuristic from ball color. */
export function weatherFromColor(color?: string | null): 'sun' | 'cloud' | 'rain' | 'storm' | 'off' {
  const c = (color || '').toLowerCase().replace(/_anime$/, '')
  if (!c || c === 'notbuilt' || c === 'disabled') return 'off'
  if (c === 'blue') return 'sun'
  if (c === 'yellow') return 'cloud'
  if (c === 'red') return 'rain'
  if (c === 'aborted') return 'storm'
  return 'cloud'
}

export function paramKind(type?: string | null): 'boolean' | 'choice' | 'password' | 'text' | 'string' {
  const v = (type || '').toLowerCase()
  if (v.includes('boolean')) return 'boolean'
  if (v.includes('choice')) return 'choice'
  if (v.includes('password')) return 'password'
  if (v.includes('text')) return 'text'
  return 'string'
}
