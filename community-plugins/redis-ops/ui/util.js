/* Redis Ops — util */
(function () {
  const RO = (window.RO = window.RO || {});

    const S = RO.state;

  function shellLoading(msg) {
    return '<div class="boot"><span class="key-spin" aria-hidden="true"></span><span>' + esc(msg || '加载中…') + '</span></div>'
  }

  function ready() { return window.datawisePlugin && window.datawisePlugin.invoke }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]))
  }

  function toast(m) {
    S.toastEl.textContent = m
    S.toastEl.classList.add('show')
    clearTimeout(S.toastTimer)
    S.toastTimer = setTimeout(() => S.toastEl.classList.remove('show'), 2600)
  }

  async function remember(k, v) {
    try {
      if (window.datawisePlugin.storage) await window.datawisePlugin.storage.set(k, String(v))
    } catch (e) { /* ignore */ }
  }

  async function recall(k) {
    try {
      return window.datawisePlugin.storage ? ((await window.datawisePlugin.storage.get(k)) || '') : ''
    } catch (e) { return '' }
  }

  async function copyText(t) {
    if (window.datawisePlugin && window.datawisePlugin.clipboard && window.datawisePlugin.clipboard.writeText) {
      await window.datawisePlugin.clipboard.writeText(String(t ?? ''))
      return true
    }
    return false
  }

  function setStatus(kind, text) {
    S.statusEl.className = 'status' + (kind === 'ok' ? ' ok' : kind === 'bad' ? ' bad' : '')
    S.statusText.textContent = text
  }

  function fmtUptime(sec) {
    sec = Number(sec) || 0
    const d = Math.floor(sec / 86400)
    const h = Math.floor((sec % 86400) / 3600)
    const m = Math.floor((sec % 3600) / 60)
    if (d > 0) return d + 'd ' + h + 'h'
    if (h > 0) return h + 'h ' + m + 'm'
    return m + 'm'
  }

  function fmtBytes(n) {
    n = Number(n) || 0
    if (n < 1024) return n + ' B'
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB'
    return (n / 1073741824).toFixed(2) + ' GB'
  }

  function fmtTime(ts) {
    if (!ts) return '—'
    try { return new Date(ts * 1000).toLocaleString() } catch (e) { return String(ts) }
  }

  function fmtTtl(sec) {
    const t = Number(sec)
    if (!Number.isFinite(t) || t < 0) return '∞'
    if (t < 60) return t + 's'
    if (t < 3600) return Math.floor(t / 60) + 'm'
    if (t < 86400) {
      const h = Math.floor(t / 3600)
      const m = Math.floor((t % 3600) / 60)
      return m ? h + 'h' + m + 'm' : h + 'h'
    }
    const d = Math.floor(t / 86400)
    const h = Math.floor((t % 86400) / 3600)
    return h ? d + 'd' + h + 'h' : d + 'd'
  }

  function ttlClass(sec) {
    const t = Number(sec)
    if (!Number.isFinite(t) || t < 0) return ''
    if (t <= 60) return 'hot'
    if (t <= 3600) return 'warn'
    return ''
  }

  function typeLabel(type) {
    const t = String(type || '?').toLowerCase()
    const map = { string: 'STR', hash: 'HASH', list: 'LIST', set: 'SET', zset: 'ZSET', stream: 'STM' }
    return map[t] || t.slice(0, 4).toUpperCase()
  }

  function entryCountHint(d) {
    const n = (d.entries && d.entries.length) || 0
    if (d.type === 'stream' && d.streamLength != null) return 'XLEN ' + d.streamLength + (n ? ' · 显示 ' + n : '')
    if (!n) return '空'
    if (d.type === 'hash') return n + ' fields'
    if (d.type === 'list') return n + ' elements'
    if (d.type === 'set' || d.type === 'zset') return n + ' members'
    return String(n)
  }

  function fmtNum(n) {
    n = Number(n) || 0
    return n.toLocaleString()
  }

  function memPct(used, max) {
    used = Number(used) || 0
    max = Number(max) || 0
    if (max <= 0) return null
    return Math.min(100, Math.round(used / max * 1000) / 10)
  }

  function parseTags(tags) {
    if (!tags) return []
    if (Array.isArray(tags)) return tags.map(String).filter(Boolean)
    return String(tags).split(/[,;\s]+/).map(s => s.trim()).filter(Boolean)
  }



    RO.util = {
      shellLoading, ready, esc, toast, remember, recall, copyText, setStatus,
      fmtUptime, fmtBytes, fmtTime, fmtTtl, ttlClass, typeLabel, entryCountHint, fmtNum, memPct, parseTags,
    };

  
})();
