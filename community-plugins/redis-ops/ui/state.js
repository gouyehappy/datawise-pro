/* Redis Ops — state */
(function () {
  const RO = (window.RO = window.RO || {});
  RO.state = {
    connectionId: '',
    activeId: '',
    instances: [],
    fleetQuery: '',
    healthMap: Object.create(null),
    tab: 'keys',
    overview: null,
    allowDangerous: false,
    keyCursor: '0',
    keyRows: [],
    keysDone: false,
    keysBusy: false,
    keysPainted: 0,
    KEY_PAGE: 50,
    selectedKey: null,
    keyPattern: '*',
    keyFocusIdx: -1,
    expandedFolders: Object.create(null),
    keysTreeFold: true,
    termLines: [],
    cmdHistory: [],
    cmdHistIdx: -1,
    toastTimer: null,
    configPattern: '*',
    loading: false,
    pendingTab: null,
    pendingConsoleCmd: null,
    pendingOpenKey: null,
    activeDb: 0,
    databasesCount: 16,
    selectedKeys: new Set(),
    keysSelectMode: false,
    overviewRefreshSec: 0,
    overviewTimer: null,
    overviewRefreshing: false,
    body: null,
    instIdentity: null,
    dbSlot: null,
    topActions: null,
    statusEl: null,
    statusText: null,
    toastEl: null,
    fleetList: null,
    instLabel: null,
    instMeta: null,
    instDot: null,
    instPicker: null,
  };
  RO.initDom = function initDom() {
    const S = RO.state;
    S.body = document.getElementById('body');
    S.instIdentity = document.getElementById('instIdentity');
    S.dbSlot = document.getElementById('dbSlot');
    S.topActions = document.getElementById('topActions');
    S.statusEl = document.getElementById('status');
    S.statusText = document.getElementById('statusText');
    S.toastEl = document.getElementById('toast');
    S.fleetList = document.getElementById('fleetList');
    S.instLabel = document.getElementById('instLabel');
    S.instMeta = document.getElementById('instMeta');
    S.instDot = document.getElementById('instDot');
    S.instPicker = document.getElementById('instPicker');
  };
})();
