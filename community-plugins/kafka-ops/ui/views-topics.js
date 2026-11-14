/* Kafka Ops — views-topics.js */
(function () {
  const KO = (window.KO = window.KO || {});
  const state = KO.state;
  const $ = (...a) => KO.util.$(...a);
  const $$ = (...a) => KO.util.$$(...a);
  const VIEW_FRESH_MS = KO.consts.VIEW_FRESH_MS;
  const VIRT_MIN = KO.consts.VIRT_MIN;
  const TOPIC_ROW_H = KO.consts.TOPIC_ROW_H;
  const GROUP_ROW_H = KO.consts.GROUP_ROW_H;

  function bindTopicRow(tr) {
    tr.onclick = (e) => {
      const name = tr.dataset.name
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        KO.util.copyText(name, 'Topic').catch(() => {})
        return
      }
      selectTopic(name, true)
    }
    tr.ondblclick = () => {
      const name = tr.dataset.name
      state.exploreTopic = name
      state.explorePartition = 0
      KO.nav.switchView('explorer', { topic: name, partition: 0, autoFetch: true })
    }
  }

  function topicRowHtml(t) {
    const bad = (t.underReplicated || 0) + (t.offline || 0)
    const health = bad
      ? `<span class="pill bad" title="URP ${(t.underReplicated||0)} / Offline ${(t.offline||0)}">!</span>`
      : ''
    const meta = (t.partitions < 0) ? '—' : `${t.partitions}×${t.replicationFactor}`
    return `<tr data-name="${KO.util.esc(t.name)}" class="${t.name === state.selectedTopic ? 'active' : ''}" title="${KO.util.esc(t.name)}" style="height:${TOPIC_ROW_H}px">
      <td class="col-name mono">${KO.util.esc(t.name)}</td>
      <td class="col-meta">${meta}</td>
      <td class="col-health">${health}</td>
    </tr>`
  }

  function filterTopicsLocal() {
    const q = ($('#topicQuery').value || '').trim().toLowerCase()
    state.topics = KO.util.sortTopics(
      state.topicsRaw.filter(t => !q || String(t.name).toLowerCase().includes(q))
    )
    renderTopicList()
  }

  async function loadTopics() {
    const box = $('#topicList')
    const seq = ++state.topicsSeq
    box.innerHTML = '<div class="empty">加载中…</div>'
    try {
      // Fast path: names only (cached server-side). Health badges merge from last pulse.
      const light = await KO.bridge.invoke('kafka/topics', {
        includeInternal: $('#includeInternal').checked,
        light: true,
      })
      if (seq !== state.topicsSeq) return
      state.topicsRaw = light.topics || []
      // Merge URP/offline from pulse problemTopics if available
      try {
        const probs = ($('#pulseProblems') && state._lastProblems) || []
        if (probs.length) {
          const pm = new Map(probs.map(p => [p.name, p]))
          state.topicsRaw = state.topicsRaw.map(t => {
            const p = pm.get(t.name)
            return p ? { ...t, underReplicated: p.underReplicated || 0, offline: p.offline || 0, partitions: t.partitions, replicationFactor: t.replicationFactor } : t
          })
        }
      } catch {}
      filterTopicsLocal()
      KO.bridge.markRefresh('Topics')
      KO.nav.markViewFetched('topics')
      if (KO.combos?.exTopic) {
        KO.combos.exTopic.setItems(state.topicsRaw.filter(t => !t.internal).map(t => t.name))
      }

      // Background enrich (cancellable) …do not block UI
      KO.bridge.invoke('kafka/topics', {
        includeInternal: $('#includeInternal').checked,
        light: false,
      }, { quiet: true }).then(full => {
        if (seq !== state.topicsSeq) return
        const map = new Map((full.topics || []).map(t => [t.name, t]))
        state.topicsRaw = state.topicsRaw.map(t => map.get(t.name) || t)
        for (const t of (full.topics || [])) {
          if (!state.topicsRaw.find(x => x.name === t.name)) state.topicsRaw.push(t)
        }
        filterTopicsLocal()
        if (KO.combos?.exTopic) {
          KO.combos.exTopic.setItems(state.topicsRaw.filter(t => !t.internal).map(t => t.name))
        }
      }).catch(() => {})

      if (state.selectedTopic && state.topicsRaw.some(t => t.name === state.selectedTopic)) {
        selectTopic(state.selectedTopic, false)
      }
    } catch (e) {
      if (seq !== state.topicsSeq) return
      box.innerHTML = `<div class="empty">${KO.util.esc(e.message || e)}</div>`
    }
  }

  function renderTopicList() {
    $('#topicCount').textContent = `(${state.topics.length})`
    const box = $('#topicList')
    state._topicVirtList = null
    box.classList.remove('virt-host')
    if (!state.topics.length) {
      box.innerHTML = '<div class="empty">无匹…?Topic</div>'
      return
    }
    const fold = $('#foldNs')?.checked
    const q = ($('#topicQuery').value || '').trim()
    const useFold = fold && !q
    const head = `<thead><tr><th class="col-name">名称</th><th class="col-meta">P×RF</th><th class="col-health"></th></tr></thead>`

    // Flat large list →virtual window
    if (!useFold && state.topics.length >= VIRT_MIN) {
      state._topicVirtList = state.topics
      box.classList.add('virt-host')
      box.innerHTML = `<div class="virt"><table>${head}</table><div class="virt-body" style="flex:1;min-height:0;display:flex;flex-direction:column"></div></div>`
      const body = box.querySelector('.virt-body')
      KO.util.mountVirtWindow(body, {
        items: state.topics,
        rowH: TOPIC_ROW_H,
        key: 'topics',
        metaLabel: (s, e, n) => `Topics ${s + 1}…{e} / ${n}`,
        renderSlice: (win, start, end) => {
          win.innerHTML = `<table><tbody>${state.topics.slice(start, end).map(topicRowHtml).join('')}</tbody></table>`
          win.querySelectorAll('tr[data-name]').forEach(bindTopicRow)
        },
      })
      return
    }

    const rowsHtml = (list) => list.map(topicRowHtml).join('')

    if (!useFold) {
      box.innerHTML = `<table>${head}<tbody>${rowsHtml(state.topics)}</tbody></table>`
    } else {
      const groups = new Map()
      const singles = []
      for (const t of state.topics) {
        const ns = KO.util.topicNamespace(t.name)
        if (!ns) { singles.push(t); continue }
        if (!groups.has(ns)) groups.set(ns, [])
        groups.get(ns).push(t)
      }
      const chunks = []
      chunks.push(`<table>${head}</table>`)
      for (const ns of [...groups.keys()].sort()) {
        const items = groups.get(ns)
        if (items.length < 3) {
          singles.push(...items)
          continue
        }
        const open = state.collapsedNs[ns] !== true
        const badN = items.filter(t => (t.underReplicated || 0) + (t.offline || 0) > 0).length
        chunks.push(`<button type="button" class="ns-row" data-ns="${KO.util.esc(ns)}">
          <span>${open ? '▼' : '▶'} ${KO.util.esc(ns)}</span>
          <span class="ns-count">${items.length}${badN ? ' · !' + badN : ''}</span>
        </button>`)
        if (open) {
          chunks.push(`<table><tbody>${rowsHtml(items)}</tbody></table>`)
        }
      }
      if (singles.length) {
        chunks.push(`<table><tbody>${rowsHtml(KO.util.sortTopics(singles))}</tbody></table>`)
      }
      box.innerHTML = chunks.join('')
      box.querySelectorAll('.ns-row').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation()
          const ns = btn.dataset.ns
          state.collapsedNs[ns] = state.collapsedNs[ns] !== true
          renderTopicList()
        }
      })
    }

    box.querySelectorAll('tr[data-name]').forEach(bindTopicRow)
  }

  async function selectTopic(name, persist) {
    state.selectedTopic = name
    if (persist !== false) KO.bridge.storeSet('kafka.lastTopic', name)
    $$('#topicList tr').forEach(tr => {
      const on = tr.dataset.name === name
      tr.classList.toggle('active', on)
      if (on) tr.scrollIntoView({ block: 'nearest' })
    })
    const box = $('#topicDetail')
    const seq = ++state.detailSeq
    box.innerHTML = '<div class="empty">加载详情…</div>'
    try {
      // Fast path: metadata + configs, skip listOffsets
      const d = await KO.bridge.invoke('kafka/topic', { topic: name, includeGroups: false, offsets: false })
      if (seq !== state.detailSeq) return
      state.topicDetail = d
      renderTopicDetail(d)
      loadTopicGroupsLazy(name, seq)
      // Enrich offsets in background
      KO.bridge.invoke('kafka/topic', { topic: name, includeGroups: false, offsets: true }, { quiet: true }).then(full => {
        if (seq !== state.detailSeq) return
        state.topicDetail = full
        renderTopicDetail(full)
        // Restore groups panel after detail re-render
        if (state._topicGroupsPaint && state._topicGroupsPaint.length) {
          paintTopicGroups(state._topicGroupsPaint, seq)
        } else if (Array.isArray(state._topicGroupsPaint) && state._topicGroupsPaint.length === 0) {
          paintTopicGroupsEmpty(seq)
        }
      }).catch(() => {})
    } catch (e) {
      if (seq !== state.detailSeq) return
      box.innerHTML = `<div class="empty">${KO.util.esc(e.message || e)}</div>`
    }
  }

  function topicGroupsHost() {
    return $('#tdGroups')
  }

  function paintTopicGroupsEmpty(seq) {
    const host = topicGroupsHost()
    if (!host || seq !== state.detailSeq) return
    host.innerHTML = `<p class="hint">当前无活跃消费该 Topic 的组
      <button class="btn ghost" type="button" id="tdGroupsDeep" style="margin-left:6px">深度扫描空闲…?/button></p>`
    const deepBtn = $('#tdGroupsDeep')
    if (deepBtn) {
      deepBtn.onclick = async () => {
        const h = topicGroupsHost()
        if (h) h.innerHTML = '<div class="loading-inline">深度扫描中…</div>'
        try {
          const deep = await KO.bridge.invoke('kafka/topic-groups', { topic: state.selectedTopic, deep: true, withLag: true })
          if (seq !== state.detailSeq) return
          state._topicGroupsPaint = deep.groups || []
          paintTopicGroups(state._topicGroupsPaint, seq)
        } catch (e) {
          const errHost = topicGroupsHost()
          if (errHost) errHost.innerHTML = `<p class="hint">${KO.util.esc(e.message || e)}</p>`
        }
      }
    }
  }

  async function loadTopicGroupsLazy(topic, seq) {
    const host = topicGroupsHost()
    if (!host) return
    host.innerHTML = '<div class="loading-inline">正在扫描关联消费组…</div>'
    try {
      // Membership only …no per-group lag RPCs
      const res = await KO.bridge.invoke('kafka/topic-groups', { topic, deep: false, withLag: false })
      if (seq !== state.detailSeq) return
      const groups = res.groups || []
      if (!groups.length) {
        state._topicGroupsPaint = []
        paintTopicGroupsEmpty(seq)
        return
      }
      state._topicGroupsPaint = groups
      paintTopicGroups(groups, seq)
      // Fill lag once (shared topic latest offsets on sidecar)
      KO.bridge.invoke('kafka/topic-groups', { topic, deep: false, withLag: true }, { quiet: true }).then(full => {
        if (seq !== state.detailSeq) return
        state._topicGroupsPaint = full.groups || groups
        paintTopicGroups(state._topicGroupsPaint, seq)
      }).catch(() => {})
    } catch (e) {
      if (seq !== state.detailSeq) return
      const errHost = topicGroupsHost()
      if (errHost) errHost.innerHTML = `<p class="hint">${KO.util.esc(e.message || e)}</p>`
    }
  }

  function paintTopicGroups(groups, seq) {
    const host = topicGroupsHost()
    if (!host || seq !== state.detailSeq) return
    if (!groups.length) {
      host.innerHTML = '<p class="hint">暂未发现相关消费…?/p>'
      return
    }
    host.innerHTML = groups.map(g => {
      const lag = Number(g.lag)
      const lagPending = lag < 0
      const lagCls = lagPending ? '' : (lag > 0 ? 'warn' : 'ok')
      const lagTxt = lagPending ? '—' : String(lag)
      return `
      <div class="group-chip" data-gid="${KO.util.esc(g.groupId)}">
        <span class="mono" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">${KO.util.esc(g.groupId)}</span>
        <span class="pill ${lagCls}">lag ${KO.util.esc(lagTxt)}</span>
        <span class="muted" style="font-size: var(--dw-text-2xs)">${g.partitions}p</span>
      </div>`
    }).join('')
    host.querySelectorAll('.group-chip').forEach(el => {
      el.onclick = () => KO.nav.switchView('lag', { groupId: el.dataset.gid })
    })
  }

  function renderTopicDetail(d) {
    const name = d.name
    const pending = !!d.offsetsPending || Number(d.estimatedMessages) < 0
    const msgs = pending ? '—' : (d.estimatedMessages || 0)
    const truncated = d.logTruncated
    const parts = (d.partitionDetails || []).map(p => {
      const offPending = Number(p.earliest) < 0 || Number(p.latest) < 0
      return `
      <tr>
        <td>${p.partition}</td>
        <td class="mono">b${p.leader}</td>
        <td class="mono">${KO.util.esc(KO.util.fmtBrokers(p))}</td>
        <td class="mono">${KO.util.esc(KO.util.fmtIsr(p))}</td>
        <td class="mono" title="earliest →latest">${offPending ? '—' : `${p.earliest} →${p.latest}`}</td>
        <td>${offPending ? '—' : p.messages}</td>
      </tr>`
    }).join('')

    const cfg = (d.configHighlights || []).map(c => `
      <div class="kv">
        <div class="k">${KO.util.esc(c.name)}</div>
        <div class="v ${c.default ? '' : 'changed'}">${KO.util.esc(c.value)}${c.default ? '' : ' ·'}</div>
      </div>`).join('')

    $('#topicDetail').innerHTML = `
      <div class="topic-head">
        <div class="name copyable" id="tdName" title="点击复制">${KO.util.esc(name)}</div>
        <span class="pill" title="${pending ? '正在拉取 offset…' : (truncated ? '日志起点 > 0，可能已裁剪' : '可读消息估算')}">
可读 ${msgs}${!pending && truncated ? ' · 已裁剪' : ''}
        </span>
        <span class="pill">${d.partitions}P · RF ${d.replicationFactor ?? '?'}</span>
      </div>
      <div class="toolbar" style="margin-bottom:8px;border:0;padding:0;background:transparent;min-height:0">
        <button class="btn ghost" type="button" id="tdCopy">复制…?/button>
        <button class="btn primary" type="button" id="tdExplore">浏览消息</button>
        <button class="btn" type="button" id="tdConfigs">全部配置</button>
        <div class="top-spacer"></div>
        <button class="btn danger" type="button" id="tdDelete" ${state.allowDangerous ? '' : 'disabled'}
          title="${state.allowDangerous ? '删除 Topic（不可逆）' : '需开启危险模式'}">删除</button>
      </div>

      <div class="detail-block">
        <h4>分区</h4>
        <table style="table-layout:auto"><thead>
          <tr><th>P</th><th>Leader</th><th>Replicas</th><th>ISR</th><th>Offsets</th><th>Msgs</th></tr>
        </thead><tbody>${parts}</tbody></table>
      </div>

      <div class="detail-block section-gap">
        <h4>关键配置</h4>
        <div class="kv-grid">${cfg || '<span class="hint">无配置摘…?/span>'}</div>
      </div>

      <div class="detail-block section-gap">
        <h4>关联消费…?/h4>
        <div id="tdGroups"><div class="loading-inline">正在扫描…</div></div>
      </div>`

    $('#tdCopy').onclick = () => KO.util.copyText(name, 'Topic').catch(() => {})
    const tdName = $('#tdName')
    if (tdName) tdName.onclick = () => KO.util.copyText(name, 'Topic').catch(() => {})
    $('#tdExplore').onclick = () => {
      state.exploreTopic = name
      state.explorePartition = 0
      KO.nav.switchView('explorer', { topic: name, partition: 0, autoFetch: true })
    }
    $('#tdConfigs').onclick = () => showTopicConfigs(name)
    $('#tdDelete').onclick = async () => {
      if (!state.allowDangerous) return
      const ok = await KO.util.askConfirm({
        title: '删除 Topic',
        body: '确认删除「' + name + '」？此操作不可逆。',
      })
      if (!ok) return
      await KO.bridge.invoke('kafka/topic-delete', { topic: name, allowDangerous: true })
      state.selectedTopic = ''
      KO.util.toast('已删除 ' + name)
      loadTopics()
    }
  }

  async function showTopicConfigs(topic) {
    const box = $('#topicDetail')
    const res = await KO.bridge.invoke('kafka/topic-configs', { topic })
    const rows = (res.entries || []).filter(e => e.allowSet || !e.default).slice(0, 100)
    const list = rows.length ? rows : (res.entries || []).filter(e => e.allowSet).slice(0, 40)
    box.innerHTML = `
      <div class="toolbar" style="margin-bottom:10px">
        <strong>配置 · ${KO.util.esc(topic)}</strong>
        <div class="top-spacer"></div>
        <button class="btn" type="button" id="cfgBack">返回详情</button>
      </div>
      <p class="hint" style="margin-bottom:8px">白名单项可直…?SET；其余需危险模式…?/p>
      <table style="table-layout:auto"><thead><tr><th>Key</th><th>Value</th><th></th></tr></thead><tbody>
      ${list.map(e => `<tr>
        <td class="mono">${KO.util.esc(e.name)}${e.allowSet ? ' <span class="pill ok">白名…?/span>' : ''}</td>
        <td><input data-cfg="${KO.util.esc(e.name)}" value="${KO.util.esc(e.value)}" style="width:100%" ${e.readOnly ? 'disabled' : ''} /></td>
        <td>${e.readOnly ? '' : `<button class="btn" data-set="${KO.util.esc(e.name)}" type="button" ${(!e.allowSet && !state.allowDangerous) ? 'disabled title="需危险模式"' : ''}>SET</button>`}</td>
      </tr>`).join('')}
      </tbody></table>`
    $('#cfgBack').onclick = () => selectTopic(topic, false)
    box.querySelectorAll('[data-set]').forEach(btn => {
      btn.onclick = async () => {
        const key = btn.dataset.set
        const input = box.querySelector(`input[data-cfg="${CSS.escape(key)}"]`)
        const ok = await KO.util.askConfirm({
          title: '设置配置',
          body: `${key} = ${input.value}`,
          danger: !list.find(e => e.name === key)?.allowSet,
          okLabel: 'SET',
        })
        if (!ok) return
        try {
          await KO.bridge.invoke('kafka/topic-config-set', {
            topic, key, value: input.value, allowDangerous: state.allowDangerous,
          })
          KO.util.toast('已设置 ' + key)
        } catch (e) { KO.util.toast(e.message || e, true) }
      }
    })
  }

  KO.topics = Object.assign(KO.topics || {}, {
    bindTopicRow,
    topicRowHtml,
    filterTopicsLocal,
    loadTopics,
    renderTopicList,
    selectTopic,
    topicGroupsHost,
    paintTopicGroupsEmpty,
    loadTopicGroupsLazy,
    paintTopicGroups,
    renderTopicDetail,
    showTopicConfigs,
  });
})();