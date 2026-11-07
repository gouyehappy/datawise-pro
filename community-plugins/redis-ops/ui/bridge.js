/* Redis Ops — bridge */
(function () {
  const RO = (window.RO = window.RO || {});

  const esc = (...a) => RO.util.esc(...a);

    const S = RO.state;

  const cmdLog = []
  const DOCK_SKIP = { 'redis/instances': 1 }

  function pushLog(method, kind, detail) {
    const t = new Date().toLocaleTimeString()
    cmdLog.push({ t, method, kind, detail: String(detail || '').slice(0, 160) })
    if (cmdLog.length > 120) cmdLog.shift()
    if (S.tab === 'log') paintCmdLog()
    updateLogBadge()
  }

  function updateLogBadge() {
    const n = cmdLog.length
    const host = document.querySelector('.nav-btn[data-tab="log"]')
    if (!host) return
    let badge = host.querySelector('.tab-badge')
    if (n) {
      if (badge) badge.textContent = String(n)
      else host.insertAdjacentHTML('beforeend', '<span class="tab-badge">' + n + '</span>')
    } else if (badge) {
      badge.remove()
    }
  }

  function paintCmdLog() {
    const el = document.getElementById('cmdLogBody')
    const count = document.getElementById('cmdLogCount')
    if (count) count.textContent = String(cmdLog.length)
    if (!el) return
    if (!cmdLog.length) {
      el.innerHTML = '<div class="log-empty">尚无调用记录 · 在其他页操作后会出现在这里</div>'
      return
    }
    el.innerHTML = cmdLog.slice().reverse().map(l => {
      const short = String(l.method || '').replace(/^redis\//, '')
      return '<div class="log-line ' + l.kind + '"><span class="t">' + esc(l.t) + '</span>'
        + '<span class="meth" title="' + esc(l.method) + '">' + esc(short) + '</span>'
        + '<span class="m" title="' + esc(l.detail || '') + '">' + esc(l.detail || '') + '</span></div>'
    }).join('')
  }

  async function invoke(method, params) {
    const p = Object.assign({ connectionId: S.connectionId }, params || {})
    if (method.indexOf('redis/') === 0 && S.activeId) {
      p.instanceId = S.activeId
    }
    try {
      const res = await window.datawisePlugin.invoke(method, p)
      if (!DOCK_SKIP[method]) {
        let detail = 'ok'
        if (res && res.blocked) detail = 'blocked'
        else if (method === 'redis/keys') detail = ((res && res.keys && res.keys.length) || 0) + ' keys'
        else if (method === 'redis/command') detail = String((res && res.result) || '').slice(0, 80)
        else if (method === 'redis/ping-all') detail = (res && res.up) + ' up / ' + (res && res.down) + ' down'
        pushLog(method, (res && res.blocked) ? 'err' : 'ok', detail)
      }
      return res
    } catch (e) {
      pushLog(method, 'err', e && e.message ? e.message : e)
      throw e
    }
  }



    RO.bridge = { invoke, pushLog, updateLogBadge, paintCmdLog, get cmdLog() { return cmdLog; }, DOCK_SKIP };

  
})();
