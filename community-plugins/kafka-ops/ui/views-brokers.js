/* Kafka Ops — views-brokers.js */
(function () {
  const KO = (window.KO = window.KO || {});
  const state = KO.state;
  const $ = (...a) => KO.util.$(...a);
  const $$ = (...a) => KO.util.$$(...a);
  const VIEW_FRESH_MS = KO.consts.VIEW_FRESH_MS;
  const VIRT_MIN = KO.consts.VIRT_MIN;
  const TOPIC_ROW_H = KO.consts.TOPIC_ROW_H;
  const GROUP_ROW_H = KO.consts.GROUP_ROW_H;

  function brokerBalanceLabel(brokers, totalLeaders) {
    if (!brokers.length || totalLeaders <= 0) return { text: '—', tone: '' }
    const avg = totalLeaders / brokers.length
    const max = Math.max(...brokers.map(b => b.leaderPartitions || 0))
    const ratio = avg > 0 ? max / avg : 1
    if (ratio >= 2) return { text: '倾斜', tone: 'warn' }
    if (ratio >= 1.4) return { text: '略偏', tone: 'warn' }
    return { text: '较均衡', tone: 'ok' }
  }

  function renderBrokerView() {
    const box = $('#brokerGrid')
    const brokers = state._brokers || []
    const leadersPending = !!state._brokersLeadersPending
    const q = ($('#brokerQuery')?.value || '').trim().toLowerCase()
    const totalLeaders = leadersPending
      ? 0
      : brokers.reduce((s, b) => s + Math.max(0, b.leaderPartitions || 0), 0)
    const ctrl = brokers.find(b => b.controller)
    const bal = leadersPending ? { text: '…', tone: '' } : brokerBalanceLabel(brokers, totalLeaders)

    $('#brStatCount').textContent = String(brokers.length)
    $('#brStatCtrl').textContent = ctrl ? `#${ctrl.id}` : '—'
    $('#brStatLeaders').textContent = leadersPending ? '…' : String(totalLeaders)
    const balEl = $('#brStatBalance')
    balEl.textContent = bal.text
    balEl.className = 'v' + (bal.tone === 'ok' ? ' accent' : (bal.tone === 'warn' ? ' warn' : ''))
    balEl.style.color = ''

    $('#brokerStripTitle').textContent = brokers.length ? `${brokers.length} 台 Broker` : 'Broker 节点'
    $('#brokerStripSub').textContent = ctrl
      ? `Controller #${ctrl.id} @ ${ctrl.host}:${ctrl.port}` + (leadersPending ? ' · Leader 统计加载中…' : ` · Leader 总数 ${totalLeaders}`)
      : '尚未识别 Controller'

    const maxLead = Math.max(1, ...brokers.map(b => Math.max(0, b.leaderPartitions || 0)))
    const sortedForBar = [...brokers].sort((a, b) => (b.leaderPartitions || 0) - (a.leaderPartitions || 0))
    const bar = $('#brokerDistBar')
    const legend = $('#brokerDistLegend')
    if (!brokers.length || leadersPending || totalLeaders <= 0) {
      bar.innerHTML = ''
      legend.innerHTML = leadersPending
        ? '<span>Leader 分布后台计算中…</span>'
        : '<span>暂无 Leader 分区统计（可能尚无 Topic）</span>'
      $('#brokerDistHint').textContent = leadersPending ? '先显示节点列表，再补 Leader 占比' : '连接后按各节点 Leader 数量画占比'
    } else {
      bar.innerHTML = sortedForBar.map(b => {
        const pct = Math.max(0.5, 100 * (b.leaderPartitions || 0) / totalLeaders)
        return `<i class="${b.controller ? 'ctrl' : ''}" style="width:${pct}%" title="#${b.id} · ${b.leaderPartitions} leaders"></i>`
      }).join('')
      legend.innerHTML = sortedForBar.slice(0, 8).map(b =>
        `<span>#${b.id}${b.controller ? '★' : ''} ${b.leaderPartitions}（${Math.round(100 * (b.leaderPartitions || 0) / totalLeaders)}%）</span>`
      ).join('')
        + (sortedForBar.length > 8 ? `<span>…+${sortedForBar.length - 8}</span>` : '')
      $('#brokerDistHint').textContent = bal.tone === 'warn'
        ? '存在 Leader 明显偏多的节点（已标黄）'
        : '各段 = 一台 Broker 的 Leader 数量 · ★ 为 Controller'
    }

    let list = brokers
    if (q) {
      list = brokers.filter(b =>
        String(b.id).includes(q)
        || `${b.host}:${b.port}`.toLowerCase().includes(q)
        || String(b.rack || '').toLowerCase().includes(q)
      )
    }
    list = [...list].sort((a, b) => {
      if (a.controller !== b.controller) return a.controller ? -1 : 1
      return (b.leaderPartitions || 0) - (a.leaderPartitions || 0) || a.id - b.id
    })
    $('#brokerListCount').textContent = list.length ? `${list.length}${q ? '/' + brokers.length : ''} 台` : ''

    if (!brokers.length) {
      box.innerHTML = '<div class="empty">无 Broker · 请检查连接</div>'
      return
    }
    if (!list.length) {
      box.innerHTML = '<div class="empty">无匹配节点</div>'
      return
    }

    const avg = totalLeaders / Math.max(1, brokers.length)
    box.innerHTML = `<table class="broker-table">
      <thead><tr>
        <th style="width:52px">ID</th>
        <th>Host</th>
        <th style="width:72px">Rack</th>
        <th style="width:88px">Role</th>
        <th style="width:110px;text-align:right">Leaders</th>
        <th style="width:56px;text-align:right">Share</th>
      </tr></thead>
      <tbody>${list.map(b => {
      const pending = leadersPending || Number(b.leaderPartitions) < 0
      const leaders = pending ? 0 : (b.leaderPartitions || 0)
      const share = pending ? 0 : Math.round(100 * leaders / maxLead)
      const pctAll = (!pending && totalLeaders) ? Math.round(100 * leaders / totalLeaders) : 0
      const skewed = !pending && totalLeaders > 0 && avg > 0 && leaders >= avg * 1.5 && leaders >= 3
      const rowCls = [b.controller ? 'controller' : '', skewed ? 'skew' : ''].filter(Boolean).join(' ')
      return `<tr class="${rowCls}">
        <td class="mono">#${b.id}</td>
        <td class="mono col-name" title="${KO.util.esc(b.host)}:${b.port}">${KO.util.esc(b.host)}:${b.port}</td>
        <td class="muted">${b.rack ? KO.util.esc(b.rack) : '—'}</td>
        <td>${b.controller ? '<span class="pill ok">Controller</span>' : ''}${skewed ? ' <span class="pill warn">偏高</span>' : ''}</td>
        <td style="text-align:right" class="mono">${pending ? '…' : leaders}${pending ? '' : `<span class="share-mini"><i style="width:${share}%"></i></span>`}</td>
        <td style="text-align:right" class="mono muted">${pending ? '…' : pctAll + '%'}</td>
      </tr>`
    }).join('')}</tbody></table>`
  }

  async function loadBrokers({ forceLeaders = false } = {}) {
    const box = $('#brokerGrid')
    if (!forceLeaders) box.innerHTML = '<div class="empty">加载中…</div>'
    try {
      const res = await KO.bridge.invoke('kafka/brokers', { forceLeaders: !!forceLeaders }, { quiet: !!forceLeaders })
      state._brokers = res.brokers || []
      state._brokersLeadersPending = !!res.leadersPending
      renderBrokerView()
      KO.bridge.markRefresh('Brokers')
      KO.nav.markViewFetched('brokers')
      // Cold path: nodes first, then fill leader skew without blocking first paint
      if (res.leadersPending && !forceLeaders) {
        loadBrokers({ forceLeaders: true }).catch(() => {})
      }
    } catch (e) {
      if (forceLeaders) return
      state._brokers = []
      state._brokersLeadersPending = false
      box.innerHTML = `<div class="empty">${KO.util.esc(e.message || e)}</div>`
      $('#brStatCount').textContent = '—'
      $('#brStatCtrl').textContent = '—'
      $('#brStatLeaders').textContent = '—'
      $('#brStatBalance').textContent = '—'
      $('#brokerDistBar').innerHTML = ''
      $('#brokerDistLegend').innerHTML = ''
    }
  }

  KO.brokers = Object.assign(KO.brokers || {}, {
    brokerBalanceLabel,
    renderBrokerView,
    loadBrokers,
  });
})();
