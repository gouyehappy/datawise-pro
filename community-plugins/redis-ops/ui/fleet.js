/* Redis Ops — fleet */
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

  function filteredInstances() {
    const q = (S.fleetQuery || '').trim().toLowerCase()
    if (!q) return S.instances.slice()
    return S.instances.filter(i => {
      const hay = [i.id, i.name, i.host, String(i.port), i.tags].join(' ').toLowerCase()
      return hay.indexOf(q) >= 0
    })
  }

  function closeInstPicker() {
    if (S.instPicker) S.instPicker.classList.remove('open')
  }

  function renderFleet() {
    const active = S.instances.find(i => i.id === S.activeId)
    const health = active ? S.healthMap[active.id] : null
    const dotCls = health === 'up' ? 'up' : health === 'down' ? 'down' : (active && active.connected ? 'up' : '')
    if (S.instDot) S.instDot.className = 'inst-dot ' + dotCls
    if (S.instPicker) S.instPicker.classList.toggle('solo', S.instances.length <= 1)
    if (S.instLabel) {
      if (active) {
        const addr = (active.host || '') + ':' + (active.port || '')
        S.instLabel.textContent = (active.name && active.name !== addr) ? active.name : addr
        S.instLabel.title = addr + (active.name ? ' · ' + active.name : '')
      } else {
        S.instLabel.textContent = S.instances.length ? '选择实例…' : '无实例'
        S.instLabel.title = ''
      }
    }
    if (S.instMeta) {
      S.instMeta.textContent = S.instances.length > 1
        ? (S.fleetQuery ? filteredInstances().length + '/' : '') + S.instances.length
        : ''
    }
    paintInstIdentity()

    const rows = filteredInstances()
    if (!S.fleetList) return
    if (!rows.length) {
      S.fleetList.innerHTML = '<div class="empty" style="padding:16px 8px">无匹配实例</div>'
      return
    }
    S.fleetList.innerHTML = rows.map(i => {
      const h = S.healthMap[i.id]
      const d = h === 'up' ? 'up' : h === 'down' ? 'down' : (i.connected ? 'up' : '')
      const addr = (i.host || '') + ':' + (i.port || '')
      const label = (i.name && i.name !== addr && i.name !== i.id) ? i.name : addr
      const sub = (i.name && i.name !== addr) ? addr : (i.id && i.id !== addr ? i.id : '')
      return '<button type="button" class="inst-row' + (i.id === S.activeId ? ' active' : '') + '" data-id="' + esc(i.id) + '">'
        + '<span class="inst-dot ' + d + '"></span>'
        + '<span class="inst-main"><span class="iname">' + esc(label) + '</span>'
        + (sub ? '<span class="iend">' + esc(sub) + '</span>' : '') + '</span>'
        + (h ? '<span class="ihealth ' + h + '">' + h + '</span>' : '')
        + '</button>'
    }).join('')
  }

  function paintInstIdentity() {
    if (!S.instIdentity) return
    let html = ''
    if (S.overview) {
      const mode = String(S.overview.connectionMode || S.overview.redisMode || 'standalone').toLowerCase()
      html =
        (mode && mode !== 'standalone' ? '<span class="chip ok">' + esc(mode) + '</span>' : '')
        + '<span class="chip role">' + esc(S.overview.role || '?') + '</span>'
        + '<span class="chip">v' + esc(S.overview.redisVersion) + '</span>'
        + (S.overview.masterName ? '<span class="chip">' + esc(S.overview.masterName) + '</span>' : '')
        + '<span class="chip">' + esc(fmtUptime(S.overview.uptimeSeconds)) + '</span>'
        + '<span class="chip' + (S.overview.aofEnabled ? ' ok' : '') + '">AOF ' + (S.overview.aofEnabled ? 'on' : 'off') + '</span>'
    } else {
      const inst = S.instances.find(i => i.id === S.activeId)
      if (inst) {
        const mode = String(inst.mode || '').toLowerCase()
        html =
          (mode && mode !== 'standalone' ? '<span class="chip ok">' + esc(mode) + '</span>' : '')
          + '<span class="chip">' + esc(inst.host) + ':' + esc(inst.port) + '</span>'
          + parseTags(inst.tags).slice(0, 4).map(t => '<span class="chip">' + esc(t) + '</span>').join('')
      }
    }
    S.instIdentity.innerHTML = html
    S.instIdentity.classList.toggle('has-content', !!html)
  }

  function closeDbPicker() {
    const picker = document.getElementById('dbPicker')
    if (picker) picker.classList.remove('open')
  }

  function currentMode() {
    if (S.overview) {
      return String(S.overview.connectionMode || S.overview.redisMode || 'standalone').toLowerCase()
    }
    const inst = S.instances.find(i => i.id === S.activeId)
    return String((inst && inst.mode) || 'standalone').toLowerCase()
  }

  function renderDbSlot() {
    if (!S.dbSlot) return
    const mode = currentMode()
    const isCluster = mode === 'cluster'
    if (!S.activeId) {
      S.dbSlot.innerHTML = ''
      return
    }
    if (isCluster) {
      S.dbSlot.innerHTML = '<div class="db-picker static"><button type="button" class="db-trigger" disabled title="Cluster 不支持 SELECT">'
        + '<span class="db-k">DB</span><span class="db-v">n/a</span></button></div>'
      return
    }
    const selected = Number(S.activeDb) || 0
    const n = Math.max(1, Math.min(Number(S.databasesCount) || 16, 64))
    let opts = ''
    for (let i = 0; i < n; i++) {
      opts += '<button type="button" class="db-opt' + (selected === i ? ' active' : '') + '" data-db="' + i + '">' + i + '</button>'
    }
    S.dbSlot.innerHTML = '<div class="db-picker" id="dbPicker">'
      + '<button type="button" class="db-trigger" id="dbTrigger" title="切换逻辑库">'
      + '<span class="db-k">DB</span><span class="db-v" id="dbLabel">' + esc(selected) + '</span><span class="db-caret"></span></button>'
      + '<div class="db-panel" id="dbPanel"><div class="db-panel-lab">选择数据库</div>'
      + '<div class="db-grid-pick" id="dbGrid">' + opts + '</div></div></div>'
    bindDbSelect()
  }

  function bindDbSelect() {
    const picker = document.getElementById('dbPicker')
    const trigger = document.getElementById('dbTrigger')
    const grid = document.getElementById('dbGrid')
    if (!picker || !trigger || !grid) return
    trigger.onclick = (e) => {
      e.stopPropagation()
      closeInstPicker()
      if (picker.classList.contains('open')) {
        closeDbPicker()
        return
      }
      picker.classList.add('open')
      document.removeEventListener('click', closeDbPicker)
      setTimeout(() => document.addEventListener('click', closeDbPicker), 0)
    }
    picker.onclick = (e) => e.stopPropagation()
    grid.querySelectorAll('.db-opt').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation()
        closeDbPicker()
        document.removeEventListener('click', closeDbPicker)
        switchDb(Number(btn.dataset.db)).catch(showErr)
      }
    })
  }

  async function switchDb(db) {
    if (!Number.isFinite(db) || db < 0) return
    if (db === Number(S.activeDb)) return
    await invoke('redis/select-db', { database: db })
    S.activeDb = db
    const inst = S.instances.find(i => i.id === S.activeId)
    if (inst) inst.database = db
    if (S.overview) S.overview.database = db
    await remember('redis.db.' + S.activeId, String(db))
    S.overview = null
    S.keyRows = []
    S.selectedKey = null
    S.keyCursor = '0'
    S.keysDone = false
    S.keysPainted = 0
    S.expandedFolders = Object.create(null)
    toast('已切换到 db' + db)
    renderIdentity()
    await RO.nav.loadTab()
  }

  function paintInstIdentityHtml(html) {
    if (!S.instIdentity) return
    S.instIdentity.innerHTML = html || ''
    S.instIdentity.classList.toggle('has-content', !!(html && html.trim()))
  }

  function renderIdentity() {
    const inst = S.instances.find(i => i.id === S.activeId)
    if (S.overview) {
      S.activeDb = Number(S.overview.database) || 0
      if (S.overview.databasesCount) S.databasesCount = S.overview.databasesCount
      const mode = String(S.overview.connectionMode || S.overview.redisMode || 'standalone').toLowerCase()
      paintInstIdentityHtml(
        (mode && mode !== 'standalone' ? '<span class="chip ok">' + esc(mode) + '</span>' : '')
        + '<span class="chip role">' + esc(S.overview.role || '?') + '</span>'
        + '<span class="chip">v' + esc(S.overview.redisVersion) + '</span>'
        + (S.overview.masterName ? '<span class="chip">' + esc(S.overview.masterName) + '</span>' : '')
        + '<span class="chip">' + esc(fmtUptime(S.overview.uptimeSeconds)) + '</span>'
        + '<span class="chip' + (S.overview.aofEnabled ? ' ok' : '') + '">AOF ' + (S.overview.aofEnabled ? 'on' : 'off') + '</span>'
        + '<span class="chip">' + esc((S.overview.host || '') + ':' + (S.overview.port || '')) + '</span>'
      )
      renderDbSlot()
      return
    }
    if (inst) {
      S.activeDb = Number(inst.database) || 0
      const mode = String(inst.mode || '').toLowerCase()
      paintInstIdentityHtml(
        (mode && mode !== 'standalone' ? '<span class="chip ok">' + esc(mode) + '</span>' : '')
        + '<span class="chip">' + esc(inst.host) + ':' + esc(inst.port) + '</span>'
        + parseTags(inst.tags).slice(0, 4).map(t => '<span class="chip">' + esc(t) + '</span>').join('')
      )
      renderDbSlot()
      return
    }
    paintInstIdentityHtml('')
    renderDbSlot()
  }

  async function loadInstances(queryFromServer) {
    const res = await invoke('redis/instances', { query: queryFromServer || '' })
    S.instances = res.instances || []
    if (!S.activeId && res.activeId) S.activeId = res.activeId
    if (S.activeId && !S.instances.some(i => i.id === S.activeId) && S.instances.length) {
      S.activeId = S.instances[0].id
    }
    if (!S.activeId && S.instances.length) S.activeId = S.instances[0].id
    renderFleet()
    return res
  }

  async function selectInstance(id) {
    if (!id || id === S.activeId) return
    S.activeId = id
    await invoke('redis/select', { instanceId: id })
    await remember('redis.lastInstanceId', id)
    S.overview = null
    S.keyRows = []
    S.selectedKey = null
    S.selectedKeys = new Set()
    S.keysSelectMode = false
    S.keyCursor = '0'
    S.keysDone = false
    S.keysPainted = 0
    S.expandedFolders = Object.create(null)
    RO.ops.stopOverviewAutoRefresh()
    const recalledDb = await recall('redis.db.' + id)
    if (recalledDb !== '' && Number.isFinite(Number(recalledDb))) {
      try { await invoke('redis/select-db', { database: Number(recalledDb) }) } catch (e) { /* keep default */ }
      S.activeDb = Number(recalledDb)
      const inst = S.instances.find(i => i.id === id)
      if (inst) inst.database = S.activeDb
    }
    renderFleet()
    await RO.nav.loadTab()
  }

  async function pingAll() {
    setStatus('', '探测中…')
    const res = await invoke('redis/ping-all')
    const results = res.results || []
    results.forEach(r => { S.healthMap[r.id] = r.status })
    renderFleet()
    const up = res.up != null ? res.up : results.filter(r => r.status === 'up').length
    const down = res.down != null ? res.down : results.filter(r => r.status === 'down').length
    setStatus(down > 0 ? 'bad' : 'ok', up + ' up · ' + down + ' down')
    toast('全部探测：' + up + ' 在线 / ' + down + ' 离线')
  }



    RO.fleet = {
      filteredInstances, closeInstPicker, renderFleet, paintInstIdentity, closeDbPicker,
      currentMode, renderDbSlot, bindDbSelect, switchDb, paintInstIdentityHtml, renderIdentity,
      loadInstances, selectInstance, pingAll,
    };

  
})();
