/* Redis Ops — app */
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

    RO.initDom();
  function isEditableTarget(el) {
    if (!el) return false
    const tag = (el.tagName || '').toLowerCase()
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
    if (el.isContentEditable) return true
    return false
  }

  function bindChrome() {
    document.getElementById('tabs').onclick = (e) => {
      const btn = e.target.closest('[data-tab]')
      if (!btn) return
      e.preventDefault()
      e.stopPropagation()
      RO.nav.switchTab(btn.dataset.tab)
    }
    const trigger = document.getElementById('instTrigger')
    const panel = document.getElementById('instPanel')
    if (trigger && S.instPicker) {
      trigger.onclick = (e) => {
        e.stopPropagation()
        RO.fleet.closeDbPicker()
        if (S.instPicker.classList.contains('open')) {
          RO.fleet.closeInstPicker()
          return
        }
        S.instPicker.classList.add('open')
        RO.fleet.renderFleet()
        RO.fleet.renderIdentity()
        const search = document.getElementById('fleetFilter')
        if (search && S.instances.length > 1) setTimeout(() => search.focus(), 0)
        document.removeEventListener('click', closeInstPicker)
        setTimeout(() => document.addEventListener('click', closeInstPicker), 0)
      }
    }
    if (panel) panel.onclick = (e) => e.stopPropagation()
    S.fleetList.onclick = (e) => {
      const row = e.target.closest('[data-id]')
      if (!row) return
      RO.fleet.closeInstPicker()
      document.removeEventListener('click', closeInstPicker)
      RO.fleet.selectInstance(row.dataset.id).catch(showErr)
    }
    document.getElementById('fleetFilter').oninput = (e) => {
      S.fleetQuery = e.target.value || ''
      RO.fleet.renderFleet()
    }
    document.getElementById('pingAllBtn').onclick = () => {
      RO.fleet.pingAll().then(() => RO.fleet.renderFleet()).catch(showErr)
    }
    document.getElementById('refreshInstBtn').onclick = () => {
      RO.fleet.loadInstances('').then(() => {
        toast('实例列表已刷新')
        RO.fleet.renderFleet()
        return RO.nav.loadTab()
      }).catch(showErr)
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === '`' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (isEditableTarget(e.target) && e.target.id !== 'cmd') return
        e.preventDefault()
        if (S.tab !== 'console') RO.nav.switchTab('console')
        else {
          const c = document.getElementById('cmd')
          if (c) { c.focus(); c.select() }
        }
        return
      }

      if (!isEditableTarget(e.target)) {
        if (e.key === '1' && !e.shiftKey) { e.preventDefault(); RO.nav.switchTab('keys'); return }
        if (e.key === '2' && !e.shiftKey) { e.preventDefault(); RO.nav.switchTab('console'); return }
        if (e.key === '/' && S.tab === 'keys') {
          e.preventDefault()
          const f = document.getElementById('keyFilter')
          if (f) { f.focus(); f.select() }
          return
        }
        if (S.tab === 'keys') {
          if (e.key === 'ArrowDown') { e.preventDefault(); RO.keys.moveKeyFocus(1); return }
          if (e.key === 'ArrowUp') { e.preventDefault(); RO.keys.moveKeyFocus(-1); return }
          if (e.key === 'Enter') { e.preventDefault(); RO.keys.openFocusedKey().catch(showErr); return }
          if (e.key === 'Delete') { e.preventDefault(); RO.keys.deleteCurrentKey().catch(showErr); return }
        }
      }
    })
  }

  async function boot() {
    if (!ready()) return
    try {
      const ctx = await window.datawisePlugin.context
      S.connectionId = (ctx && ctx.connectionId) || (ctx && ctx.connection && ctx.connection.id) || ''
      S.allowDangerous = (await recall('redis.allowDangerous')) === '1'
      const recalledRefresh = Number(await recall('redis.overviewRefreshSec'))
      if (recalledRefresh === 5 || recalledRefresh === 10) S.overviewRefreshSec = recalledRefresh
      const recalled = await recall('redis.lastInstanceId')
      if (recalled) S.activeId = recalled
      const recalledTab = await recall('redis.lastTab')
      if (recalledTab && RO.nav.NAV_IDS.has(recalledTab)) S.tab = recalledTab
      else S.tab = 'keys'

      RO.nav.renderNav()
      bindChrome()
      await RO.fleet.loadInstances('')
      if (S.activeId && S.instances.some(i => i.id === S.activeId)) {
        try { await invoke('redis/select', { instanceId: S.activeId }) } catch (e) { /* */ }
      } else if (S.instances.length) {
        S.activeId = S.instances[0].id
        await invoke('redis/select', { instanceId: S.activeId })
        await remember('redis.lastInstanceId', S.activeId)
      }
      if (S.activeId) {
        const recalledDb = await recall('redis.db.' + S.activeId)
        if (recalledDb !== '' && Number.isFinite(Number(recalledDb))) {
          try {
            await invoke('redis/select-db', { database: Number(recalledDb) })
            S.activeDb = Number(recalledDb)
            const inst = S.instances.find(i => i.id === S.activeId)
            if (inst) inst.database = S.activeDb
          } catch (e) { /* keep connection default db */ }
        }
      }
      RO.fleet.renderFleet()
      RO.fleet.renderIdentity()
      RO.nav.renderNav()
      await RO.nav.loadTab()
    } catch (e) {
      RO.nav.showErr(e)
    }
  }

  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'datawise-plugin-env') boot()
  })
  boot()


  
})();
