/* Redis Ops — nav */
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

  const NAV = [
    { id: 'keys', label: 'Keys', icon: 'keys' },
    { id: 'console', label: 'Console', icon: 'console' },
    { id: 'slowlog', label: 'Slowlog', icon: 'slowlog' },
    { id: 'clients', label: 'Clients', icon: 'clients' },
    { id: 'config', label: 'Config', icon: 'config' },
    { id: 'overview', label: 'Pulse', icon: 'pulse', afterSpacer: true },
    { id: 'memory', label: 'Memory', icon: 'memory' },
    { id: 'replication', label: 'Repl', icon: 'repl' },
    { id: 'cmdstats', label: 'Cmd', icon: 'cmd' },
    { id: 'log', label: 'Log', icon: 'log' }
  ]
  const NAV_IDS = new Set(NAV.map(n => n.id))
  const NAV_ICONS = {
    /* Keys — key */
    keys: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="8" cy="10" r="3.35"/><circle cx="8" cy="10" r="1.15" fill="currentColor" stroke="none" opacity=".32"/><path d="M11.2 10H20.2"/><path d="M17.1 10v2.55M19.35 10V14"/></svg>',
    /* Console — terminal window */
    console: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M12 15h5"/></svg>',
    /* Slowlog — clock + alert */
    slowlog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.2l3.2 1.8"/><path d="M18.8 5.2l1.6-1.6M20.8 7.8h2.2"/></svg>',
    /* Clients — linked sockets */
    clients: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2.5" y="7" width="7" height="10" rx="1.5"/><rect x="14.5" y="7" width="7" height="10" rx="1.5"/><path d="M9.5 12h5M12 9.5v5"/></svg>',
    /* Config — sliders */
    config: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h8M16 17h4"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="14" cy="17" r="2"/></svg>',
    /* Pulse — heartbeat ECG */
    pulse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M2 12h3.5l2-5.5 3.5 11 2.5-7H22"/></svg>',
    /* Memory — chip */
    memory: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5"/><path d="M9 3v3M12 3v3M15 3v3M9 18v3M12 18v3M15 18v3M3 9h3M3 12h3M3 15h3M18 9h3M18 12h3M18 15h3M9 9h6v6H9z"/></svg>',
    /* Repl — master → replica */
    repl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="8" height="7" rx="1.2"/><rect x="13" y="13" width="8" height="7" rx="1.2"/><path d="M11 7.5h3.5M14.5 7.5l-1.4-1.4M14.5 7.5l-1.4 1.4M13 16.5H9.5M9.5 16.5l1.4-1.4M9.5 16.5l1.4 1.4"/></svg>',
    /* Cmd stats — bar chart */
    cmd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19V9M10 19V5M16 19v-7M22 19V8"/><path d="M2 19h20"/></svg>',
    /* Log — scroll / call log */
    log: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M7 3.5h9.5A2.5 2.5 0 0119 6v14.5l-2.2-1.4-2.2 1.4-2.2-1.4-2.2 1.4-2.2-1.4V6A2.5 2.5 0 017 3.5z"/><path d="M9.5 8h6M9.5 11.5h6M9.5 15h4"/></svg>'
  }
  function renderNav() {
    const nav = document.getElementById('tabs')
    if (!nav) return
    const parts = []
    NAV.forEach(n => {
      if (n.afterSpacer) parts.push('<div class="rail-spacer"></div>')
      const active = n.id === S.tab
      const badge = (n.id === 'log' && cmdLog.length)
        ? '<span class="tab-badge">' + cmdLog.length + '</span>' : ''
      parts.push(
        '<button type="button" class="nav-btn' + (active ? ' active' : '') + '" data-tab="' + n.id + '"'
        + ' title="' + esc(n.label) + '" aria-label="' + esc(n.label) + '"'
        + ' aria-selected="' + (active ? 'true' : 'false') + '">'
        + (NAV_ICONS[n.icon] || '') + badge + '</button>'
      )
    })
    nav.innerHTML = parts.join('')
  }

  function switchTab(next) {
    if (!NAV_IDS.has(next)) return
    RO.fleet.closeInstPicker()
    RO.fleet.closeDbPicker()
    if (next === S.tab) {
      if (next === 'console') {
        const c = document.getElementById('cmd')
        if (c) c.focus()
      } else if (next === 'keys') {
        const f = document.getElementById('keyFilter')
        if (f) f.focus()
      }
      return
    }
    S.tab = next
    remember('redis.lastTab', S.tab)
    renderNav()
    loadTab()
  }

  function showErr(e) {
    setStatus('bad', '错误')
    S.body.classList.remove('busy')
    S.body.innerHTML =
      '<div class="err-panel">'
      + '<div class="err-title">加载失败</div>'
      + '<div class="err-msg">' + esc(e && e.message ? e.message : e) + '</div>'
      + '<button type="button" class="btn btn-primary" id="btnRetry">重试</button></div>'
    const btn = document.getElementById('btnRetry')
    if (btn) btn.onclick = () => loadTab()
  }

  async function loadTab() {
    if (S.loading) {
      S.pendingTab = S.tab
      return
    }
    S.loading = true
    S.body.classList.add('busy')
    if (S.tab !== 'overview' && S.tab !== 'keys' && S.tab !== 'console' && S.tab !== 'log') {
      S.body.innerHTML = shellLoading('加载 ' + (NAV.find(n => n.id === S.tab)?.label || S.tab) + '…')
    }
    if (S.tab !== 'overview') RO.ops.stopOverviewAutoRefresh()
    try {
      if (!S.activeId && S.instances.length) S.activeId = S.instances[0].id
      if (S.tab === 'overview') await RO.ops.loadOverview()
      else if (S.tab === 'memory') await RO.ops.loadMemory()
      else if (S.tab === 'slowlog') await RO.ops.loadSlowlog()
      else if (S.tab === 'clients') await RO.ops.loadClients()
      else if (S.tab === 'replication') await RO.ops.loadReplication()
      else if (S.tab === 'cmdstats') await RO.ops.loadCmdStats()
      else if (S.tab === 'config') await RO.ops.loadConfig()
      else if (S.tab === 'keys') await RO.keys.loadKeys(false)
      else if (S.tab === 'log') RO.ops.loadLog()
      else RO.console.loadConsole()
    } catch (e) {
      showErr(e)
    } finally {
      S.body.classList.remove('busy')
      S.loading = false
      if (S.pendingTab && S.pendingTab !== S.tab) {
        const next = S.pendingTab
        S.pendingTab = null
        S.tab = next
        renderNav()
        loadTab()
      } else {
        S.pendingTab = null
      }
    }
  }



    RO.nav = { renderNav, switchTab, loadTab, showErr, NAV, NAV_IDS };

  
})();
