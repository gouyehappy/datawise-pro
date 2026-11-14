/* Kafka Ops — fleet.js */
(function () {
  const KO = (window.KO = window.KO || {});
  const state = KO.state;
  const $ = (...a) => KO.util.$(...a);
  const $$ = (...a) => KO.util.$$(...a);
  const VIEW_FRESH_MS = KO.consts.VIEW_FRESH_MS;
  const VIRT_MIN = KO.consts.VIRT_MIN;
  const TOPIC_ROW_H = KO.consts.TOPIC_ROW_H;
  const GROUP_ROW_H = KO.consts.GROUP_ROW_H;

  async function loadClusters() {
    const res = await KO.bridge.invoke('kafka/clusters', { query: $('#clusterSearch').value || '' })
    state.clusters = res.clusters || []
    state.fleet = !!res.fleet || state.clusters.length > 1
    state.activeId = res.activeId || state.activeId || (state.clusters[0]?.id || '')
    renderClusterPicker()
  }

  function renderClusterPicker() {
    const picker = $('#clusterPicker')
    picker.classList.toggle('solo', !state.fleet)
    let active = state.clusters.find(c => c.id === state.activeId) || state.clusters[0]
    // Pulse may succeed via connectionId even before/without inventory rows —
    // fall back to last pulse so the topbar never says「无集群」while healthy.
    if (!active && state._lastPulse) {
      const p = state._lastPulse
      active = {
        id: state.activeId || 'connected',
        name: p.name || p.clusterId || '',
        shortLabel: p.name || (p.bootstrapServers || '').split(',')[0] || '已连接',
        bootstrapServers: p.bootstrapServers || '',
        securityProtocol: p.securityProtocol || '',
      }
    }
    const label = active ? KO.util.shortCluster(active) : '无集群'
    $('#clusterLab').textContent = label
    $('#clusterMeta').textContent = active ? (active.securityProtocol || '') : ''
    $('#clusterTrigger').title = active
      ? `${active.name || ''}\n${active.bootstrapServers || ''}`
      : ''
    const healthKey = state.activeId || (active && active.id) || ''
    const h = state.health[healthKey] || state.health[state.activeId]
    $('#clusterDot').className = 'dot' + (h === 'up' ? ' up' : h === 'down' ? ' down' : '')

    const search = $('#clusterSearch')
    search.style.display = state.fleet ? '' : 'none'
    const box = $('#clusterOpts')
    if (!state.clusters.length) {
      box.innerHTML = active
        ? `<div class="empty" style="text-align:left;padding:8px 10px">${KO.util.esc(label)}<div class="muted" style="margin-top:4px;font-size: var(--dw-text-xs)">${KO.util.esc(active.bootstrapServers || '')}</div></div>`
        : '<div class="empty">无集群</div>'
      return
    }
    box.innerHTML = state.clusters.map(c => `
      <button type="button" class="cluster-row ${c.id === state.activeId ? 'active' : ''}" data-id="${KO.util.esc(c.id)}">
        <span class="dot ${state.health[c.id] === 'up' ? 'up' : state.health[c.id] === 'down' ? 'down' : ''}"></span>
        <span><div class="cname">${KO.util.esc(KO.util.shortCluster(c))}</div><div class="cend">${KO.util.esc(c.bootstrapServers)}</div></span>
        <span class="muted" style="font-size: var(--dw-text-2xs)">${KO.util.esc(c.tags || '')}</span>
      </button>`).join('')
    box.querySelectorAll('.cluster-row').forEach(btn => {
      btn.onclick = async () => {
        state.activeId = btn.dataset.id
        state.selectedTopic = ''
        state.selectedGroup = ''
        state.topicsRaw = []
        state.groupsRaw = []
        state._brokers = []
        state.pulseReady = false
        KO.nav.clearViewFreshness()
        await KO.bridge.invoke('kafka/select', { clusterId: state.activeId })
        await KO.bridge.storeSet('kafka.lastClusterId', state.activeId)
        picker.classList.remove('open')
        renderClusterPicker()
        KO.nav.switchView(state.view, { force: true })
      }
    })
  }

  async function pingAll() {
    const res = await KO.bridge.invoke('kafka/ping-all')
    ;(res.results || []).forEach(r => { state.health[r.id] = r.status })
    renderClusterPicker()
    KO.util.toast(`探测完成 · up ${res.up} / down ${res.down}`)
  }

  KO.fleet = Object.assign(KO.fleet || {}, {
    loadClusters,
    renderClusterPicker,
    pingAll,
  });
})();
