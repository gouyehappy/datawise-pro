/* Kafka Ops — bridge.js */
(function () {
  const KO = (window.KO = window.KO || {});
  const state = KO.state;
  const $ = (...a) => KO.util.$(...a);
  const $$ = (...a) => KO.util.$$(...a);
  const VIEW_FRESH_MS = KO.consts.VIEW_FRESH_MS;
  const VIRT_MIN = KO.consts.VIRT_MIN;
  const TOPIC_ROW_H = KO.consts.TOPIC_ROW_H;
  const GROUP_ROW_H = KO.consts.GROUP_ROW_H;

  const WRITE_METHODS = new Set([
    'kafka/topic-create', 'kafka/topic-delete', 'kafka/topic-config-set',
    'kafka/produce', 'kafka/group-delete', 'kafka/reset-offsets',
  ])

  const DANGER_METHODS = new Set([
    'kafka/topic-delete', 'kafka/produce', 'kafka/group-delete', 'kafka/reset-offsets',
  ])

  async function storeSet(k, v) {
    try { if (window.datawisePlugin?.storage) await window.datawisePlugin.storage.set(k, String(v)) } catch {}
  }

  async function storeGet(k) {
    try { return window.datawisePlugin?.storage ? ((await window.datawisePlugin.storage.get(k)) || '') : '' } catch { return '' }
  }

  async function clipboard(t) {
    if (window.datawisePlugin?.clipboard?.writeText) await window.datawisePlugin.clipboard.writeText(String(t ?? ''))
    else await navigator.clipboard?.writeText?.(String(t ?? ''))
  }

  function logCall(method, ok, detail) {
    const short = String(method || '').replace(/^kafka\//, '')
    let kind = 'read'
    if (DANGER_METHODS.has(method)) kind = 'danger'
    else if (WRITE_METHODS.has(method)) kind = 'write'
    state.logs.unshift({
      t: new Date().toLocaleTimeString(),
      method,
      short,
      ok: !!ok,
      kind,
      detail: String(detail || '').slice(0, 240),
    })
    if (state.logs.length > 200) state.logs.length = 200
    if (state.view === 'guard') KO.guard.renderLog()
    else updateGuardLogBadge()
  }

  function updateGuardLogBadge() {
    const n = state.logs.length
    const err = state.logs.filter(l => !l.ok).length
    const el = $('#logBadge')
    if (el) el.textContent = n ? (err ? `${n} · ${err} 失败` : `${n}`) : ''
  }

  async function invoke(method, params = {}, opts = {}) {
    if (!KO.util.ready()) throw new Error('datawisePlugin 未就绪')
    const p = { ...params }
    if (state.connectionId) p.connectionId = state.connectionId
    if (state.activeId) p.clusterId = state.activeId
    const quiet = opts.quiet || state.quietInvoke
    try {
      const res = await window.datawisePlugin.invoke(method, p)
      if (!quiet) logCall(method, true, '')
      return res
    } catch (e) {
      if (!quiet) logCall(method, false, e.message || e)
      throw e
    }
  }

  function setStatus(text, kind) {
    const el = $('#connStatus')
    el.className = 'status' + (kind ? ' ' + kind : '')
    el.querySelector('span').textContent = text
  }

  function markRefresh(label) {
    const el = $('#lastRefresh')
    if (!el) return
    const t = new Date().toLocaleTimeString()
    el.textContent = t
    el.title = (label ? label + ' · ' : '') + '上次刷新 ' + t
  }

  KO.bridge = Object.assign(KO.bridge || {}, {
    storeSet,
    storeGet,
    clipboard,
    logCall,
    updateGuardLogBadge,
    invoke,
    setStatus,
    markRefresh,
  });
})();
