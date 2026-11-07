/* Redis Ops — ops */
(function () {
  const RO = (window.RO = window.RO || {});

  const esc = (...a) => RO.util.esc(...a);
  const toast = (...a) => RO.util.toast(...a);
  const remember = (...a) => RO.util.remember(...a);
  const recall = (...a) => RO.util.recall(...a);
  const copyText = (...a) => RO.util.copyText(...a);
  const setStatus = (...a) => RO.util.setStatus(...a);
  const shellLoading = (...a) => RO.util.shellLoading(...a);
  const ready = (...a) => RO.util.ready(...a);
  const fmtUptime = (...a) => RO.util.fmtUptime(...a);
  const fmtBytes = (...a) => RO.util.fmtBytes(...a);
  const fmtTime = (...a) => RO.util.fmtTime(...a);
  const fmtTtl = (...a) => RO.util.fmtTtl(...a);
  const ttlClass = (...a) => RO.util.ttlClass(...a);
  const typeLabel = (...a) => RO.util.typeLabel(...a);
  const entryCountHint = (...a) => RO.util.entryCountHint(...a);
  const fmtNum = (...a) => RO.util.fmtNum(...a);
  const memPct = (...a) => RO.util.memPct(...a);
  const parseTags = (...a) => RO.util.parseTags(...a);
  const invoke = (...a) => RO.bridge.invoke(...a);
  const pushLog = (...a) => RO.bridge.pushLog(...a);
  const paintCmdLog = (...a) => RO.bridge.paintCmdLog(...a);
  const updateLogBadge = (...a) => RO.bridge.updateLogBadge(...a);
  const cmdLog = RO.bridge.cmdLog;

    const S = RO.state;

  function loadLog() {
    S.topActions.innerHTML = '<button type="button" class="btn btn-ghost" id="btnClearLogTop">清空</button>'
    S.body.innerHTML =
      '<div class="log-view">'
      + '<div class="log-toolbar">'
      + '<span class="log-title">调用日志</span>'
      + '<span class="log-count" id="cmdLogCount">0</span>'
      + '<span class="log-hint">最新在上 · 最多 120 条</span>'
      + '</div>'
      + '<div class="log-body" id="cmdLogBody"></div></div>'
    const clear = () => {
      cmdLog.length = 0
      paintCmdLog()
      RO.nav.renderNav()
      toast('日志已清空')
    }
    document.getElementById('btnClearLogTop').onclick = clear
    paintCmdLog()
  }

  function metric(k, v, hint, cls) {
    return '<div class="metric ' + (cls || '') + '"><div class="k">' + esc(k) + '</div>'
      + '<div class="v">' + esc(v) + '</div>'
      + (hint ? '<div class="h">' + esc(hint) + '</div>' : '') + '</div>'
  }

  function stopOverviewAutoRefresh() {
    if (S.overviewTimer) {
      clearInterval(S.overviewTimer)
      S.overviewTimer = null
    }
  }

  function scheduleOverviewAutoRefresh() {
    stopOverviewAutoRefresh()
    if (S.overviewRefreshSec <= 0 || S.tab !== 'overview') return
    S.overviewTimer = setInterval(() => {
      if (S.tab !== 'overview' || S.overviewRefreshing || S.loading) return
      refreshOverviewQuiet().catch(() => { /* keep last good snapshot */ })
    }, S.overviewRefreshSec * 1000)
  }

  async function refreshOverviewQuiet() {
    if (S.overviewRefreshing) return
    S.overviewRefreshing = true
    try {
      S.overview = await invoke('redis/overview')
      if (S.tab !== 'overview') return
      RO.fleet.renderIdentity()
      setStatus('ok', 'ready · ' + (S.overview.opsPerSec || 0) + ' ops/s · auto ' + S.overviewRefreshSec + 's')
      paintOverviewBody()
    } finally {
      S.overviewRefreshing = false
    }
  }

  function paintOverviewBody() {
    if (!S.overview) return
    const pct = memPct(S.overview.usedMemoryBytes, S.overview.maxMemoryBytes)
    const hit = Number(S.overview.hitRate) || 0
    const hitCls = hit >= 90 ? 'good' : hit >= 70 ? '' : hit >= 40 ? 'warn' : 'bad'
    const memCls = pct != null && pct > 85 ? 'warn' : ''
    const memHint = pct != null
      ? pct + '% of maxmemory'
      : (Number(S.overview.maxMemoryBytes) > 0 ? ('max ' + (S.overview.maxMemory || '')) : 'maxmemory 未设 · unlimited')
    const blocked = Number(S.overview.blockedClients) || 0
    const clientCls = blocked > 0 ? 'warn' : ''
    const dbsRaw = S.overview.databases || []
    const maxKeys = dbsRaw.reduce((m, d) => Math.max(m, Number(d.keys) || 0), 0) || 1
    const totalDbKeys = dbsRaw.reduce((s, d) => s + (Number(d.keys) || 0), 0) || 1
    const dbs = dbsRaw.map(d => {
      const keys = Number(d.keys) || 0
      const share = Math.round(keys / totalDbKeys * 1000) / 10
      const bar = Math.max(2, Math.round(keys / maxKeys * 100))
      const dbIndex = String(d.name || '').replace(/^db/i, '')
      const isActive = String(S.activeDb) === String(dbIndex)
      return '<button type="button" class="db-card' + (isActive ? ' active' : '') + '" data-db="' + esc(dbIndex) + '" title="切换到 ' + esc(d.name) + '">'
        + '<div class="n">' + esc(d.name) + '</div>'
        + '<div class="mid"><div class="pct">' + share + '% of keys' + (isActive ? ' · current' : '') + '</div>'
        + '<div class="bar" style="--p:' + bar + '"><i></i></div></div>'
        + '<div><div class="s">' + esc(fmtNum(keys)) + '</div>'
        + '<div class="x">expires ' + esc(fmtNum(d.expires)) + '</div></div></button>'
    }).join('') || '<div class="empty">无 keyspace 数据</div>'

    function kpi(lab, val, sub, cls, barP) {
      const bar = barP != null
        ? '<div class="kpi-bar" style="--p:' + Math.min(100, Math.max(0, barP)) + '"><i></i></div>'
        : ''
      return '<div class="kpi ' + (cls || '') + '"><div class="kpi-top"><div class="kpi-lab">' + esc(lab) + '</div></div>'
        + '<div class="kpi-val">' + esc(val) + '</div>'
        + '<div class="kpi-sub">' + esc(sub) + '</div>' + bar + '</div>'
    }

    S.body.innerHTML =
      '<div class="ov">'
      + '<div class="ov-kpis">'
      + kpi('Memory', S.overview.usedMemory || '—', memHint, memCls, pct)
      + kpi('Hit rate', hit.toFixed(1) + '%', 'hits ' + fmtNum(S.overview.keyspaceHits) + ' · misses ' + fmtNum(S.overview.keyspaceMisses), hitCls, hit)
      + kpi('Ops / s', String(S.overview.opsPerSec ?? 0), 'total ' + fmtNum(S.overview.totalCommands), '', null)
      + kpi('Clients', String(S.overview.connectedClients ?? 0), blocked ? ('blocked ' + blocked) : 'no blocked', clientCls, null)
      + '</div>'
      + '<div class="ov-meta">'
      + '<div class="meta-cell"><div class="k">Keys</div><div class="v">' + esc(fmtNum(S.overview.totalKeys || 0)) + '</div>'
        + '<div class="h">expired ' + esc(fmtNum(S.overview.expiredKeys)) + ' · evicted ' + esc(fmtNum(S.overview.evictedKeys)) + '</div></div>'
      + '<div class="meta-cell"><div class="k">Uptime</div><div class="v">' + esc(fmtUptime(S.overview.uptimeSeconds)) + '</div>'
        + '<div class="h" title="' + esc(S.overview.os || '') + '">' + esc(S.overview.os || '—') + '</div></div>'
      + '<div class="meta-cell"><div class="k">Mode</div><div class="v">' + esc(S.overview.redisMode || 'standalone') + '</div>'
        + '<div class="h">role ' + esc(S.overview.role || '') + '</div></div>'
      + '<div class="meta-cell"><div class="k">Last RDB</div><div class="v" style="font-size:13px">' + esc(S.overview.rdbLastSave ? fmtTime(S.overview.rdbLastSave) : '—') + '</div>'
        + '<div class="h">' + (S.overview.aofEnabled ? 'AOF enabled' : 'AOF disabled') + '</div></div>'
      + '</div>'
      + '<div class="panel"><div class="panel-head"><h3>Keyspace</h3><span class="hint">' + dbsRaw.length + ' 个库 · 点击切换</span></div>'
      + '<div class="panel-body"><div class="db-grid">' + dbs + '</div></div></div>'
      + '</div>'
    S.body.querySelectorAll('.db-card[data-db]').forEach(card => {
      card.onclick = () => switchDb(Number(card.dataset.db)).catch(showErr)
    })
  }

  async function loadOverview() {
    S.overview = await invoke('redis/overview')
    RO.fleet.renderIdentity()
    setStatus('ok', 'ready · ' + (S.overview.opsPerSec || 0) + ' ops/s')
    S.topActions.innerHTML =
      '<label class="ov-refresh">自动刷新 <select id="ovRefresh" class="ro-select">'
      + '<option value="0"' + (S.overviewRefreshSec === 0 ? ' selected' : '') + '>关</option>'
      + '<option value="5"' + (S.overviewRefreshSec === 5 ? ' selected' : '') + '>5s</option>'
      + '<option value="10"' + (S.overviewRefreshSec === 10 ? ' selected' : '') + '>10s</option>'
      + '</select></label>'
      + '<button type="button" class="btn btn-ghost" id="btnRefresh">刷新</button>'
      + '<button type="button" class="btn btn-ghost" id="btnDiag">诊断</button>'
    document.getElementById('btnRefresh').onclick = () => RO.nav.loadTab()
    document.getElementById('btnDiag').onclick = () => diagnose().catch(showErr)
    const sel = document.getElementById('ovRefresh')
    if (sel) {
      sel.onchange = async () => {
        S.overviewRefreshSec = Number(sel.value) || 0
        await remember('redis.overviewRefreshSec', String(S.overviewRefreshSec))
        scheduleOverviewAutoRefresh()
        toast(S.overviewRefreshSec ? ('Pulse 每 ' + S.overviewRefreshSec + 's 刷新') : '已关闭自动刷新')
      }
    }
    scheduleOverviewAutoRefresh()
    paintOverviewBody()
  }

  async function loadMemory() {
    const m = await invoke('redis/memory')
    if (!S.overview) S.overview = await invoke('redis/overview')
    RO.fleet.renderIdentity()
    S.topActions.innerHTML = '<button type="button" class="btn btn-ghost" id="btnSample">采样大 key</button>'
      + '<button type="button" class="btn btn-ghost" id="btnRefresh">刷新</button>'
    document.getElementById('btnSample').onclick = () => sampleBig().catch(showErr)
    document.getElementById('btnRefresh').onclick = () => RO.nav.loadTab()

    const pct = memPct(m.usedMemoryBytes, m.maxMemoryBytes)
    const frag = parseFloat(m.fragmentationRatio)
    const fragCls = frag > 1.5 ? 'warn' : frag < 1 ? '' : 'good'
    function mk(lab, val, sub, cls, barP) {
      const bar = barP != null
        ? '<div class="kpi-bar" style="--p:' + Math.min(100, Math.max(0, barP)) + '"><i></i></div>' : ''
      return '<div class="kpi ' + (cls || '') + '"><div class="kpi-top"><div class="kpi-lab">' + esc(lab) + '</div></div>'
        + '<div class="kpi-val">' + esc(val) + '</div>'
        + '<div class="kpi-sub">' + esc(sub) + '</div>' + bar + '</div>'
    }
    S.body.innerHTML =
      '<div class="ov">'
      + '<div class="ov-kpis">'
      + mk('Used', m.usedMemory, 'RSS ' + (m.usedMemoryRss || '—'), pct != null && pct > 85 ? 'warn' : '', pct)
      + mk('Peak', m.usedMemoryPeak || '—', 'policy ' + (m.maxmemoryPolicy || '—'), '', null)
      + mk('Max', m.maxMemoryBytes > 0 ? m.maxMemory : 'unlimited', pct != null ? pct + '% used' : '未设 maxmemory', '', null)
      + mk('Fragmentation', m.fragmentationRatio, 'allocator ' + (m.allocator || '—'), fragCls, null)
      + '</div>'
      + (pct != null
        ? '<div class="panel shrink"><div class="panel-head"><h3>内存压力</h3><span class="hint">' + pct + '%</span></div>'
          + '<div class="panel-body"><div class="gauge-wrap"><div class="gauge-meta"><span>used / maxmemory</span><span>' + pct + '%</span></div>'
          + '<div class="gauge ' + (pct > 85 ? 'hot' : '') + '"><i style="width:' + pct + '%"></i></div></div></div></div>'
        : '')
      + '<div class="panel"><div class="panel-head"><h3>大 key 采样</h3><span class="hint">SCAN + MEMORY USAGE · 不会 KEYS *</span></div>'
      + '<div class="panel-body" id="bigBody"><div class="empty"><div class="empty-title">尚未采样</div><div class="empty-sub">点右上角「采样大 key」开始</div></div></div></div>'
      + '</div>'
  }

  async function sampleBig() {
    const el = document.getElementById('bigBody')
    if (el) el.innerHTML = shellLoading('采样中…')
    const res = await invoke('redis/sample-bigkeys', { sample: 400, top: 25 })
    setStatus('ok', 'sampled ' + res.sampled)
    const rows = res.keys || []
    if (!el) return
    el.innerHTML = rows.length
      ? '<table class="data"><thead><tr><th>Key</th><th>Type</th><th>Size</th></tr></thead><tbody>'
        + rows.map(r => '<tr><td class="mono">' + esc(r.key) + '</td><td><span class="ktype ' + esc(r.type) + '">' + esc(typeLabel(r.type)) + '</span></td><td>' + esc(fmtBytes(r.memoryBytes)) + '</td></tr>').join('')
        + '</tbody></table>'
      : '<div class="empty"><div class="empty-title">未采到 key</div><div class="empty-sub">当前库可能为空，或 MEMORY USAGE 不可用</div></div>'
  }

  function fmtSlowMs(us) {
    const ms = (Number(us) || 0) / 1000
    if (ms >= 1000) return (ms / 1000).toFixed(2) + ' s'
    if (ms >= 100) return ms.toFixed(0) + ' ms'
    if (ms >= 10) return ms.toFixed(1) + ' ms'
    return ms.toFixed(2) + ' ms'
  }

  function fmtSlowRelative(ts) {
    const sec = Number(ts)
    if (!Number.isFinite(sec) || sec <= 0) return '—'
    const ago = Math.max(0, Math.floor(Date.now() / 1000 - sec))
    if (ago < 60) return ago + 's 前'
    if (ago < 3600) return Math.floor(ago / 60) + 'm 前'
    if (ago < 86400) return Math.floor(ago / 3600) + 'h 前'
    return Math.floor(ago / 86400) + 'd 前'
  }

  function slowSeverity(us, slowerThanUs) {
    const d = Number(us) || 0
    const thr = Number(slowerThanUs)
    if (Number.isFinite(thr) && thr > 0) {
      if (d >= thr * 10) return 'bad'
      if (d >= thr * 3) return 'warn'
      return 'mild'
    }
    if (d >= 500000) return 'bad'
    if (d >= 100000) return 'warn'
    return 'mild'
  }

  function slowVerb(r) {
    const v = (r.verb || (String(r.command || '').split(/\s+/)[0] || '')).toUpperCase()
    return v || '?'
  }

  function paintSlowlogList(rows, meta) {
    const list = document.getElementById('slList')
    const countEl = document.getElementById('slShown')
    if (!list) return
    const q = String((document.getElementById('slFilter') || {}).value || '').trim().toLowerCase()
    const sort = (document.getElementById('slSort') || {}).value || 'time'
    let view = rows.slice()
    if (q) {
      view = view.filter(r => String(r.command || '').toLowerCase().includes(q)
        || String(r.verb || '').toLowerCase().includes(q)
        || String(r.id || '').includes(q))
    }
    if (sort === 'duration') view.sort((a, b) => (b.durationUs || 0) - (a.durationUs || 0))
    else view.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0) || (b.id || 0) - (a.id || 0))

    if (countEl) countEl.textContent = String(view.length)

    if (!view.length) {
      list.innerHTML = rows.length
        ? '<div class="empty"><div class="empty-title">无匹配条目</div><div class="empty-sub">试试清空筛选或换关键词</div></div>'
        : '<div class="empty"><div class="empty-title">Slowlog 为空</div><div class="empty-sub">'
          + (meta.slowerThanUs > 0
            ? ('当前阈值 ' + fmtSlowMs(meta.slowerThanUs) + ' · 调低 slowlog-log-slower-than 更容易捕获')
            : '阈值可能偏高，或近期没有慢命令')
          + '</div></div>'
      return
    }

    const maxUs = view.reduce((m, r) => Math.max(m, Number(r.durationUs) || 0), 0) || 1
    list.innerHTML = view.map((r, i) => {
      const us = Number(r.durationUs) || 0
      const sev = slowSeverity(us, meta.slowerThanUs)
      const pct = Math.max(4, Math.round(us / maxUs * 100))
      const verb = slowVerb(r)
      const rest = String(r.command || '').replace(new RegExp('^' + verb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'i'), '')
      return '<article class="sl-row ' + sev + '" data-i="' + i + '" title="点击复制命令">'
        + '<div class="sl-dur">'
        + '<span class="sl-ms">' + esc(fmtSlowMs(us)) + '</span>'
        + '<div class="sl-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div>'
        + '</div>'
        + '<div class="sl-when">'
        + '<span class="sl-rel">' + esc(fmtSlowRelative(r.timestamp)) + '</span>'
        + '<span class="sl-abs" title="#' + esc(r.id) + '">' + esc(fmtTime(r.timestamp)) + '</span>'
        + '</div>'
        + '<div class="sl-cmd">'
        + '<span class="sl-verb">' + esc(verb) + '</span>'
        + '<span class="sl-args mono" title="' + esc(r.command || '') + '">' + esc(rest || '—') + '</span>'
        + '</div>'
        + '<div class="sl-acts">'
        + '<button type="button" class="btn btn-ghost btn-xs" data-act="copy" title="复制命令">复制</button>'
        + '<button type="button" class="btn btn-ghost btn-xs" data-act="console" title="送到 Console">Console</button>'
        + '</div></article>'
    }).join('')

    list.querySelectorAll('.sl-row').forEach(row => {
      const r = view[Number(row.dataset.i)]
      if (!r) return
      row.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-act]')
        if (btn) {
          e.preventDefault()
          e.stopPropagation()
          if (btn.dataset.act === 'copy') {
            if (await copyText(r.command)) toast('已复制命令')
            else toast('无法写入剪贴板')
          } else if (btn.dataset.act === 'console') {
            S.pendingConsoleCmd = r.command || ''
            RO.nav.switchTab('console')
          }
          return
        }
        if (await copyText(r.command)) toast('已复制命令')
        else toast('无法写入剪贴板')
      })
    })
  }

  async function loadSlowlog() {
    const res = await invoke('redis/slowlog', { count: 128 })
    if (!S.overview) try { S.overview = await invoke('redis/overview') } catch (e) { /* */ }
    RO.fleet.renderIdentity()
    S.topActions.innerHTML = '<button type="button" class="btn btn-ghost" id="btnRefresh">刷新</button>'
      + '<button type="button" class="btn btn-danger" id="btnSlowReset">清空</button>'
    document.getElementById('btnRefresh').onclick = () => RO.nav.loadTab()
    document.getElementById('btnSlowReset').onclick = async () => {
      if (!confirm('确认清空 Slowlog？')) return
      await invoke('redis/slowlog-reset')
      toast('Slowlog 已清空')
      RO.nav.loadTab()
    }

    const rows = res.entries || []
    const meta = {
      slowerThanUs: Number(res.slowerThanUs),
      maxLen: Number(res.maxLen),
      len: Number(res.len),
    }
    const durations = rows.map(r => Number(r.durationUs) || 0)
    const maxUs = durations.reduce((m, n) => Math.max(m, n), 0)
    const avgUs = durations.length
      ? Math.round(durations.reduce((s, n) => s + n, 0) / durations.length)
      : 0
    const thrLabel = meta.slowerThanUs > 0 ? fmtSlowMs(meta.slowerThanUs) : '—'
    const lenLabel = Number.isFinite(meta.len) && meta.len >= 0
      ? (meta.maxLen > 0 ? meta.len + ' / ' + meta.maxLen : String(meta.len))
      : String(rows.length)

    S.body.innerHTML =
      '<div class="sl-view">'
      + '<div class="sl-toolbar">'
      + '<span class="sl-title">Slowlog</span>'
      + '<span class="sl-count" id="slShown">' + rows.length + '</span>'
      + '<label class="sl-filter">'
      + '<input type="search" id="slFilter" placeholder="筛选命令 / 动词…" autocomplete="off" />'
      + '</label>'
      + '<select id="slSort" class="ro-select" title="排序">'
      + '<option value="time">最新优先</option>'
      + '<option value="duration">最慢优先</option>'
      + '</select>'
      + '<span class="sl-hint">点击行复制 · Console 一键送入</span>'
      + '</div>'
      + '<div class="sl-kpis">'
      + '<div class="sl-kpi"><div class="k">缓冲</div><div class="v">' + esc(lenLabel) + '</div><div class="h">SLOWLOG LEN</div></div>'
      + '<div class="sl-kpi' + (maxUs >= 500000 ? ' bad' : maxUs >= 100000 ? ' warn' : '') + '"><div class="k">最慢</div><div class="v">' + esc(rows.length ? fmtSlowMs(maxUs) : '—') + '</div><div class="h">本页峰值</div></div>'
      + '<div class="sl-kpi"><div class="k">平均</div><div class="v">' + esc(rows.length ? fmtSlowMs(avgUs) : '—') + '</div><div class="h">' + rows.length + ' 条样本</div></div>'
      + '<div class="sl-kpi"><div class="k">阈值</div><div class="v">' + esc(thrLabel) + '</div><div class="h">log-slower-than</div></div>'
      + '</div>'
      + '<div class="sl-list" id="slList"></div>'
      + '</div>'

    const paint = () => paintSlowlogList(rows, meta)
    document.getElementById('slFilter').oninput = paint
    document.getElementById('slSort').onchange = paint
    paint()
  }

  async function loadClients() {
    const res = await invoke('redis/clients')
    if (!S.overview) try { S.overview = await invoke('redis/overview') } catch (e) { /* */ }
    RO.fleet.renderIdentity()
    S.topActions.innerHTML = '<button type="button" class="btn btn-ghost" id="btnRefresh">刷新</button>'
    document.getElementById('btnRefresh').onclick = () => RO.nav.loadTab()
    const rows = res.clients || []
    S.body.innerHTML = '<div class="panel"><div class="panel-head"><h3>客户端</h3><span class="hint">' + rows.length + ' 个 · 踢掉需确认</span></div>'
      + '<div class="panel-body">' + (rows.length
        ? '<table class="data"><thead><tr><th>Addr</th><th>Name</th><th>Age</th><th>Idle</th><th>Cmd</th><th>DB</th><th></th></tr></thead><tbody>'
          + rows.map(r => '<tr><td class="mono">' + esc(r.addr || '') + '</td><td>' + esc(r.name || '—') + '</td><td>' + esc(r.age || '') + 's</td><td>' + esc(r.idle || '') + 's</td><td class="mono">' + esc(r.cmd || '') + '</td><td>' + esc(r.db || '0') + '</td>'
            + '<td><button type="button" class="btn btn-danger btn-xs" data-addr="' + esc(r.addr || '') + '">踢掉</button></td></tr>').join('')
          + '</tbody></table>'
        : '<div class="empty"><div class="empty-title">暂无客户端</div></div>')
      + '</div></div>'
    S.body.querySelectorAll('button[data-addr]').forEach(btn => {
      btn.onclick = async () => {
        const addr = btn.dataset.addr
        if (!addr) return
        if (!confirm('确认踢掉客户端？\n' + addr)) return
        const res = await invoke('redis/client-kill', { addr })
        toast('已断开 ' + (res.killed || 0) + ' · ' + addr)
        RO.nav.loadTab()
      }
    })
  }

  async function loadReplication() {
    const res = await invoke('redis/replication')
    if (!S.overview) try { S.overview = await invoke('redis/overview') } catch (e) { /* */ }
    RO.fleet.renderIdentity()
    S.topActions.innerHTML = '<button type="button" class="btn btn-ghost" id="btnRefresh">刷新</button>'
    document.getElementById('btnRefresh').onclick = () => RO.nav.loadTab()
    const slaves = res.slaves || []
    const link = res.masterLinkStatus || '—'
    const linkChip = link === 'up' ? 'ok' : (link && link !== '—' ? 'warn' : '')
    S.body.innerHTML =
      '<div class="repl-grid">'
      + '<div class="stat-card"><div class="k">Role</div><div class="v">' + esc(res.role || '?') + '</div></div>'
      + '<div class="stat-card"><div class="k">Master link</div><div class="v"><span class="chip ' + linkChip + '">' + esc(link) + '</span></div></div>'
      + '<div class="stat-card"><div class="k">Master</div><div class="v mono" style="font-size:15px">' + (res.masterHost ? esc(res.masterHost + ':' + res.masterPort) : '—') + '</div></div>'
      + '<div class="stat-card"><div class="k">Connected slaves</div><div class="v">' + esc(res.connectedSlaves || 0) + '</div></div>'
      + '<div class="stat-card"><div class="k">Repl offset</div><div class="v mono" style="font-size:15px">' + esc(fmtNum(res.masterReplOffset)) + '</div></div>'
      + '</div>'
      + '<div class="panel"><div class="panel-head"><h3>Slaves</h3><span class="hint">' + slaves.length + ' entries</span></div>'
      + '<div class="panel-body">' + (slaves.length
        ? '<table class="data"><thead><tr><th>Id</th><th>Info</th></tr></thead><tbody>'
          + slaves.map(s => '<tr><td class="mono">' + esc(s.id) + '</td><td class="mono">' + esc(s.raw) + '</td></tr>').join('')
          + '</tbody></table>'
        : '<div class="empty">当前无 slave 上报（或本实例为 replica）。</div>')
      + '</div></div>'
  }

  async function loadCmdStats() {
    const res = await invoke('redis/commandstats')
    if (!S.overview) try { S.overview = await invoke('redis/overview') } catch (e) { /* */ }
    RO.fleet.renderIdentity()
    S.topActions.innerHTML = '<button type="button" class="btn btn-ghost" id="btnRefresh">刷新</button>'
    document.getElementById('btnRefresh').onclick = () => RO.nav.loadTab()
    const rows = res.stats || []
    const maxCalls = rows.reduce((m, r) => Math.max(m, Number(r.calls) || 0), 0) || 1
    S.body.innerHTML =
      '<div class="panel"><div class="panel-head"><h3>Top commands by calls</h3><span class="hint">' + rows.length + ' commands</span></div>'
      + '<div class="panel-body">' + (rows.length
        ? '<div style="margin-bottom:8px">' + rows.slice(0, 12).map(r => {
            const pct = Math.max(2, Math.round((Number(r.calls) || 0) / maxCalls * 100))
            return '<div class="bar-row"><div class="lbl" title="' + esc(r.command) + '">' + esc(r.command) + '</div>'
              + '<div class="bar-track"><i style="width:' + pct + '%"></i></div>'
              + '<div class="num">' + esc(fmtNum(r.calls)) + '</div></div>'
          }).join('') + '</div>'
          + '<table class="data"><thead><tr><th>Command</th><th>Calls</th><th>Usec</th><th>Usec/call</th></tr></thead><tbody>'
          + rows.map(r => '<tr><td class="mono">' + esc(r.command) + '</td><td>' + esc(fmtNum(r.calls)) + '</td><td>' + esc(fmtNum(r.usec)) + '</td><td>' + esc(r.usecPerCall) + '</td></tr>').join('')
          + '</tbody></table>'
        : '<div class="empty">暂无 commandstats。</div>')
      + '</div></div>'
  }

  async function loadConfig() {
    if (!S.overview) try { S.overview = await invoke('redis/overview') } catch (e) { /* */ }
    RO.fleet.renderIdentity()
    S.topActions.innerHTML = '<button type="button" class="btn btn-ghost" id="btnRefresh">刷新</button>'
    document.getElementById('btnRefresh').onclick = () => doConfigGet().catch(showErr)

    S.body.innerHTML =
      '<div class="panel"><div class="panel-head">'
      + '<h3>CONFIG</h3>'
      + '<div class="toolbar" style="flex:1;margin-left:10px;max-width:420px">'
      + '<input class="grow" id="cfgPattern" placeholder="pattern · 如 maxmemory*" value="' + esc(S.configPattern) + '" />'
      + '<button type="button" class="btn btn-primary" id="btnCfg">查询</button></div></div>'
      + '<div class="panel-body" id="cfgBody">' + shellLoading('查询配置…') + '</div></div>'

    document.getElementById('btnCfg').onclick = () => doConfigGet().catch(showErr)
    document.getElementById('cfgPattern').onkeydown = (e) => {
      if (e.key === 'Enter') doConfigGet().catch(showErr)
    }
    await doConfigGet()
  }

  async function doConfigGet() {
    const input = document.getElementById('cfgPattern')
    S.configPattern = ((input && input.value) || '*').trim() || '*'
    const el = document.getElementById('cfgBody')
    if (el) el.innerHTML = shellLoading('查询配置…')
    const res = await invoke('redis/config-get', { pattern: S.configPattern })
    const rows = res.entries || []
    if (!el) return
    el.innerHTML = rows.length
      ? '<table class="data"><thead><tr><th>Key</th><th>Value</th><th></th></tr></thead><tbody>'
        + rows.map(r => {
          if (r.editable) {
            return '<tr class="cfg-edit-row" data-key="' + esc(r.key) + '">'
              + '<td class="mono">' + esc(r.key) + '</td>'
              + '<td><input class="cfg-val" value="' + esc(r.value) + '" data-orig="' + esc(r.value) + '" /></td>'
              + '<td class="cfg-actions"><button type="button" class="btn btn-ghost btn-xs btn-cfg-set" disabled>SET</button></td></tr>'
          }
          return '<tr><td class="mono">' + esc(r.key) + '</td><td class="mono" style="word-break:break-all">' + esc(r.value) + '</td><td></td></tr>'
        }).join('')
        + '</tbody></table>'
      : '<div class="empty"><div class="empty-title">无匹配项</div><div class="empty-sub">试试 maxmemory* 或 *</div></div>'
    el.querySelectorAll('.cfg-edit-row').forEach(tr => {
      const inp = tr.querySelector('.cfg-val')
      const btn = tr.querySelector('.btn-cfg-set')
      if (!inp || !btn) return
      const sync = () => { btn.disabled = inp.value === inp.dataset.orig }
      sync()
      inp.oninput = sync
      btn.onclick = async () => {
        if (btn.disabled) return
        const key = tr.dataset.key
        const value = inp.value
        if (!confirm('确认 CONFIG SET？\n' + key + ' = ' + value)) return
        await invoke('redis/config-set', { key, value })
        toast('已 SET ' + key)
        inp.dataset.orig = value
        sync()
      }
    })
    setStatus('ok', rows.length + ' config keys')
  }

  async function diagnose() {
    const res = await invoke('redis/diagnose')
    if (await copyText(res.report || '')) toast('诊断报告已复制')
    else toast('诊断完成（无法写入剪贴板）')
    S.termLines = [{ cls: 'muted', text: res.report || '' }]
    if (S.tab === 'console') {
      RO.console.loadConsole()
      return
    }
    RO.nav.switchTab('console')
  }



    RO.ops = {
      loadLog, metric, stopOverviewAutoRefresh, scheduleOverviewAutoRefresh, refreshOverviewQuiet,
      paintOverviewBody, loadOverview, loadMemory, sampleBig, loadSlowlog, loadClients,
      loadReplication, loadCmdStats, loadConfig, doConfigGet, diagnose,
    };

  
})();
