/* Kafka Ops — app.js */
(function () {
  const KO = (window.KO = window.KO || {});
  if (!KO.util || !KO.state) {
    console.error('[kafka-ops] modules failed to load (KO.util/state missing)')
    document.body?.insertAdjacentHTML(
      'afterbegin',
      '<div style="padding:16px;font:13px sans-serif;color:#f3625f">Kafka Ops UI 脚本未加载完整，请重新安装 .dwp 包（需打包内联）。</div>',
    )
    return
  }
  const state = KO.state;
  const $ = (...a) => KO.util.$(...a);
  const $$ = (...a) => KO.util.$$(...a);
  const VIEW_FRESH_MS = KO.consts.VIEW_FRESH_MS;

  function on(id, ev, fn) {
    const el = typeof id === 'string' ? $('#' + id) : id
    if (!el) return
    el[ev] = fn
  }

  function listen(id, type, fn) {
    const el = typeof id === 'string' ? $('#' + id) : id
    if (!el) return
    el.addEventListener(type, fn)
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.combo')) {
      document.querySelectorAll('.combo.open').forEach(c => c.classList.remove('open'))
    }
  })

  // Combos live on KO.combos — never rely on window.<elementId> (DOM id globals).
  const combos = (KO.combos = KO.combos || {})

  function initCombos() {
    combos.exTopic = KO.util.createCombo($('#exTopicCombo'), {
      placeholder: '选择 Topic…',
      maxShow: 120,
      onChange: (v) => {
        state.exploreTopic = v
        state.explorePartition = 0
        KO.explorer.onExTopicChange()
      },
    })
    combos.exPart = KO.util.createCombo($('#exPartCombo'), {
      placeholder: 'P…',
      maxShow: 250,
      onChange: (v) => {
        state.explorePartition = Number(v || 0)
        KO.explorer.updateExCrumb()
      },
    })
    combos.exSeek = KO.util.createCombo($('#exSeekCombo'), {
      placeholder: 'Seek',
      searchable: false,
      maxShow: 10,
      onChange: (v) => { KO.explorer.syncSeekFields(v); KO.explorer.updateExCrumb() },
    })
    combos.exSeek?.setItems([
      { value: 'latest', label: '最新' },
      { value: 'earliest', label: '最早' },
      { value: 'offset', label: '指定 offset' },
      { value: 'timestamp', label: '时间戳' },
    ])
    combos.exSeek?.setValue('latest', true)
    combos.resetTopic = KO.util.createCombo($('#resetTopicCombo'), {
      placeholder: '选择 Topic…',
      maxShow: 120,
      onChange: (v) => { const el = $('#resetTopic'); if (el) el.value = v || '' },
    })
    combos.pulseRefresh = KO.util.createCombo($('#pulseRefreshCombo'), {
      placeholder: '刷新',
      searchable: false,
      maxShow: 10,
      onChange: () => KO.pulse.armPulseTimer(),
    })
    combos.pulseRefresh?.setItems([
      { value: '0', label: '手动' },
      { value: '5', label: '5s' },
      { value: '10', label: '10s' },
    ])
    combos.pulseRefresh?.setValue('0', true)
    combos.logFilter = KO.util.createCombo($('#logFilterCombo'), {
      placeholder: '过滤',
      searchable: false,
      maxShow: 10,
      onChange: () => KO.guard.renderLog(),
    })
    combos.logFilter?.setItems([
      { value: 'all', label: '全部' },
      { value: 'err', label: '仅失败' },
      { value: 'ok', label: '仅成功' },
      { value: 'write', label: '写操作' },
    ])
    combos.logFilter?.setValue('all', true)
  }

  // events — null-safe so a missing node never blanks the whole UI
  try {
  $$('.nav-btn').forEach(b => b.onclick = () => KO.nav.switchView(b.dataset.view))

  $$('[data-goto]').forEach(b => b.onclick = () => KO.nav.switchView(b.dataset.goto))

  on('clusterTrigger', 'onclick', (e) => {
    e.stopPropagation()
    if (!state.fleet) return
    $('#clusterPicker')?.classList.toggle('open')
  })

  document.addEventListener('click', (e) => {
    const picker = $('#clusterPicker')
    if (picker && !picker.contains(e.target)) picker.classList.remove('open')
  })

  on('clusterSearch', 'oninput', () => KO.util.debounce(() => KO.fleet.loadClusters().catch(() => {}), 200, '_clusterSearchTimer'))

  on('btnRefreshClusters', 'onclick', () => KO.fleet.loadClusters().catch(e => KO.util.toast(e.message, true)))

  on('btnPingAll', 'onclick', () => KO.fleet.pingAll().catch(e => KO.util.toast(e.message, true)))

  on('dangerToggle', 'onclick', () => KO.guard.setDanger(!state.allowDangerous, { confirmEnable: true }))

  on('btnPulseRefresh', 'onclick', () => KO.pulse.loadPulse({ quiet: false }))

  on('btnDiagnose', 'onclick', () => KO.pulse.diagnose().catch(e => KO.util.toast(e.message, true)))

  on('btnTopicsRefresh', 'onclick', () => {
    KO.nav.clearViewFreshness()
    KO.topics.loadTopics().catch(e => KO.util.toast(e.message, true))
  })

  on('topicQuery', 'oninput', () => KO.util.debounce(KO.topics.filterTopicsLocal, 220, 'topicFilterTimer'))

  on('includeInternal', 'onchange', () => KO.topics.loadTopics())

  on('foldNs', 'onchange', () => KO.topics.renderTopicList())

  on('btnTopicCreate', 'onclick', () => $('#dlgCreate')?.showModal())

  listen('formCreate', 'submit', (e) => {
    const dlg = $('#dlgCreate')
    if (dlg) dlg.returnValue = e.submitter?.value || 'cancel'
  })

  // close fires on <dialog>, not <form>
  listen('dlgCreate', 'close', async () => {
    if ($('#dlgCreate')?.returnValue !== 'default') return
    const fd = new FormData($('#formCreate'))
    try {
      await KO.bridge.invoke('kafka/topic-create', {
        topic: fd.get('topic'),
        partitions: Number(fd.get('partitions') || 1),
        replicationFactor: Number(fd.get('rf') || 1),
      })
      KO.util.toast('已创建')
      KO.topics.loadTopics()
    } catch (e) { KO.util.toast(e.message || e, true) }
  })

  on('btnFetch', 'onclick', () => KO.explorer.fetchMessages().catch(e => KO.util.toast(e.message, true)))

  on('exCopyValue', 'onclick', async () => {
    if (!state._exValueRaw) return
    await KO.bridge.clipboard(state._exValueRaw)
    KO.util.toast('已复制 Value')
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#clusterPicker')?.classList.contains('open')) {
      $('#clusterPicker').classList.remove('open')
      return
    }
    const tag = e.target?.tagName || ''
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(tag)
    const inCombo = !!e.target?.closest?.('.combo.open')
    const inDialog = !!e.target?.closest?.('dialog[open]')

    // / focuses active view filter
    if (e.key === '/' && !inField && !inCombo && !inDialog) {
      const map = { topics: '#topicQuery', lag: '#groupQuery', brokers: '#brokerQuery', explorer: null, guard: '#logQuery' }
      const sel = map[state.view]
      if (sel) {
        e.preventDefault()
        const el = $(sel)
        if (el) { el.focus(); el.select?.() }
      }
      return
    }

    if (inDialog) return

    // Topics: j/k · Enter 浏览 · c 复制
    if (state.view === 'topics' && !inField && !inCombo) {
      const names = KO.util.visibleTopicNames()
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        const next = KO.util.navPick(names, state.selectedTopic, 1)
        if (next) KO.topics.selectTopic(next, true)
        return
      }
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        const next = KO.util.navPick(names, state.selectedTopic, -1)
        if (next) KO.topics.selectTopic(next, true)
        return
      }
      if (e.key === 'Enter' && state.selectedTopic) {
        e.preventDefault()
        const name = state.selectedTopic
        state.exploreTopic = name
        state.explorePartition = 0
        KO.nav.switchView('explorer', { topic: name, partition: 0, autoFetch: true })
        return
      }
      if ((e.key === 'c' || e.key === 'C') && state.selectedTopic) {
        e.preventDefault()
        KO.util.copyText(state.selectedTopic, 'Topic').catch(() => {})
        return
      }
    }

    // Lag: j/k · Enter 选中 · c 复制
    if (state.view === 'lag' && !inField && !inCombo) {
      const ids = KO.util.visibleGroupIds()
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        const next = KO.util.navPick(ids, state.selectedGroup, 1)
        if (next) KO.lag.selectGroup(next)
        return
      }
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        const next = KO.util.navPick(ids, state.selectedGroup, -1)
        if (next) KO.lag.selectGroup(next)
        return
      }
      if (e.key === 'Enter' && state.selectedGroup) {
        e.preventDefault()
        KO.lag.selectGroup(state.selectedGroup)
        return
      }
      if ((e.key === 'c' || e.key === 'C') && state.selectedGroup) {
        e.preventDefault()
        KO.util.copyText(state.selectedGroup, 'Group').catch(() => {})
        return
      }
    }

    if (state.view !== 'explorer') return

    // Enter in explorer fields → fetch
    if (e.key === 'Enter' && inField && !inCombo) {
      const id = e.target?.id || ''
      if (id === 'exOffset' || id === 'exTs' || id === 'exLimit') {
        e.preventDefault()
        KO.explorer.fetchMessages().catch(err => KO.util.toast(err.message || err, true))
      }
      return
    }

    if (inField || inCombo) return

    if (e.key === 'Enter') {
      e.preventDefault()
      KO.explorer.fetchMessages().catch(err => KO.util.toast(err.message || err, true))
      return
    }
    if (e.key === 'c' || e.key === 'C') {
      if (state._exValueRaw) {
        e.preventDefault()
        KO.util.copyText(state._exValueRaw, 'Value').catch(() => {})
      }
      return
    }
    const n = (state.records || []).length
    if (!n) return
    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault()
      KO.explorer.showRecord(Math.min(n - 1, (state._exSelected ?? 0) + 1))
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault()
      KO.explorer.showRecord(Math.max(0, (state._exSelected ?? 0) - 1))
    }
  })

  on('btnProduce', 'onclick', () => {
    if (!state.allowDangerous) return
    const prod = $('#prodTopic')
    if (prod) prod.value = (combos.exTopic && combos.exTopic.getValue()) || state.exploreTopic || ''
    $('#dlgProduce')?.showModal()
  })

  listen('formProduce', 'submit', (e) => {
    const dlg = $('#dlgProduce')
    if (dlg) dlg.returnValue = e.submitter?.value || 'cancel'
  })

  listen('dlgProduce', 'close', async () => {
    if ($('#dlgProduce')?.returnValue !== 'default') return
    const fd = new FormData($('#formProduce'))
    const partitionRaw = fd.get('partition')
    try {
      const params = {
        topic: fd.get('topic'),
        key: fd.get('key') || null,
        value: fd.get('value') || '',
        allowDangerous: true,
      }
      if (partitionRaw !== '' && partitionRaw != null) params.partition = Number(partitionRaw)
      const res = await KO.bridge.invoke('kafka/produce', params)
      KO.util.toast(`已发送 · P${res.partition} offset ${res.offset}`)
    } catch (e) { KO.util.toast(e.message || e, true) }
  })

  on('btnGroupsRefresh', 'onclick', () => KO.lag.loadGroups({ force: true }).catch(e => KO.util.toast(e.message, true)))

  on('groupQuery', 'oninput', () => KO.util.debounce(KO.lag.filterGroupsLocal, 150, 'groupFilterTimer'))

  on('btnResetBar', 'onclick', () => KO.lag.openResetDialog(state.selectedGroup, state._lagTopics))

  on('btnDelGroupBar', 'onclick', () => KO.lag.deleteSelectedGroup().catch(e => KO.util.toast(e.message, true)))

  on('resetMode', 'onchange', () => {
    const mode = $('#resetMode')?.value
    const ow = $('#resetOffsetWrap')
    const tw = $('#resetTsWrap')
    if (ow) ow.style.display = mode === 'offset' ? '' : 'none'
    if (tw) tw.style.display = mode === 'timestamp' ? '' : 'none'
  })

  listen('formReset', 'submit', (e) => {
    const dlg = $('#dlgReset')
    if (dlg) dlg.returnValue = e.submitter?.value || 'cancel'
  })

  listen('dlgReset', 'close', async () => {
    if ($('#dlgReset')?.returnValue !== 'default') return
    const fd = new FormData($('#formReset'))
    const topic = fd.get('topic') || $('#resetTopic')?.value
    if (!topic) return KO.util.toast('请选择 Topic', true)
    try {
      await KO.bridge.invoke('kafka/reset-offsets', {
        groupId: fd.get('groupId'),
        topic,
        mode: fd.get('mode'),
        offset: Number(fd.get('offset') || 0),
        timestamp: Number(fd.get('timestamp') || -1),
        allowDangerous: true,
      })
      KO.util.toast('Offset 已重置')
      KO.lag.selectGroup(fd.get('groupId'))
    } catch (e) { KO.util.toast(e.message || e, true) }
  })

  on('btnBrokersRefresh', 'onclick', () => KO.brokers.loadBrokers().catch(e => KO.util.toast(e.message, true)))

  on('brokerQuery', 'oninput', () => KO.util.debounce(KO.brokers.renderBrokerView, 150, '_brokerQueryTimer'))

  on('btnCopyDiagnose', 'onclick', async () => {
    if (!state.lastDiagnose) await KO.pulse.diagnose().catch(e => KO.util.toast(e.message, true))
    else { await KO.bridge.clipboard(state.lastDiagnose); KO.util.toast('已复制诊断') }
  })

  on('btnCopyLog', 'onclick', async () => {
    if (!state.logs.length) return KO.util.toast('暂无日志', true)
    const rows = KO.guard.filteredLogs()
    const text = rows.map(l => `${l.t}\t${l.ok ? 'ok' : 'ERR'}\t${l.method}\t${l.detail || ''}`).join('\n')
    await KO.bridge.clipboard(text)
    KO.util.toast(`已复制 ${rows.length} 条`)
  })

  on('btnClearLog', 'onclick', () => {
    state.logs = []
    KO.guard.renderLog()
    KO.util.toast('日志已清空')
  })

  on('logQuery', 'oninput', () => KO.util.debounce(KO.guard.renderLog, 150, '_logQueryTimer'))
  } catch (e) {
    console.error('[kafka-ops] bind failed', e)
    KO.util.toast('UI 绑定失败: ' + (e.message || e), true)
  }

  async function boot() {
    KO.bridge.setStatus('初始化…')
    if (!KO.util.ready()) {
      KO.bridge.setStatus('等待 host…', 'bad')
      setTimeout(boot, 400)
      return
    }
    try {
      initCombos()
      const ctx = await window.datawisePlugin.context
      state.connectionId = ctx?.connectionId || ctx?.connection?.id || ''
      const danger = await KO.bridge.storeGet('kafka.allowDangerous')
      KO.guard.setDanger(danger === '1', { confirmEnable: false })
      const sec = Number(await KO.bridge.storeGet('kafka.overviewRefreshSec') || 0)
      const secVal = [0, 5, 10].includes(sec) ? String(sec) : '0'
      if (combos.pulseRefresh) combos.pulseRefresh.setValue(secVal, true)
      KO.pulse.armPulseTimer()
      const last = await KO.bridge.storeGet('kafka.lastClusterId')
      const lastTopic = await KO.bridge.storeGet('kafka.lastTopic')
      if (lastTopic) state.selectedTopic = lastTopic
      await KO.fleet.loadClusters()
      if (last && state.clusters.some(c => c.id === last)) {
        state.activeId = last
        await KO.bridge.invoke('kafka/select', { clusterId: last })
      }
      KO.fleet.renderClusterPicker()
      await KO.pulse.loadPulse()
    } catch (e) {
      state.pulseReady = true
      KO.pulse.setPulseLoading(false)
      KO.bridge.setStatus('失败', 'bad')
      KO.util.toast(e.message || '启动失败', true)
    }
  }

  function mountContentSplits() {
    if (!window.DwSplitPane) return
    document.querySelectorAll('.split').forEach((el, i) => {
      const panels = el.querySelectorAll(':scope > .panel')
      if (panels.length < 2) return
      DwSplitPane.mount({
        root: el,
        start: panels[0],
        end: panels[1],
        storageKey: 'dw.split.kafka-ops-' + (el.id || el.className.replace(/\s+/g, '-') || i),
        defaultRatio: el.classList.contains('lag') ? 'third' : 'half',
        defaultWidth: el.classList.contains('explorer') ? 320 : 380,
        minWidth: 240,
        maxWidth: 640,
        stackBelow: 960,
      })
    })
  }

  boot().finally(mountContentSplits)

  KO.app = Object.assign(KO.app || {}, { initCombos, boot, mountContentSplits });
})();
