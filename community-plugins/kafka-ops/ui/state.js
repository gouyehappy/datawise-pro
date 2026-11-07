/* Kafka Ops — state.js */
(function () {
  const KO = (window.KO = window.KO || {});

  KO.state = {
    connectionId: '',
    clusters: [],
    fleet: false,
    activeId: '',
    view: 'pulse',
    allowDangerous: false,
    topics: [],
    topicsRaw: [],
    selectedTopic: '',
    topicDetail: null,
    groups: [],
    groupsRaw: [],
    selectedGroup: '',
    lastGroupLag: null,
    exploreTopic: '',
    explorePartition: 0,
    records: [],
    lastDiagnose: '',
    logs: [],
    pulseTimer: null,
    pulseInFlight: false,
    pulseReady: false,
    health: {},
    topicFilterTimer: null,
    groupFilterTimer: null,
    detailSeq: 0,
    topicsSeq: 0,
    groupsSeq: 0,
    groupDetailSeq: 0,
    collapsedNs: {},
    quietInvoke: false,
    viewFetchedAt: {},
  }

  const VIEW_FRESH_MS = 3000
  const VIRT_MIN = 100
  const TOPIC_ROW_H = 26
  const GROUP_ROW_H = 44

  KO.consts = { VIEW_FRESH_MS, VIRT_MIN, TOPIC_ROW_H, GROUP_ROW_H };
  KO.combos = KO.combos || {};
})();
