/* Kafka Ops — nav.js */
(function () {
  const KO = (window.KO = window.KO || {});
  const state = KO.state;
  const $ = (...a) => KO.util.$(...a);
  const $$ = (...a) => KO.util.$$(...a);
  const VIEW_FRESH_MS = KO.consts.VIEW_FRESH_MS;
  const VIRT_MIN = KO.consts.VIRT_MIN;
  const TOPIC_ROW_H = KO.consts.TOPIC_ROW_H;
  const GROUP_ROW_H = KO.consts.GROUP_ROW_H;

  function viewFresh(key) {
    return (Date.now() - (state.viewFetchedAt[key] || 0)) < VIEW_FRESH_MS
  }

  function markViewFetched(key) {
    state.viewFetchedAt[key] = Date.now()
  }

  function clearViewFreshness() {
    state.viewFetchedAt = {}
  }

  function switchView(name, opts = {}) {
    state.view = name
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name))
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name))
    const force = !!opts.force
    if (name === 'topics') {
      if (force || !viewFresh('topics') || !state.topicsRaw.length) KO.topics.loadTopics()
    }
    if (name === 'explorer') KO.explorer.prepareExplorer(opts)
    if (name === 'lag') {
      if (opts.groupId) state.selectedGroup = opts.groupId
      if (force || !viewFresh('lag') || !state.groupsRaw.length || opts.groupId) {
        KO.lag.loadGroups({ force: force || !!opts.groupId })
      } else {
        KO.lag.filterGroupsLocal()
        if (state.selectedGroup) KO.lag.selectGroup(state.selectedGroup)
      }
    }
    if (name === 'brokers') {
      if (force || !viewFresh('brokers') || !(state._brokers || []).length) KO.brokers.loadBrokers()
    }
    if (name === 'pulse') {
      if (force || !viewFresh('pulse')) KO.pulse.loadPulse()
    }
    if (name === 'guard') KO.guard.renderLog()
  }

  KO.nav = Object.assign(KO.nav || {}, {
    viewFresh,
    markViewFetched,
    clearViewFreshness,
    switchView,
  });
})();
