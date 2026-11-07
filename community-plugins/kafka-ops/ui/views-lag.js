/* Kafka Ops — views-lag.js */
(function () {
  const KO = (window.KO = window.KO || {});
  const state = KO.state;
  const $ = (...a) => KO.util.$(...a);
  const $$ = (...a) => KO.util.$$(...a);
  const VIEW_FRESH_MS = KO.consts.VIEW_FRESH_MS;
  const VIRT_MIN = KO.consts.VIRT_MIN;
  const TOPIC_ROW_H = KO.consts.TOPIC_ROW_H;
  const GROUP_ROW_H = KO.consts.GROUP_ROW_H;

  function bindGroupRow(el) {
    el.onclick = (e) => {
      const id = el.dataset.id
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        KO.util.copyText(id, 'Group').catch(() => {})
        return
      }
      selectGroup(id)
    }
  }

  function groupRowHtml(g) {
    const tone = KO.util.groupStateTone(g.state)
    const mem = g.members < 0 ? '…' : g.members
    const st = g.state || '?'
    return `
      <div class="g-row ${g.groupId === state.selectedGroup ? 'active' : ''}" data-id="${KO.util.esc(g.groupId)}" style="min-height:${GROUP_ROW_H}px">
        <div class="g-tone ${tone}"></div>
        <div>
          <div class="gid" title="${KO.util.esc(g.groupId)}">${KO.util.esc(g.groupId)}</div>
          <div class="gmeta">
            <span class="pill ${tone === 'muted' ? '' : tone}">${KO.util.esc(st)}</span>
            ${g.coordinator ? `<span class="chip" title="coordinator">${KO.util.esc(g.coordinator)}</span>` : ''}
          </div>
        </div>
        <div class="gright">
          <div class="n">${KO.util.esc(mem)}</div>
          <div class="l">members</div>
        </div>
      </div>`
  }

  function syncLagActionButtons() {
    const has = !!state.selectedGroup
    const on = state.allowDangerous
    for (const id of ['btnResetBar', 'btnDelGroupBar']) {
      const b = $('#' + id)
      if (!b) continue
      b.disabled = !has || !on
      b.title = !has ? '请先选择消费组' : (on ? (b.dataset.okTitle || '') : '需开启危险模式')
    }
  }

  function applyDangerToDetail() {
    const del = $('#tdDelete')
    if (del) {
      del.disabled = !state.allowDangerous
      del.title = state.allowDangerous ? '删除 Topic（不可逆）' : '需开启危险模式'
    }
  }

  function filterGroupsLocal() {
    const q = ($('#groupQuery').value || '').trim().toLowerCase()
    state.groups = (state.groupsRaw || []).filter(g =>
      !q || String(g.groupId || '').toLowerCase().includes(q)
    )
    renderGroupList((state.groupsRaw || []).length)
  }

  async function loadGroups({ force = false } = {}) {
    const seq = ++state.groupsSeq
    const box = $('#groupList')
    try {
      if (!force && state.groupsRaw.length) {
        filterGroupsLocal()
        KO.bridge.markRefresh('Lag')
        return
      }
      // Light list first (ids only / cached) — always unfiltered; filter locally
      const light = await KO.bridge.invoke('kafka/groups', { query: '', light: true })
      if (seq !== state.groupsSeq) return
      state.groupsRaw = light.groups || []
      filterGroupsLocal()
      KO.bridge.markRefresh('Lag')
      KO.nav.markViewFetched('lag')
      // Enrich metadata for visible set
      KO.bridge.invoke('kafka/groups', { query: '', light: false }, { quiet: true }).then(full => {
        if (seq !== state.groupsSeq) return
        state.groupsRaw = full.groups || state.groupsRaw
        filterGroupsLocal()
      }).catch(() => {})
      // Only reload detail when forced (refresh / deep-link), avoid N+1 on every list paint
      if (force && state.selectedGroup) selectGroup(state.selectedGroup)
    } catch (e) {
      if (seq !== state.groupsSeq) return
      box.innerHTML = `<div class="empty">${KO.util.esc(e.message || e)}</div>`
    }
  }

  function updateLagStrip(total) {
    const groups = state.groups || []
    let stable = 0, other = 0, members = 0, known = 0
    for (const g of groups) {
      const st = String(g.state || '')
      if (/^stable$/i.test(st)) stable++
      else if (st && st !== '?') other++
      if (g.members >= 0) { members += g.members; known++ }
    }
    const shown = groups.length
    const all = total || shown
    $('#lagStatGroups').textContent = all > shown ? `${shown}/${all}` : String(shown || 0)
    $('#lagStatStable').textContent = String(stable)
    $('#lagStatOther').textContent = String(other)
    $('#lagStatMembers').textContent = known ? String(members) : '…'
    $('#lagStripTitle').textContent = '消费组 Lag'
    $('#lagStripSub').textContent = shown
      ? `${stable} Stable · ${other} 非 Stable · 问题状态排在前面`
      : '暂无消费组'
    $('#lagGroupCount').textContent = shown ? `${shown} 组` : ''
  }

  function renderGroupList(total) {
    const box = $('#groupList')
    updateLagStrip(total)
    state._groupVirtList = null
    box.classList.remove('virt-host')
    if (!state.groups.length) {
      box.innerHTML = '<div class="empty">无消费组</div>'
      return
    }
    const sorted = [...state.groups].sort((a, b) => {
      const ra = KO.util.groupStateRank(a.state) - KO.util.groupStateRank(b.state)
      if (ra) return ra
      const ma = a.members < 0 ? -1 : a.members
      const mb = b.members < 0 ? -1 : b.members
      if (mb !== ma) return mb - ma
      return String(a.groupId).localeCompare(String(b.groupId))
    })
    if (sorted.length >= VIRT_MIN) {
      state._groupVirtList = sorted
      box.classList.add('virt-host')
      KO.util.mountVirtWindow(box, {
        items: sorted,
        rowH: GROUP_ROW_H,
        key: 'groups',
        metaLabel: (s, e, n) => `Groups ${s + 1}–${e} / ${n}`,
        renderSlice: (win, start, end) => {
          win.innerHTML = sorted.slice(start, end).map(groupRowHtml).join('')
          win.querySelectorAll('.g-row').forEach(bindGroupRow)
        },
      })
      return
    }
    box.innerHTML = sorted.map(groupRowHtml).join('')
    box.querySelectorAll('.g-row').forEach(bindGroupRow)
  }

  function openResetDialog(gid, topics) {
    if (!state.allowDangerous) return
    $('#resetGroup').value = gid
    const list = topics || state._lagTopics || []
    if (!list.length) return KO.util.toast('该组没有可重置的 Topic offset', true)
    if (KO.combos?.resetTopic) {
      KO.combos.resetTopic.setItems(list)
      KO.combos.resetTopic.setValue(list[0], true)
      $('#resetTopic').value = list[0]
    }
    $('#dlgReset').showModal()
  }

  async function deleteSelectedGroup() {
    const gid = state.selectedGroup
    if (!gid || !state.allowDangerous) return
    const ok = await KO.util.askConfirm({
      title: '删除消费组',
      body: '确认删除「' + gid + '」？',
      danger: true,
      okLabel: '删除',
    })
    if (!ok) return
    await KO.bridge.invoke('kafka/group-delete', { groupId: gid, allowDangerous: true })
    state.selectedGroup = ''
    state._lagTopics = []
    syncLagActionButtons()
    KO.util.toast('已删除组')
    loadGroups()
  }

  function filteredLagTopics() {
    const d = state._lagView
    if (!d) return []
    const q = (d.query || '').trim().toLowerCase()
    let rows = d.topicRows
    if (d.onlyLag) rows = rows.filter(t => (t.lag || 0) > 0)
    if (q) rows = rows.filter(t => t.topic.toLowerCase().includes(q))
    return rows
  }

  function renderLagTopicList() {
    const d = state._lagView
    if (!d) return
    const list = $('#lagTopicList')
    const meta = $('#lagTopicMeta')
    if (!list) return
    const rows = filteredLagTopics()
    if (meta) {
      meta.textContent = `${rows.length}/${d.topicRows.length}`
        + (d.onlyLag ? ' · 仅有积压' : '')
    }
    if (!d.topicRows.length) {
      list.innerHTML = '<div class="empty">无已提交 offset</div>'
      renderLagPartPane(null)
      return
    }
    if (!rows.length) {
      list.innerHTML = '<div class="empty">无匹配 Topic</div>'
      if (!rows.some(t => t.topic === d.selectedTopic)) renderLagPartPane(null)
      return
    }
    if (!rows.some(t => t.topic === d.selectedTopic)) {
      d.selectedTopic = rows[0].topic
    }
    list.innerHTML = rows.map(t => {
      const tt = KO.util.lagTone(t.lag)
      const active = t.topic === d.selectedTopic
      return `<div class="t-row ${active ? 'active' : ''}" data-topic="${KO.util.esc(t.topic)}" title="${KO.util.esc(t.topic)}">
        <div>
          <div class="tn">${KO.util.esc(t.topic)}</div>
          <div class="tsub">${t.hot}/${t.parts} 分区有 lag</div>
        </div>
        <div class="tl ${tt}">${KO.util.esc(KO.util.fmtLag(t.lag))}</div>
      </div>`
    }).join('')
    list.querySelectorAll('.t-row').forEach(el => {
      el.onclick = () => {
        d.selectedTopic = el.dataset.topic
        renderLagTopicList()
      }
    })
    renderLagPartPane(d.selectedTopic)
    // keep selected row visible
    const active = list.querySelector('.t-row.active')
    if (active) active.scrollIntoView({ block: 'nearest' })
  }

  function renderLagPartPane(topic) {
    const pane = $('#lagPartPane')
    const d = state._lagView
    if (!pane || !d) return
    if (!topic) {
      pane.innerHTML = '<div class="empty">选择左侧 Topic 查看分区</div>'
      return
    }
    const summary = d.topicRows.find(t => t.topic === topic)
    const parts = d.parts.filter(p => p.topic === topic).sort((a, b) => (b.lag || 0) - (a.lag || 0))
    const maxLag = Math.max(1, ...parts.map(p => p.lag || 0), summary?.lag || 1)
    const tt = KO.util.lagTone(summary?.lag || 0)
    const rows = parts.map(p => {
      const pt = KO.util.lagTone(p.lag)
      const color = pt === 'bad' ? 'var(--bad)' : (pt === 'warn' ? 'var(--amber)' : 'inherit')
      return `<tr>
        <td>P${p.partition}</td>
        <td class="mono">${p.currentOffset}</td>
        <td class="mono">${p.logEndOffset}</td>
        <td>
          <strong style="color:${color}">${p.lag}</strong>
          <div class="lag-bar ${pt}"><i style="width:${Math.round(100 * (p.lag || 0) / maxLag)}%"></i></div>
        </td>
      </tr>`
    }).join('')
    pane.innerHTML = `
      <div class="ph">
        <div class="name">${KO.util.esc(topic)}</div>
        <span class="pill ${tt === 'ok' ? 'ok' : tt}">lag ${KO.util.esc(KO.util.fmtLag(summary?.lag || 0))}</span>
        <span class="chip">${parts.length} 分区</span>
      </div>
      <table style="table-layout:auto">
        <thead><tr><th>P</th><th>Current</th><th>End</th><th>Lag</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" class="empty">无分区</td></tr>'}</tbody>
      </table>`
  }

  function wireLagDetailUi() {
    const d = state._lagView
    if (!d) return
    $$('#groupDetail .lag-tabs button').forEach(btn => {
      btn.onclick = () => {
        $$('#groupDetail .lag-tabs button').forEach(b => b.classList.toggle('active', b === btn))
        $$('#groupDetail .lag-tab-pane').forEach(p => p.classList.toggle('active', p.dataset.tab === btn.dataset.tab))
      }
    })
    const q = $('#lagTopicQuery')
    const only = $('#lagOnlyLag')
    if (q) {
      q.value = d.query || ''
      q.oninput = () => {
        d.query = q.value
        KO.util.debounce(() => renderLagTopicList(), 120, '_lagTopicFilterTimer')
      }
    }
    if (only) {
      only.checked = !!d.onlyLag
      only.onchange = () => {
        d.onlyLag = only.checked
        renderLagTopicList()
      }
    }
    renderLagTopicList()
  }

  async function selectGroup(gid) {
    state.selectedGroup = gid
    syncLagActionButtons()
    $$('#groupList .g-row').forEach(el => {
      const on = el.dataset.id === gid
      el.classList.toggle('active', on)
      if (on) el.scrollIntoView({ block: 'nearest' })
    })
    const box = $('#groupDetail')
    const seq = ++state.groupDetailSeq
    box.innerHTML = '<div class="empty">加载 Lag…</div>'
    try {
      const [detail, lag] = await Promise.all([
        KO.bridge.invoke('kafka/group', { groupId: gid }),
        KO.bridge.invoke('kafka/group-lag', { groupId: gid }),
      ])
      if (seq !== state.groupDetailSeq) return
      state.lastGroupLag = lag
      const parts = [...(lag.partitions || [])]
      const totalLag = lag.totalLag || 0
      const tone = KO.util.lagTone(totalLag)
      const byTopic = new Map()
      for (const p of parts) {
        const cur = byTopic.get(p.topic) || { topic: p.topic, lag: 0, parts: 0, hot: 0 }
        cur.lag += p.lag || 0
        cur.parts += 1
        if ((p.lag || 0) > 0) cur.hot += 1
        byTopic.set(p.topic, cur)
      }
      const topicRows = [...byTopic.values()].sort((a, b) => b.lag - a.lag || a.topic.localeCompare(b.topic))
      state._lagTopics = topicRows.map(t => t.topic)
      const members = detail.members || []
      const stateTone = KO.util.groupStateTone(detail.state)
      const hotTopics = topicRows.filter(t => t.lag > 0).length
      const lagHint = totalLag <= 0
        ? '追上水位 · 无积压'
        : `${hotTopics} 个 Topic 有积压 · 点左侧下钻`

      state._lagView = {
        gid,
        parts,
        topicRows,
        members,
        detail,
        selectedTopic: topicRows[0]?.topic || '',
        query: '',
        onlyLag: hotTopics > 0 && topicRows.length > 8,
      }

      const memberHtml = members.length
        ? members.map(m => {
            const asg = (m.assignment || []).map(a => `${a.topic}[${a.partition}]`).join(', ')
            return `<div class="member-chip">
              <div class="mh">${KO.util.esc(m.clientId || m.memberId || '?')} · ${KO.util.esc(m.host || '')}</div>
              <div class="asg">${KO.util.esc(asg || '无分配')}</div>
            </div>`
          }).join('')
        : '<div class="empty">无活跃成员（Empty / 已停止）</div>'

      box.innerHTML = `
        <div class="lag-detail">
          <div class="lag-detail-head">
            <div class="gid-line">
              <strong class="copyable" data-copy-gid title="点击复制">${KO.util.esc(gid)}</strong>
              <span class="pill ${stateTone === 'muted' ? '' : stateTone}">${KO.util.esc(detail.state || '?')}</span>
              <span class="chip" title="coordinator">${KO.util.esc(detail.coordinator || '—')}</span>
            </div>
            <div class="lag-summary">
              <span class="big-v ${tone}">${KO.util.esc(KO.util.fmtLag(totalLag))}</span>
              <span class="h">lag · ${KO.util.esc(lagHint)}</span>
              <span class="chip">${topicRows.length} topics</span>
              <span class="chip">${hotTopics} 积压</span>
              <span class="chip">${members.length} members</span>
            </div>
          </div>
          <div class="lag-tabs">
            <button type="button" class="active" data-tab="topics">Topics · 分区</button>
            <button type="button" data-tab="members">成员 (${members.length})</button>
          </div>
          <div class="lag-tab-pane active" data-tab="topics">
            <div class="lag-topic-tools">
              <input id="lagTopicQuery" placeholder="过滤 Topic 名…" />
              <label class="chk"><input type="checkbox" id="lagOnlyLag" /> 仅有积压</label>
              <span class="hint" id="lagTopicMeta"></span>
            </div>
            <div class="lag-topic-split">
              <div class="lag-topic-list" id="lagTopicList"></div>
              <div class="lag-part-pane" id="lagPartPane"></div>
            </div>
          </div>
          <div class="lag-tab-pane" data-tab="members">
            <div class="member-list">${memberHtml}</div>
          </div>
        </div>`

      const gidEl = box.querySelector('[data-copy-gid]')
      if (gidEl) gidEl.onclick = () => KO.util.copyText(gid, 'Group').catch(() => {})
      wireLagDetailUi()
      if (window.DwSplitPane) {
        DwSplitPane.mount({
          root: box.querySelector('.lag-topic-split'),
          start: '.lag-topic-list',
          end: '.lag-part-pane',
          storageKey: 'dw.split.kafka-ops-lag-topic',
          defaultRatio: 'third',
          defaultWidth: 220,
          minWidth: 160,
          maxWidth: 420,
          stackBelow: 720,
        })
      }
      $('#lagStripSub').textContent = `${gid} · lag ${KO.util.fmtLag(totalLag)} · ${detail.state || '?'}`
    } catch (e) {
      if (seq !== state.groupDetailSeq) return
      state._lagView = null
      box.innerHTML = `<div class="empty" style="padding:16px">${KO.util.esc(e.message || e)}</div>`
    }
  }

  KO.lag = Object.assign(KO.lag || {}, {
    bindGroupRow,
    groupRowHtml,
    syncLagActionButtons,
    applyDangerToDetail,
    filterGroupsLocal,
    loadGroups,
    updateLagStrip,
    renderGroupList,
    openResetDialog,
    deleteSelectedGroup,
    filteredLagTopics,
    renderLagTopicList,
    renderLagPartPane,
    wireLagDetailUi,
    selectGroup,
  });
})();
