/* Shared log formatting helpers for the workbench UI. */
(function (global) {
  'use strict'

  function pad(n, w) {
    return String(n).padStart(w || 2, '0')
  }

  function formatClock(line) {
    if (line && line.ts) {
      return String(line.ts).replace('T', ' ').replace(/Z$/, '')
    }
    if (line && line.tsMs) {
      const d = new Date(line.tsMs)
      if (Number.isNaN(d.getTime())) return '—'
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
    }
    return '—'
  }

  /** Compact clock for the stream column: HH:mm:ss.mmm */
  function formatClockCompact(line) {
    const full = formatClock(line)
    const match = full.match(/(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/)
    return match ? match[1] : full
  }

  function relativeTime(line) {
    if (!line || !line.tsMs) return ''
    const diff = Date.now() - Number(line.tsMs)
    if (diff < 0) return ''
    if (diff < 5000) return '刚刚'
    if (diff < 60000) return `${Math.floor(diff / 1000)} 秒前`
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
    return `${Math.floor(diff / 86400000)} 天前`
  }

  function maybeJson(text) {
    return /[{[]\s*["{[]/.test(String(text || ''))
  }

  function prettyJson(text) {
    const raw = String(text || '')
    const start = raw.search(/[{[]/)
    if (start < 0) return ''
    try {
      const value = JSON.parse(raw.slice(start))
      if (!value || typeof value !== 'object') return ''
      const prefix = raw.slice(0, start).trim()
      const pretty = JSON.stringify(value, null, 2)
      return prefix ? `${prefix}\n${pretty}` : pretty
    } catch (_) {
      return ''
    }
  }

  function jsonSummary(text) {
    const raw = String(text || '')
    const start = raw.search(/[{[]/)
    if (start < 0) return ''
    try {
      const value = JSON.parse(raw.slice(start))
      if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
      const prefer = ['message', 'msg', 'error', 'sql', 'statement', 'path', 'url', 'code']
      for (const key of prefer) {
        if (value[key] == null) continue
        const snippet = String(value[key]).replace(/\s+/g, ' ').trim()
        if (!snippet) continue
        return `${key}: ${snippet.length > 120 ? `${snippet.slice(0, 120)}…` : snippet}`
      }
      const keys = Object.keys(value).slice(0, 4)
      return `{ ${keys.join(', ')}${Object.keys(value).length > 4 ? ', …' : ''} }`
    } catch (_) {
      return ''
    }
  }

  function messageIsLong(text) {
    const raw = String(text || '')
    if (raw.split('\n').length > 2) return true
    return raw.length > 160
  }

  function previewMessage(text) {
    const raw = String(text || '')
    const summary = jsonSummary(raw)
    if (summary) return summary
    const lines = raw.split('\n').filter((line) => line.trim())
    if (lines.length > 1) {
      const head = lines[0].trim()
      return head.length > 140 ? `${head.slice(0, 140)}…` : `${head} …`
    }
    if (raw.length > 160) return `${raw.slice(0, 160)}…`
    return raw
  }

  function stackPeek(stack) {
    const first = String(stack && stack[0] && stack[0].text || '').trim()
    if (!first) return ''
    return first.length > 88 ? `${first.slice(0, 88)}…` : first
  }

  function sameSecond(aMs, bMs) {
    const a = Number(aMs || 0)
    const b = Number(bMs || 0)
    if (!a || !b) return false
    return Math.floor(a / 1000) === Math.floor(b / 1000)
  }

  global.LogFormat = {
    formatClock,
    formatClockCompact,
    relativeTime,
    maybeJson,
    prettyJson,
    jsonSummary,
    messageIsLong,
    previewMessage,
    stackPeek,
    sameSecond,
  }
})(window)
