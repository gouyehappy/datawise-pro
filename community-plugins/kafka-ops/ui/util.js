/* Kafka Ops — util.js */
(function () {
  const KO = (window.KO = window.KO || {});
  const state = KO.state;
  const VIEW_FRESH_MS = KO.consts.VIEW_FRESH_MS;
  const VIRT_MIN = KO.consts.VIRT_MIN;
  const TOPIC_ROW_H = KO.consts.TOPIC_ROW_H;
  const GROUP_ROW_H = KO.consts.GROUP_ROW_H;

  const $ = (s, el = document) => el.querySelector(s)

  const $$ = (s, el = document) => [...el.querySelectorAll(s)]

  function ready() { return window.datawisePlugin && window.datawisePlugin.invoke }

  function toast(msg, bad) {
    const el = $('#toast')
    el.textContent = msg
    el.classList.toggle('bad', !!bad)
    el.classList.add('show')
    clearTimeout(toast._t)
    toast._t = setTimeout(() => el.classList.remove('show'), 3200)
  }

  async function copyText(text, label) {
    const v = String(text ?? '')
    if (!v || v === '—') return
    await KO.bridge.clipboard(v)
    toast('已复制' + (label ? ' ' + label : ''))
  }

  function visibleTopicNames() {
    if (state._topicVirtList?.length) return state._topicVirtList.map(t => t.name)
    return $$('#topicList tr[data-name]').map(tr => tr.dataset.name).filter(Boolean)
  }

  function visibleGroupIds() {
    if (state._groupVirtList?.length) return state._groupVirtList.map(g => g.groupId)
    return $$('#groupList .g-row[data-id]').map(el => el.dataset.id).filter(Boolean)
  }

  function mountVirtWindow(box, {
    items, rowH, renderSlice, metaLabel, key,
  }) {
    const total = items.length
    box.innerHTML = `
      <div class="virt" data-virt="${esc(key)}">
        <div class="virt-port">
          <div class="virt-space" style="height:${total * rowH}px">
            <div class="virt-win"></div>
          </div>
        </div>
        <div class="virt-meta"></div>
      </div>`
    const port = box.querySelector('.virt-port')
    const win = box.querySelector('.virt-win')
    const meta = box.querySelector('.virt-meta')
    let raf = 0
    const paint = () => {
      raf = 0
      const vh = port.clientHeight || 300
      const start = Math.max(0, Math.floor(port.scrollTop / rowH) - 6)
      const end = Math.min(total, Math.ceil((port.scrollTop + vh) / rowH) + 6)
      win.style.transform = `translateY(${start * rowH}px)`
      renderSlice(win, start, end)
      if (meta) meta.textContent = metaLabel
        ? metaLabel(start, end, total)
        : `${start + 1}–${end} / ${total}`
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(paint)
    }
    port.addEventListener('scroll', onScroll, { passive: true })
    paint()
    return { paint, port, items }
  }

  function navPick(list, current, delta) {
    if (!list.length) return null
    let i = list.indexOf(current)
    if (i < 0) i = delta > 0 ? -1 : 0
    return list[Math.max(0, Math.min(list.length - 1, i + delta))]
  }

  /** Themed confirm — replaces native window.confirm. Resolves true/false. */
  function askConfirm({ title = '确认', body = '', danger = false, okLabel = '确认', cancelLabel = '取消' } = {}) {
    const dlg = $('#dlgConfirm')
    if (!dlg) return Promise.resolve(false)
    $('#dlgConfirmTitle').textContent = title
    $('#dlgConfirmBody').textContent = body
    dlg.classList.toggle('danger', !!danger)
    const okBtn = $('#dlgConfirmOk')
    const cancelBtn = $('#dlgConfirmCancel')
    okBtn.textContent = okLabel
    okBtn.className = 'btn grow ' + (danger ? 'danger' : 'primary')
    cancelBtn.textContent = cancelLabel

    return new Promise((resolve) => {
      if (dlg.open) {
        try { dlg.close() } catch {}
      }
      let settled = false
      const settle = (ok) => {
        if (settled) return
        settled = true
        okBtn.removeEventListener('click', onOk)
        cancelBtn.removeEventListener('click', onCancel)
        dlg.removeEventListener('cancel', onEsc)
        dlg.removeEventListener('close', onClose)
        if (dlg.open) {
          try { dlg.close() } catch {}
        }
        resolve(!!ok)
      }
      const onOk = (e) => { e.preventDefault(); e.stopPropagation(); settle(true) }
      const onCancel = (e) => { e.preventDefault(); e.stopPropagation(); settle(false) }
      const onEsc = (e) => { e.preventDefault(); settle(false) }
      const onClose = () => settle(false)
      okBtn.addEventListener('click', onOk)
      cancelBtn.addEventListener('click', onCancel)
      dlg.addEventListener('cancel', onEsc)
      dlg.addEventListener('close', onClose)
      dlg.showModal()
      setTimeout(() => { try { okBtn.focus() } catch {} }, 0)
    })
  }

  function shortCluster(c) {
    return c.shortLabel || c.name || (c.bootstrapServers || '').split(',')[0] || c.id
  }

  function sortTopics(list) {
    return [...list].sort((a, b) => {
      const ba = (a.underReplicated || 0) + (a.offline || 0)
      const bb = (b.underReplicated || 0) + (b.offline || 0)
      if (ba !== bb) return bb - ba
      return String(a.name).localeCompare(String(b.name))
    })
  }

  function topicNamespace(name) {
    const s = String(name)
    const sep = s.includes('.') ? '.' : (s.includes('_') ? '_' : (s.includes('-') ? '-' : ''))
    if (!sep) return ''
    const parts = s.split(sep)
    if (parts.length < 3) return ''
    return parts.slice(0, -1).join(sep)
  }

  function fmtBrokers(p) {
    if (Array.isArray(p.replicaBrokers) && p.replicaBrokers.length) {
      return '[' + p.replicaBrokers.map(id => 'b' + id).join(' ') + ']'
    }
    return p.replicas || '—'
  }

  function fmtIsr(p) {
    if (Array.isArray(p.isrBrokers) && p.isrBrokers.length) {
      return '[' + p.isrBrokers.map(id => 'b' + id).join(' ') + ']'
    }
    return p.isr || '—'
  }

  function fmtMsgTs(ts) {
    const n = Number(ts)
    if (!Number.isFinite(n) || n <= 0) return String(ts ?? '—')
    try {
      const d = new Date(n)
      const pad = (x) => String(x).padStart(2, '0')
      return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    } catch { return String(ts) }
  }

  function fmtBytes(n) {
    const v = Number(n) || 0
    if (v < 1024) return v + 'B'
    if (v < 1024 * 1024) return (v / 1024).toFixed(1).replace(/\.0$/, '') + 'KB'
    return (v / (1024 * 1024)).toFixed(1).replace(/\.0$/, '') + 'MB'
  }

  /** Parse payload; unwrap common wrappers like { fromJson: "<json>" }. */
  function parsePayload(raw) {
    if (raw == null || raw === '') return { ok: false, outer: null, inner: null, unwrapped: false }
    let outer = null
    try { outer = typeof raw === 'string' ? JSON.parse(raw) : raw } catch {
      return { ok: false, outer: null, inner: null, unwrapped: false, text: String(raw) }
    }
    if (!outer || typeof outer !== 'object' || Array.isArray(outer)) {
      return { ok: true, outer, inner: outer, unwrapped: false }
    }
    for (const k of ['fromJson', 'payload', 'data', 'body', 'message', 'value']) {
      const v = outer[k]
      if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
        try {
          return { ok: true, outer, inner: JSON.parse(v), unwrapped: true, wrapKey: k }
        } catch {}
      }
      if (v && typeof v === 'object') {
        return { ok: true, outer, inner: v, unwrapped: true, wrapKey: k }
      }
    }
    return { ok: true, outer, inner: outer, unwrapped: false }
  }

  function pickHintFields(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return ''
    const picks = []
    for (const k of ['type', 'Type', 'eventType', 'msgType', 'name', 'id', 'code', 'status', 'action', 'topic']) {
      if (o[k] != null && o[k] !== '') picks.push(`${k}=${o[k]}`)
      if (picks.length >= 2) break
    }
    if (!picks.length) {
      const keys = Object.keys(o).slice(0, 3)
      if (keys.length) picks.push(keys.join(', '))
    }
    return picks.join(' · ')
  }

  function recordHint(raw) {
    const p = parsePayload(raw)
    if (!p.ok) return ''
    return pickHintFields(p.inner) || pickHintFields(p.outer)
  }

  function recordPreview(raw) {
    if (!raw) return '(empty)'
    const p = parsePayload(raw)
    let s
    if (p.ok && p.inner != null) {
      try { s = typeof p.inner === 'string' ? p.inner : JSON.stringify(p.inner) } catch { s = String(raw) }
    } else {
      s = p.text || String(raw)
    }
    s = s.replace(/\s+/g, ' ').trim()
    return s.length > 180 ? s.slice(0, 180) + '…' : s
  }

  function formatValueDisplay(raw) {
    const p = parsePayload(raw)
    if (!p.ok) return { text: String(raw || ''), isJson: false, unwrapped: false }
    try {
      if (p.unwrapped && p.inner != null) {
        return {
          text: JSON.stringify(p.inner, null, 2),
          isJson: true,
          unwrapped: true,
          wrapKey: p.wrapKey,
          outerText: JSON.stringify(p.outer, null, 2),
        }
      }
      return { text: JSON.stringify(p.outer, null, 2), isJson: true, unwrapped: false }
    } catch {
      return { text: String(raw || ''), isJson: false, unwrapped: false }
    }
  }

  function groupStateTone(st) {
    const s = String(st || '').toLowerCase()
    if (s === 'stable') return 'ok'
    if (s.includes('empty')) return 'muted'
    if (s.includes('dead')) return 'bad'
    if (s.includes('rebalance') || s.includes('preparing') || s.includes('completing')) return 'warn'
    if (s === '?' || !s) return 'muted'
    return 'warn'
  }

  function groupStateRank(st) {
    const t = groupStateTone(st)
    return ({ bad: 0, warn: 1, ok: 2, muted: 3 })[t] ?? 4
  }

  function lagTone(n) {
    const v = Number(n) || 0
    if (v <= 0) return 'ok'
    if (v < 1000) return 'warn'
    return 'bad'
  }

  function fmtLag(n) {
    const v = Number(n) || 0
    if (v < 1000) return String(v)
    if (v < 1000000) return (v / 1000).toFixed(v < 10000 ? 1 : 0).replace(/\.0$/, '') + 'k'
    return (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c])
  }

  function debounce(fn, ms, key) {
    clearTimeout(state[key])
    state[key] = setTimeout(fn, ms)
  }

  /** Fuzzy score: subsequence match preferred, else includes. Higher is better; -1 = no match. */
  function fuzzyScore(query, text) {
    const q = String(query || '').trim().toLowerCase()
    const t = String(text || '').toLowerCase()
    if (!q) return 1
    if (t === q) return 1000
    if (t.startsWith(q)) return 800 - Math.min(t.length, 200)
    const idx = t.indexOf(q)
    if (idx >= 0) return 600 - idx
    // subsequence
    let qi = 0, score = 0, last = -1
    for (let i = 0; i < t.length && qi < q.length; i++) {
      if (t[i] === q[qi]) {
        score += (last === i - 1) ? 3 : 1
        last = i
        qi++
      }
    }
    return qi === q.length ? 100 + score : -1
  }

  function highlightMatch(text, query) {
    const q = String(query || '').trim()
    if (!q) return esc(text)
    const t = String(text)
    const idx = t.toLowerCase().indexOf(q.toLowerCase())
    if (idx < 0) return esc(t)
    return esc(t.slice(0, idx)) + '<mark>' + esc(t.slice(idx, idx + q.length)) + '</mark>' + esc(t.slice(idx + q.length))
  }

  /**
   * Searchable combobox. items: [{ value, label, search? }]
   * Returns { setItems, setValue, getValue, close }
   */
  function createCombo(el, { placeholder = '选择…', onChange, maxShow = 80, searchable = true } = {}) {
    if (!el) return null
    if (!searchable) el.classList.add('nosearch')
    el.innerHTML = `
      <button type="button" class="combo-trigger">
        <span class="combo-val placeholder">${esc(placeholder)}</span>
        <span class="combo-caret"></span>
      </button>
      <div class="combo-panel">
        <input class="combo-search" placeholder="模糊搜索…" autocomplete="off" />
        <div class="combo-list"></div>
        <div class="combo-meta"></div>
      </div>`
    const trigger = el.querySelector('.combo-trigger')
    const valEl = el.querySelector('.combo-val')
    const panel = el.querySelector('.combo-panel')
    const search = el.querySelector('.combo-search')
    const list = el.querySelector('.combo-list')
    const meta = el.querySelector('.combo-meta')
    let items = []
    let value = ''
    let activeIdx = 0

    function labelOf(v) {
      const it = items.find(i => String(i.value) === String(v))
      return it ? it.label : (v || '')
    }

    function renderTrigger() {
      if (!value) {
        valEl.className = 'combo-val placeholder'
        valEl.textContent = placeholder
      } else {
        valEl.className = 'combo-val'
        valEl.textContent = labelOf(value)
        valEl.title = labelOf(value)
      }
    }

    function filtered() {
      if (!searchable) {
        return items.map(it => ({ it, s: 1 })).slice(0, maxShow)
      }
      const q = search.value
      const scored = items.map((it) => ({
        it, s: fuzzyScore(q, it.search || it.label || it.value),
      })).filter(x => x.s >= 0)
      scored.sort((a, b) => b.s - a.s || String(a.it.label).localeCompare(String(b.it.label)))
      return scored.slice(0, maxShow)
    }

    function renderList() {
      const rows = filtered()
      if (searchable) {
        meta.textContent = items.length
          ? `显示 ${rows.length} / 共 ${items.length}`
          : '无选项'
      }
      if (!rows.length) {
        list.innerHTML = '<div class="combo-empty">无匹配</div>'
        return
      }
      if (activeIdx >= rows.length) activeIdx = 0
      // mark selected value
      list.innerHTML = rows.map((r, idx) => {
        const selected = String(r.it.value) === String(value)
        return `<button type="button" class="combo-opt ${idx === activeIdx || selected ? 'active' : ''}" data-v="${esc(r.it.value)}" title="${esc(r.it.label)}">${searchable ? highlightMatch(r.it.label, search.value) : esc(r.it.label)}</button>`
      }).join('')
      list.querySelectorAll('.combo-opt').forEach(btn => {
        btn.onmousedown = (e) => e.preventDefault()
        btn.onclick = () => pick(btn.dataset.v)
      })
    }

    function open() {
      document.querySelectorAll('.combo.open').forEach(c => {
        if (c !== el) c.classList.remove('open')
      })
      el.classList.add('open')
      const rect = el.getBoundingClientRect()
      panel.classList.toggle('drop-up', rect.bottom > window.innerHeight - 300)
      if (searchable) search.value = ''
      activeIdx = Math.max(0, items.findIndex(i => String(i.value) === String(value)))
      renderList()
      setTimeout(() => {
        if (searchable) search.focus()
        else trigger.focus()
      }, 0)
    }

    function close() { el.classList.remove('open') }

    function pick(v) {
      value = v == null ? '' : String(v)
      renderTrigger()
      close()
      onChange && onChange(value)
    }

    trigger.onclick = (e) => {
      e.stopPropagation()
      if (el.classList.contains('open')) close()
      else open()
    }
    if (searchable) {
      search.oninput = () => { activeIdx = 0; renderList() }
      search.onkeydown = (e) => {
        const rows = filtered()
        if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, Math.max(rows.length - 1, 0)); renderList() }
        else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); renderList() }
        else if (e.key === 'Enter') { e.preventDefault(); if (rows[activeIdx]) pick(rows[activeIdx].it.value) }
        else if (e.key === 'Escape') close()
      }
    } else {
      trigger.onkeydown = (e) => {
        if (!el.classList.contains('open') && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault(); open(); return
        }
        const rows = filtered()
        if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, Math.max(rows.length - 1, 0)); renderList() }
        else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); renderList() }
        else if (e.key === 'Enter') { e.preventDefault(); if (rows[activeIdx]) pick(rows[activeIdx].it.value) }
        else if (e.key === 'Escape') close()
      }
    }

    return {
      setItems(next) {
        items = (next || []).map(it => typeof it === 'string'
          ? { value: it, label: it, search: it }
          : { value: String(it.value), label: String(it.label ?? it.value), search: it.search || it.label || it.value })
        renderTrigger()
        if (el.classList.contains('open')) renderList()
      },
      setValue(v, silent) {
        value = v == null ? '' : String(v)
        renderTrigger()
        if (!silent && onChange) onChange(value)
      },
      getValue() { return value },
      close,
    }
  }

  // close combos on outside click

  KO.util = Object.assign(KO.util || {}, {
    $,
    $$,
    ready,
    toast,
    copyText,
    visibleTopicNames,
    visibleGroupIds,
    mountVirtWindow,
    navPick,
    askConfirm,
    shortCluster,
    sortTopics,
    topicNamespace,
    fmtBrokers,
    fmtIsr,
    fmtMsgTs,
    fmtBytes,
    parsePayload,
    pickHintFields,
    recordHint,
    recordPreview,
    formatValueDisplay,
    groupStateTone,
    groupStateRank,
    lagTone,
    fmtLag,
    esc,
    debounce,
    fuzzyScore,
    highlightMatch,
    createCombo,
  });
})();
