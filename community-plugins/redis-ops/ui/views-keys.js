/* Redis Ops — keys */
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

  const FOLDER_ICO = '<span class="tf-folder" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3.5 8.5V7a2 2 0 012-2h4.2l1.6 1.8H18.5a2 2 0 012 2v8.2a2 2 0 01-2 2h-13a2 2 0 01-2-2V8.5z"/></svg></span>'

  const CHEV_CLOSED = '<span class="tf-chev" aria-hidden="true"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M6 3.2v9.6L12.4 8z"/></svg></span>'
  const CHEV_OPEN = '<span class="tf-chev" aria-hidden="true"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.2 6h9.6L8 12.4z"/></svg></span>'
  /* Compact key glyph: round bow + shaft + two bits */
  const KEY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="10" r="3.35"/><circle cx="8" cy="10" r="1.15" fill="currentColor" stroke="none" opacity=".32"/><path d="M11.2 10H20.2"/><path d="M17.1 10v2.55M19.35 10V14"/></svg>'
  function typeIco(type) {
    const t = String(type || 'string').toLowerCase()
    return '<span class="kico t-' + esc(t) + '" aria-hidden="true">' + KEY_SVG + '</span>'
  }


  function keysDetailEmpty() {
    if (S.keysSelectMode) {
      return '<div class="empty"><div class="empty-title">批量删除模式</div><div class="empty-sub">勾选左侧 key，再点「删除 N 个」</div></div>'
    }
    return '<div class="empty"><div class="empty-title">选择一个 key</div><div class="empty-sub">点击左侧列表查看类型、TTL 与内容</div></div>'
  }

  function shortKey(key) {
    const s = String(key || '')
    const parts = s.split(':')
    if (parts.length >= 2) {
      const tail = parts[parts.length - 1]
      let head = parts.slice(0, -1).join(':') + ':'
      if (head.length > 28) head = '…' + head.slice(-26)
      return { head, tail }
    }
    if (s.length <= 42) return { head: '', tail: s }
    return { head: s.slice(0, 14) + '…', tail: s.slice(-22) }
  }

  function setKeysSelectMode(on) {
    S.keysSelectMode = !!on
    if (!S.keysSelectMode) S.selectedKeys = new Set()
    const browser = document.querySelector('.keys-browser')
    if (browser) browser.classList.toggle('select-mode', S.keysSelectMode)
    document.querySelectorAll('#btnSelectMode').forEach(btn => {
      btn.classList.toggle('on', S.keysSelectMode)
      btn.textContent = S.keysSelectMode ? '完成' : '批量'
    })
    paintKeyList()
    paintKeysBulk()
    const detail = document.getElementById('keyDetail')
    if (detail && !S.selectedKey) detail.innerHTML = keysDetailEmpty()
  }

  function paintKeyFocus() {
    const list = document.getElementById('keyList')
    if (!list) return
    list.querySelectorAll('.key-item').forEach((el, i) => {
      el.classList.toggle('kbd-focus', i === S.keyFocusIdx)
    })
    const focused = list.querySelector('.key-item.kbd-focus')
    if (focused && focused.scrollIntoView) {
      focused.scrollIntoView({ block: 'nearest' })
    }
  }

  function moveKeyFocus(delta) {
    if (!S.keyRows.length) return
    if (S.keyFocusIdx < 0) S.keyFocusIdx = S.selectedKey
      ? Math.max(0, S.keyRows.findIndex(k => k.key === S.selectedKey))
      : 0
    else S.keyFocusIdx = Math.max(0, Math.min(S.keyRows.length - 1, S.keyFocusIdx + delta))
    paintKeyFocus()
  }

  async function openFocusedKey() {
    if (S.keyFocusIdx < 0 || S.keyFocusIdx >= S.keyRows.length) return
    await showKey(S.keyRows[S.keyFocusIdx].key)
  }

  async function deleteCurrentKey() {
    const key = S.selectedKey
      || ((S.keyFocusIdx >= 0 && S.keyRows[S.keyFocusIdx]) ? S.keyRows[S.keyFocusIdx].key : null)
    if (!key) return
    if (!confirm('确认删除 key？\n' + key + '\n\n不可恢复。')) return
    await invoke('redis/delete-key', { key })
    toast('已删除')
    const idx = S.keyRows.findIndex(k => k.key === key)
    removeKeyFromList(key)
    const el = document.getElementById('keyDetail')
    if (el) el.innerHTML = keysDetailEmpty()
    if (S.keyRows.length) {
      S.keyFocusIdx = Math.min(Math.max(0, idx), S.keyRows.length - 1)
      paintKeyFocus()
    } else S.keyFocusIdx = -1
  }

  function consoleCmdForKey(key, type) {
    const t = String(type || 'string').toLowerCase()
    if (t === 'hash') return 'HGETALL ' + key
    if (t === 'list') return 'LRANGE ' + key + ' 0 -1'
    if (t === 'set') return 'SMEMBERS ' + key
    if (t === 'zset') return 'ZRANGE ' + key + ' 0 -1 WITHSCORES'
    if (t === 'stream') return 'XRANGE ' + key + ' - + COUNT 20'
    return 'GET ' + key
  }

  function sendKeyToConsole(key, type) {
    S.pendingConsoleCmd = consoleCmdForKey(key, type)
    RO.nav.switchTab('console')
  }

  async function openKeyInBrowser(key) {
    if (!key) return
    if (S.tab !== 'keys') {
      S.pendingOpenKey = key
      RO.nav.switchTab('keys')
      return
    }
    const idx = S.keyRows.findIndex(k => k.key === key)
    if (idx >= 0) S.keyFocusIdx = idx
    await showKey(key)
    paintKeyFocus()
  }

  function keyFromRedisCommand(command) {
    const parts = String(command || '').trim().split(/\s+/)
    const verb = (parts[0] || '').toUpperCase()
    const KEY_CMDS = {
      GET: 1, DUMP: 1, TYPE: 1, TTL: 1, PTTL: 1, EXISTS: 1, STRLEN: 1,
      HGETALL: 1, HLEN: 1, HKEYS: 1, HGET: 1, LLEN: 1, LRANGE: 1,
      SMEMBERS: 1, SCARD: 1, ZCARD: 1, ZRANGE: 1, ZREVRANGE: 1,
      XLEN: 1, XRANGE: 1, XREVRANGE: 1, DEL: 1, UNLINK: 1, MEMORY: 1
    }
    if (verb === 'MEMORY' && (parts[1] || '').toUpperCase() === 'USAGE' && parts[2]) return parts[2]
    if (!KEY_CMDS[verb] || !parts[1]) return null
    if (verb === 'MEMORY') return null
    return parts[1]
  }

  async function loadKeys(reset) {
    if (!S.overview) try { S.overview = await invoke('redis/overview') } catch (e) { /* */ }
    RO.fleet.renderIdentity()
    if (reset) {
      S.keyCursor = '0'; S.keyRows = []; S.selectedKey = null; S.keysDone = false; S.keysPainted = 0
      S.selectedKeys = new Set()
      S.keysSelectMode = false
      S.keyFocusIdx = -1
      S.expandedFolders = Object.create(null)
    }
    const reuse = !reset && S.keyRows.length > 0

    S.topActions.innerHTML = ''

    S.body.innerHTML =
      '<div class="keys-layout">'
      + '<div class="keys-browser' + (S.keysSelectMode ? ' select-mode' : '') + '">'
      + '<div class="keys-toolbar">'
      + '<div class="keys-search' + (S.keyPattern && S.keyPattern !== '*' ? ' has-val' : '') + '" id="keysSearch">'
      + '<span class="ks-lead" title="SCAN MATCH">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'
      + 'MATCH</span>'
      + '<input id="keyFilter" placeholder="如 cache:* 或 user:1001" spellcheck="false" autocomplete="off" value="'
      + esc(S.keyPattern === '*' ? '' : S.keyPattern) + '" />'
      + '<button type="button" class="ks-clear" id="btnClearFilter" title="清空">×</button>'
      + '<button type="button" class="ks-go" id="btnScan" title="立即扫描 · Enter">扫描</button>'
      + '</div>'
      + '<div class="keys-toolbar-acts">'
      + '<div class="keys-seg" id="keysModes" role="tablist" aria-label="列表视图">'
      + '<button type="button" class="keys-mode' + (S.keysTreeFold ? ' active' : '') + '" data-mode="tree" title="按 : 前缀分组，仅整理已加载结果">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M6 5v14M6 8h7M6 12h11M6 16h5"/></svg>前缀树</button>'
      + '<button type="button" class="keys-mode' + (!S.keysTreeFold ? ' active' : '') + '" data-mode="flat" title="按加载顺序平铺显示">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M5 7h14M5 12h14M5 17h14"/></svg>扁平</button>'
      + '</div>'
      + '<button type="button" class="btn btn-ghost btn-select-mode' + (S.keysSelectMode ? ' on' : '') + '" id="btnSelectMode" title="批量删除">'
      + (S.keysSelectMode ? '完成' : '批量') + '</button>'
      + '</div>'
      + '<div class="keys-tree-note" id="keysTreeNote">'
      + (S.keysTreeFold ? '输入 MATCH 后按 Enter 或点扫描 · 树仅整理已加载结果' : '输入 MATCH 后按 Enter 或点扫描 · 扁平列表')
      + '</div>'
      + '<div class="keys-bulk" id="keysBulk"></div>'
      + '<div class="key-list" id="keyList"></div>'
      + '<div class="keys-foot" id="keysFoot"><span id="keysMeta">—</span>'
      + '<span class="keys-hint"><kbd>↑↓</kbd> 选择 <kbd>Enter</kbd> 打开 <kbd>Del</kbd> 删除 <kbd>/</kbd> 搜索</span></div></div>'
      + '<div class="keys-detail" id="keyDetail">' + keysDetailEmpty() + '</div>'
      + '</div>'

    document.getElementById('btnSelectMode').onclick = () => setKeysSelectMode(!S.keysSelectMode)
    document.querySelectorAll('#keysModes .keys-mode').forEach(btn => {
      btn.onclick = () => {
        S.keysTreeFold = btn.dataset.mode === 'tree'
        document.querySelectorAll('#keysModes .keys-mode').forEach(b => {
          b.classList.toggle('active', b.dataset.mode === (S.keysTreeFold ? 'tree' : 'flat'))
        })
        const note = document.getElementById('keysTreeNote')
        if (note) {
          note.textContent = S.keysTreeFold
            ? '输入 MATCH 后按 Enter 或点扫描 · 树仅整理已加载结果'
            : '输入 MATCH 后按 Enter 或点扫描 · 扁平列表'
        }
        paintKeyList()
      }
    })

    function syncFilterChrome() {
      const wrap = document.getElementById('keysSearch')
      const v = ((document.getElementById('keyFilter') || {}).value || '').trim()
      if (wrap) wrap.classList.toggle('has-val', !!v)
    }
    document.getElementById('btnScan').onclick = () => {
      doKeyScan(false).catch(showErr)
    }
    document.getElementById('btnClearFilter').onclick = () => {
      const filter = document.getElementById('keyFilter')
      if (!filter) return
      filter.value = ''
      S.keyPattern = '*'
      syncFilterChrome()
      doKeyScan(false).catch(showErr)
      filter.focus()
    }
    const filter = document.getElementById('keyFilter')
    filter.oninput = () => {
      S.keyPattern = (filter.value || '').trim() || '*'
      syncFilterChrome()
      // 等 Enter / 扫描再查，避免输入过程中反复 SCAN
    }
    filter.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        doKeyScan(false).catch(showErr)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        filter.blur()
        moveKeyFocus(1)
      } else if (e.key === 'Escape') {
        if (filter.value) {
          filter.value = ''
          S.keyPattern = '*'
          syncFilterChrome()
          doKeyScan(false).catch(showErr)
        } else filter.blur()
      }
    }
    const list = document.getElementById('keyList')
    if (list) {
      list.onscroll = () => {
        if (S.keysBusy || S.keysDone) return
        if (list.scrollTop + list.clientHeight >= list.scrollHeight - 56) {
          doKeyScan(true).catch(showErr)
        }
      }
    }

    if (window.DwSplitPane) {
      DwSplitPane.mount({
        root: S.body.querySelector('.keys-layout'),
        start: '.keys-browser',
        end: '.keys-detail',
        storageKey: 'dw.split.redis-ops-keys',
        defaultRatio: 'third',
        defaultWidth: 360,
        minWidth: 260,
        maxWidth: 640,
        stackBelow: 900,
      })
    }

    if (reuse) {
      paintKeyList()
      paintKeysBulk()
      paintKeysMeta()
      setStatus('ok', S.keyRows.length + ' keys')
      if (S.selectedKey) {
        const idx = S.keyRows.findIndex(r => r.key === S.selectedKey)
        if (idx >= 0) S.keyFocusIdx = idx
        await showKey(S.selectedKey).catch(showErr)
        paintKeyFocus()
      }
    } else {
      await doKeyScan(false)
    }
    if (S.pendingOpenKey) {
      const k = S.pendingOpenKey
      S.pendingOpenKey = null
      const idx = S.keyRows.findIndex(r => r.key === k)
      if (idx >= 0) S.keyFocusIdx = idx
      await showKey(k).catch(showErr)
      paintKeyFocus()
    }
    setTimeout(() => {
      const f = document.getElementById('keyFilter')
      if (f && document.activeElement !== f) f.focus()
    }, 0)
  }

  function paintKeysBulk() {
    const bar = document.getElementById('keysBulk')
    const chkAll = document.getElementById('chkAllKeys')
    const n = S.selectedKeys.size
    const total = S.keyRows.length
    if (chkAll) {
      chkAll.checked = total > 0 && n === total
      chkAll.indeterminate = S.keysSelectMode && n > 0 && n < total
    }
    if (!bar) return
    if (!S.keysSelectMode) {
      bar.classList.remove('has-sel')
      bar.innerHTML = ''
      return
    }
    if (!n) {
      bar.classList.remove('has-sel')
      bar.innerHTML =
        '<span class="bulk-count">勾选要删除的 key</span>'
        + '<button type="button" class="btn btn-ghost" id="btnSelAll">全选已加载</button>'
        + '<span class="bulk-spacer"></span>'
        + '<button type="button" class="btn btn-ghost" id="btnExitSel">退出批量</button>'
      document.getElementById('btnSelAll').onclick = () => {
        S.keyRows.forEach(k => S.selectedKeys.add(k.key))
        paintKeyList()
        paintKeysBulk()
      }
      document.getElementById('btnExitSel').onclick = () => setKeysSelectMode(false)
      return
    }
    bar.classList.add('has-sel')
    bar.innerHTML =
      '<span class="bulk-count">已选 ' + n + ' / ' + total + '</span>'
      + '<button type="button" class="btn btn-ghost" id="btnSelAll">全选</button>'
      + '<button type="button" class="btn btn-ghost" id="btnClearSel">清空勾选</button>'
      + '<span class="bulk-spacer"></span>'
      + '<button type="button" class="btn btn-danger" id="btnBulkDel">删除 ' + n + ' 个</button>'
      + '<button type="button" class="btn btn-ghost" id="btnExitSel">完成</button>'
    document.getElementById('btnSelAll').onclick = () => {
      S.keyRows.forEach(k => S.selectedKeys.add(k.key))
      paintKeyList()
      paintKeysBulk()
    }
    document.getElementById('btnClearSel').onclick = () => {
      S.selectedKeys = new Set()
      paintKeyList()
      paintKeysBulk()
    }
    document.getElementById('btnBulkDel').onclick = () => bulkDeleteKeys().catch(showErr)
    document.getElementById('btnExitSel').onclick = () => setKeysSelectMode(false)
  }

  async function bulkDeleteKeys() {
    const keys = Array.from(S.selectedKeys)
    if (!keys.length) return
    if (keys.length > 200) {
      toast('一次最多删除 200 个 key')
      return
    }
    if (!confirm('确认删除 ' + keys.length + ' 个 key？\n使用 UNLINK，不可恢复。')) return
    const res = await invoke('redis/delete-keys', { keys })
    toast('已删除 ' + (res.deleted != null ? res.deleted : keys.length) + ' 个')
    const gone = new Set(keys)
    const wasViewing = S.selectedKey && gone.has(S.selectedKey)
    S.keyRows = S.keyRows.filter(k => !gone.has(k.key))
    S.selectedKeys = new Set()
    if (wasViewing) {
      S.selectedKey = null
      const detail = document.getElementById('keyDetail')
      if (detail) detail.innerHTML = keysDetailEmpty()
    }
    paintKeyList()
    paintKeysMeta()
    paintKeysBulk()
  }

  function paintKeysMeta() {
    const meta = document.getElementById('keysMeta')
    if (!meta) return
    // 加载动画只放列表底部 sentinel，底栏只保留数量，避免重复
    if (!S.keyRows.length && S.keysBusy) {
      meta.textContent = '扫描中…'
      return
    }
    if (S.keysDone) {
      meta.textContent = '共 ' + S.keyRows.length + ' keys'
      return
    }
    meta.textContent = '已加载 ' + S.keyRows.length + ' keys'
  }

  function keyParts(key) {
    const s = String(key || '')
    if (s.includes(':')) return s.split(':')
    return [s]
  }

  function buildKeyTree(rows) {
    const root = { folders: new Map(), keys: [], count: 0 }
    for (const row of rows) {
      const parts = keyParts(row.key)
      if (parts.length <= 1) {
        root.keys.push({ row, leaf: parts[0] || row.key })
        root.count++
        continue
      }
      let node = root
      let path = ''
      for (let i = 0; i < parts.length - 1; i++) {
        const seg = parts[i]
        path = path ? (path + ':' + seg) : seg
        if (!node.folders.has(seg)) {
          node.folders.set(seg, { name: seg, path, folders: new Map(), keys: [], count: 0 })
        }
        node = node.folders.get(seg)
        node.count++
      }
      node.keys.push({ row, leaf: parts[parts.length - 1] })
    }
    return root
  }

  function keyLeafHtml(entry, depth, isNew) {
    const k = entry.row
    const isChecked = S.selectedKeys.has(k.key)
    const focusIdx = S.keyRows.findIndex(r => r.key === k.key)
    const type = String(k.type || '?').toLowerCase()
    const pad = Math.max(0, depth) * 14
    return '<div class="key-item' + (S.selectedKey === k.key ? ' active' : '')
      + (isChecked ? ' checked' : '')
      + (focusIdx === S.keyFocusIdx ? ' kbd-focus' : '')
      + (isNew ? ' is-new' : '') + '" data-key="' + esc(k.key) + '" title="' + esc(k.key)
      + (Number(k.ttl) >= 0 ? (' · TTL ' + k.ttl + 's') : ' · persist') + '"'
      + ' style="padding-left:' + (8 + pad) + 'px">'
      + '<input type="checkbox" class="kcheck"' + (isChecked ? ' checked' : '') + ' />'
      + typeIco(type)
      + '<span class="kleaf">' + esc(entry.leaf) + '</span>'
      + '<span class="ktype-side">' + esc(type) + '</span></div>'
  }

  function renderTreeNode(node, depth, out) {
    const folderNames = [...node.folders.keys()].sort((a, b) => a.localeCompare(b))
    for (const name of folderNames) {
      const child = node.folders.get(name)
      const open = !!S.expandedFolders[child.path]
      const pad = depth * 14
      out.push(
        '<button type="button" class="tree-folder" data-path="' + esc(child.path) + '"'
        + ' style="padding-left:' + (8 + pad) + 'px">'
        + (open ? CHEV_OPEN : CHEV_CLOSED)
        + FOLDER_ICO
        + '<span class="tf-name">' + esc(child.name) + '</span>'
        + '<span class="tf-count">(已加载 ' + child.count + ')</span></button>'
      )
      if (open) renderTreeNode(child, depth + 1, out)
    }
    const leaves = node.keys.slice().sort((a, b) => String(a.leaf).localeCompare(String(b.leaf)))
    for (const entry of leaves) out.push(keyLeafHtml(entry, depth, false))
  }

  function keyTreeHtml() {
    if (!S.keysTreeFold) {
      return S.keyRows.map(k => keyLeafHtml({ row: k, leaf: k.key }, 0, false)).join('')
    }
    const tree = buildKeyTree(S.keyRows)
    const out = []
    renderTreeNode(tree, 0, out)
    return out.join('')
  }

  function bindKeyItemClicks(root) {
    root.querySelectorAll('.tree-folder:not([data-bound])').forEach(el => {
      el.dataset.bound = '1'
      el.onclick = (e) => {
        e.preventDefault()
        e.stopPropagation()
        const path = el.dataset.path
        if (!path) return
        if (S.expandedFolders[path]) delete S.expandedFolders[path]
        else S.expandedFolders[path] = true
        paintKeyList()
      }
    })
    root.querySelectorAll('.key-item:not([data-bound])').forEach(el => {
      el.dataset.bound = '1'
      el.onclick = (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('kcheck')) return
        S.keyFocusIdx = S.keyRows.findIndex(k => k.key === el.dataset.key)
        paintKeyFocus()
        showKey(el.dataset.key).catch(showErr)
      }
      const cb = el.querySelector('.kcheck')
      if (cb) {
        cb.onclick = (e) => e.stopPropagation()
        cb.onchange = () => {
          if (cb.checked) S.selectedKeys.add(el.dataset.key)
          else S.selectedKeys.delete(el.dataset.key)
          el.classList.toggle('checked', cb.checked)
          paintKeysBulk()
        }
      }
    })
  }

  function paintKeyList(opts) {
    const list = document.getElementById('keyList')
    if (!list) return

    if (!S.keyRows.length) {
      S.keysPainted = 0
      list.innerHTML = S.keysBusy
        ? '<div class="key-boot"><span class="key-spin" aria-hidden="true"></span><span>正在扫描 keys…</span></div>'
        : '<div class="empty"><div class="empty-title">无匹配 key</div><div class="empty-sub">修改 MATCH 后按 Enter 或点扫描</div></div>'
      paintKeysBulk()
      S.keyFocusIdx = -1
      return
    }

    const top = list.scrollTop
    list.innerHTML = keyTreeHtml()
    bindKeyItemClicks(list)
    S.keysPainted = S.keyRows.length
    paintKeysBulk()
    list.scrollTop = top
  }

  async function doKeyScan(append) {
    if (S.keysBusy) return
    if (append && S.keysDone) return
    S.keysBusy = true
    paintKeysMeta()
    if (!append) paintKeyList({ append: false })
    try {
      if (!append) {
        S.keyCursor = '0'
        S.keyRows = []
        S.keysDone = false
        S.keysPainted = 0
        S.selectedKey = null
        S.selectedKeys = new Set()
        S.expandedFolders = Object.create(null)
        paintKeysBulk()
        const detail = document.getElementById('keyDetail')
        if (detail) detail.innerHTML = keysDetailEmpty()
        const list = document.getElementById('keyList')
        if (list) {
          list.scrollTop = 0
          list.innerHTML = '<div class="key-boot"><span class="key-spin" aria-hidden="true"></span><span>正在扫描 keys…</span></div>'
        }
      }
      const input = document.getElementById('keyFilter')
      S.keyPattern = ((input && input.value) || '').trim() || '*'
      const res = await invoke('redis/keys', { pattern: S.keyPattern, cursor: S.keyCursor, count: S.KEY_PAGE })
      S.keyCursor = res.cursor || '0'
      const batch = res.keys || []
      S.keyRows = append ? S.keyRows.concat(batch) : batch
      S.keysDone = !!res.done
      setStatus('ok', S.keyRows.length + ' keys')
      paintKeyList({ append: !!append })
      paintKeysMeta()
    } finally {
      S.keysBusy = false
      paintKeysMeta()
    }
    // 首屏未撑满时自动续扫，直到填满或扫完
    const list = document.getElementById('keyList')
    if (list && !S.keysDone && list.scrollHeight <= list.clientHeight + 8) {
      await doKeyScan(true)
    }
  }

  function removeKeyFromList(key) {
    S.selectedKeys.delete(key)
    S.keyRows = S.keyRows.filter(k => k.key !== key)
    if (S.selectedKey === key) S.selectedKey = null
    paintKeyList()
    paintKeysMeta()
    paintKeysBulk()
  }

  async function applyKeyTtl(sec) {
    if (!S.selectedKey) return
    if (!Number.isFinite(sec) || sec < 0) { toast('请输入有效秒数'); return }
    await invoke('redis/expire', { key: S.selectedKey, seconds: sec })
    toast(sec === 0 ? '已持久化 (PERSIST)' : 'TTL → ' + fmtTtl(sec))
    const row = S.keyRows.find(k => k.key === S.selectedKey)
    if (row) row.ttl = sec === 0 ? -1 : sec
    paintKeyList()
    await showKey(S.selectedKey)
  }

  function openKdOps(mode) {
    const ops = document.getElementById('kdOps')
    const ttlBtn = document.getElementById('btnTtlPill')
    if (!ops) return
    const same = ops.dataset.mode === mode && ops.classList.contains('open')
    if (same) {
      ops.classList.remove('open')
      ops.dataset.mode = ''
      if (ttlBtn) ttlBtn.classList.remove('open')
      return
    }
    ops.dataset.mode = mode
    ops.classList.add('open')
    if (ttlBtn) ttlBtn.classList.toggle('open', mode === 'ttl')
    if (mode === 'ttl') {
      ops.innerHTML =
        '<span class="ops-lab">TTL</span>'
        + '<input class="inline-input sm" id="ttlSec" type="number" min="0" placeholder="秒" value="3600" title="0 = 持久化" />'
        + '<button type="button" class="btn btn-primary btn-xs" id="btnExpire">应用</button>'
        + '<button type="button" class="ttl-chip" data-ttl="60">1m</button>'
        + '<button type="button" class="ttl-chip" data-ttl="3600">1h</button>'
        + '<button type="button" class="ttl-chip" data-ttl="86400">1d</button>'
        + '<button type="button" class="ttl-chip" data-ttl="0">持久化</button>'
        + '<button type="button" class="btn btn-ghost btn-xs" id="btnOpsClose">收起</button>'
      const cur = Number((document.getElementById('btnTtlPill') || {}).dataset.ttl)
      const inp = document.getElementById('ttlSec')
      if (inp && Number.isFinite(cur) && cur > 0) inp.value = String(cur)
      document.getElementById('btnExpire').onclick = () => applyKeyTtl(Number(inp.value)).catch(showErr)
      ops.querySelectorAll('.ttl-chip').forEach(btn => {
        btn.onclick = () => applyKeyTtl(Number(btn.dataset.ttl)).catch(showErr)
      })
      document.getElementById('btnOpsClose').onclick = () => openKdOps('ttl')
      if (inp) { inp.focus(); inp.select() }
    } else if (mode === 'rename') {
      ops.innerHTML =
        '<span class="ops-lab">改名</span>'
        + '<input class="inline-input" id="renameTo" placeholder="新 key 名" style="flex:1;min-width:120px" />'
        + '<button type="button" class="btn btn-primary btn-xs" id="btnRename">确认</button>'
        + '<button type="button" class="btn btn-ghost btn-xs" id="btnOpsClose">取消</button>'
      const inp = document.getElementById('renameTo')
      if (inp) {
        inp.value = S.selectedKey || ''
        inp.focus()
        inp.select()
        inp.onkeydown = (e) => { if (e.key === 'Enter') document.getElementById('btnRename').click() }
      }
      document.getElementById('btnRename').onclick = async () => {
        const newKey = (inp.value || '').trim()
        if (!newKey) { toast('请输入新 key 名'); return }
        if (newKey === S.selectedKey) { openKdOps('rename'); return }
        if (!confirm('确认改名？\n' + S.selectedKey + '\n→ ' + newKey)) return
        await invoke('redis/rename', { key: S.selectedKey, newKey })
        const row = S.keyRows.find(k => k.key === S.selectedKey)
        if (row) row.key = newKey
        if (S.selectedKeys.has(S.selectedKey)) {
          S.selectedKeys.delete(S.selectedKey)
          S.selectedKeys.add(newKey)
        }
        S.selectedKey = newKey
        toast('已改名')
        paintKeyList()
        paintKeysBulk()
        await showKey(newKey)
      }
      document.getElementById('btnOpsClose').onclick = () => openKdOps('rename')
    }
  }

  function bindMemberFilter(entriesLen) {
    const flt = document.getElementById('kdFilter')
    const cnt = document.getElementById('kdFilterCnt')
    if (!flt || entriesLen < 6) return
    const apply = () => {
      const q = (flt.value || '').trim().toLowerCase()
      let shown = 0
      document.querySelectorAll('.edit-table tbody tr').forEach(tr => {
        const hay = (tr.dataset.search || tr.textContent || '').toLowerCase()
        const ok = !q || hay.indexOf(q) >= 0
        tr.classList.toggle('is-hidden', !ok)
        if (ok) shown++
      })
      if (cnt) cnt.textContent = q ? (shown + ' / ' + entriesLen) : (entriesLen + '')
    }
    flt.oninput = apply
  }

  async function showKey(key) {
    S.selectedKey = key
    S.keyFocusIdx = S.keyRows.findIndex(k => k.key === key)
    document.querySelectorAll('.key-item').forEach(el => el.classList.toggle('active', el.dataset.key === key))
    paintKeyFocus()
    const detail = document.getElementById('keyDetail')
    if (!detail) return
    detail.innerHTML = shellLoading('读取 key…')
    const d = await invoke('redis/key', { key })
    if (S.selectedKey !== key) return
    const ttlNum = Number(d.ttl)
    const ttlText = fmtTtl(ttlNum)
    const ttlTitle = Number.isFinite(ttlNum) && ttlNum >= 0 ? (ttlNum + 's') : 'persist'
    const entriesLen = (d.entries && d.entries.length) || 0
    const showFilter = entriesLen >= 6 && d.type !== 'string'
    const editor = renderKeyEditor(d)
    detail.innerHTML =
      '<div class="kd-head">'
      + '<div class="kd-key" title="' + esc(d.key) + '">' + esc(d.key) + '</div>'
      + '<div class="kd-head-acts">'
      + '<button type="button" class="btn btn-ghost btn-xs" id="btnRefreshKey" title="刷新">刷新</button>'
      + '<button type="button" class="btn btn-ghost btn-xs" id="btnCopyKey" title="复制 key 名">复制</button>'
      + '<button type="button" class="btn btn-ghost btn-xs" id="btnToConsole" title="送到 Console">Console</button>'
      + '<button type="button" class="btn btn-ghost btn-xs" id="btnToggleRename">改名</button>'
      + '<button type="button" class="btn btn-danger btn-xs" id="btnDel">删除</button>'
      + '</div></div>'
      + '<div class="kd-meta">'
      + '<span class="kd-pill type-' + esc(d.type) + '">type <b>' + esc(d.type) + '</b></span>'
      + '<button type="button" class="kd-pill ttl-btn" id="btnTtlPill" data-ttl="' + esc(ttlNum) + '" title="' + esc(ttlTitle) + ' · 点击修改">ttl <b>' + esc(ttlText) + '</b></button>'
      + '<span class="kd-pill">mem <b>' + esc(d.memoryBytes != null ? fmtBytes(d.memoryBytes) : '—') + '</b></span>'
      + '<span class="kd-pill">data <b>' + esc(entryCountHint(d)) + '</b></span>'
      + '</div>'
      + '<div class="kd-ops" id="kdOps"></div>'
      + (showFilter
        ? '<div class="kd-filter"><input id="kdFilter" type="search" placeholder="过滤当前页成员…" /><span class="flt-count" id="kdFilterCnt">' + entriesLen + '</span></div>'
        : '')
      + editor

    const strBox = document.getElementById('strValue')
    if (strBox) strBox.value = d.stringValue || ''

    document.getElementById('btnRefreshKey').onclick = () => showKey(S.selectedKey).catch(showErr)
    document.getElementById('btnCopyKey').onclick = async () => {
      if (await copyText(d.key)) toast('已复制 key')
      else toast('无法写入剪贴板')
    }
    document.getElementById('btnToConsole').onclick = () => sendKeyToConsole(d.key, d.type)
    document.getElementById('btnToggleRename').onclick = () => openKdOps('rename')
    document.getElementById('btnTtlPill').onclick = () => openKdOps('ttl')
    document.getElementById('btnDel').onclick = () => deleteCurrentKey().catch(showErr)
    bindMemberFilter(entriesLen)
    bindKeyEditor(d)
  }

  function renderKeyEditor(d) {
    const entries = d.entries || []
    if (d.type === 'string') {
      return '<div class="kd-edit"><div class="kd-preview-lab">Value</div>'
        + '<textarea class="val" id="strValue" spellcheck="false"></textarea>'
        + '<div class="edit-add"><button class="btn btn-primary" id="btnSaveStr" disabled><span id="strDirty"></span>保存</button>'
        + '<span class="hint">Ctrl+S 保存 · 保留剩余 TTL · 复制内容用右侧按钮</span>'
        + '<button type="button" class="btn btn-ghost btn-xs" id="btnCopyVal">复制值</button></div></div>'
    }
    if (d.type === 'hash') {
      return '<div class="kd-edit">'
        + '<div class="edit-compose"><div class="compose-lab">添加字段 <span class="hint">Enter 提交</span></div>'
        + '<div class="compose-row">'
        + '<div class="compose-field grow"><label>Field</label><input id="newField" placeholder="field" /></div>'
        + '<div class="compose-field grow"><label>Value</label><input id="newHVal" placeholder="value" /></div>'
        + '<div class="compose-actions"><button class="btn btn-primary" id="btnHAdd">添加</button></div>'
        + '</div></div>'
        + '<div class="edit-members-lab">Fields · ' + entries.length + '</div>'
        + '<div class="edit-table-wrap">'
        + (entries.length
          ? '<table class="edit-table"><thead><tr><th>Field</th><th>Value</th><th class="col-act"></th></tr></thead><tbody>'
            + entries.map((e, i) => '<tr data-i="' + i + '" data-search="' + esc(e.field + ' ' + e.value) + '"><td><input class="hf" value="' + esc(e.field) + '" readonly /></td>'
              + '<td><input class="hv" value="' + esc(e.value) + '" /></td>'
              + '<td class="col-act"><button type="button" class="btn btn-ghost btn-xs btn-hset">保存</button> '
              + '<button type="button" class="btn btn-danger btn-xs btn-hdel">删</button></td></tr>').join('')
            + '</tbody></table>'
          : '<div class="edit-empty">暂无 field</div>')
        + '</div></div>'
    }
    if (d.type === 'list') {
      return '<div class="kd-edit">'
        + '<div class="edit-compose"><div class="compose-lab">追加元素 <span class="hint">Enter = RPUSH</span></div>'
        + '<div class="compose-row">'
        + '<div class="compose-field grow"><label>Value</label><input id="newLVal" placeholder="新元素" /></div>'
        + '<div class="compose-actions">'
        + '<button type="button" class="btn btn-soft" id="btnLPushL" data-side="left">LPUSH</button>'
        + '<button type="button" class="btn btn-primary" id="btnLPush" data-side="right">RPUSH</button>'
        + '</div></div></div>'
        + '<div class="edit-members-lab">Elements · ' + entries.length + '</div>'
        + '<div class="edit-table-wrap">'
        + (entries.length
          ? '<table class="edit-table"><thead><tr><th style="width:40px">#</th><th>Value</th><th class="col-act"></th></tr></thead><tbody>'
            + entries.map(e => '<tr data-i="' + e.index + '" data-search="' + esc(e.value) + '"><td class="mono">' + esc(e.index) + '</td>'
              + '<td><input class="lv" value="' + esc(e.value) + '" /></td>'
              + '<td class="col-act"><button type="button" class="btn btn-ghost btn-xs btn-lset">保存</button></td></tr>').join('')
            + '</tbody></table>'
          : '<div class="edit-empty">空列表</div>')
        + '</div></div>'
    }
    if (d.type === 'set') {
      return '<div class="kd-edit">'
        + '<div class="edit-compose"><div class="compose-lab">添加成员 <span class="hint">Enter 提交</span></div>'
        + '<div class="compose-row">'
        + '<div class="compose-field grow"><label>Member</label><input id="newMember" placeholder="member" /></div>'
        + '<div class="compose-actions"><button class="btn btn-primary" id="btnSAdd">SADD</button></div>'
        + '</div></div>'
        + '<div class="edit-members-lab">Members · ' + entries.length + '</div>'
        + '<div class="edit-table-wrap">'
        + (entries.length
          ? '<table class="edit-table"><thead><tr><th>Member</th><th class="col-act"></th></tr></thead><tbody>'
            + entries.map(e => '<tr data-search="' + esc(e.value) + '"><td class="mono">' + esc(e.value) + '</td>'
              + '<td class="col-act"><button type="button" class="btn btn-danger btn-xs btn-srem" data-m="' + esc(e.value) + '">移除</button></td></tr>').join('')
            + '</tbody></table>'
          : '<div class="edit-empty">空集合</div>')
        + '</div></div>'
    }
    if (d.type === 'zset') {
      return '<div class="kd-edit">'
        + '<div class="edit-compose">'
        + '<div class="compose-lab">添加成员 <span class="hint">ZADD · Enter 提交</span></div>'
        + '<div class="compose-row">'
        + '<div class="compose-field score"><label>Score</label><input id="newZScore" type="number" step="any" placeholder="0" /></div>'
        + '<div class="compose-field grow"><label>Member</label><input id="newZMember" placeholder="member" /></div>'
        + '<div class="compose-actions"><button class="btn btn-primary" id="btnZAdd">ZADD</button></div>'
        + '</div></div>'
        + '<div class="edit-members-lab">Members · ' + entries.length + '</div>'
        + '<div class="edit-table-wrap">'
        + (entries.length
          ? '<table class="edit-table"><thead><tr><th class="col-score">Score</th><th>Member</th><th class="col-act"></th></tr></thead><tbody>'
            + entries.map(e => '<tr data-m="' + esc(e.member) + '" data-search="' + esc(e.member + ' ' + e.score) + '">'
              + '<td><input class="zs" type="number" step="any" value="' + esc(e.score) + '" /></td>'
              + '<td class="mono">' + esc(e.member) + '</td>'
              + '<td class="col-act"><button type="button" class="btn btn-ghost btn-xs btn-zsave">保存</button> '
              + '<button type="button" class="btn btn-danger btn-xs btn-zrem">删</button></td></tr>').join('')
            + '</tbody></table>'
          : '<div class="edit-empty">还没有成员，先在上方添加</div>')
        + '</div></div>'
    }
    if (d.type === 'stream') {
      const fieldsJson = (e) => {
        try { return JSON.stringify(e.fields || {}) } catch (err) { return '{}' }
      }
      return '<div class="kd-edit">'
        + '<div class="edit-compose">'
        + '<div class="compose-lab">追加条目 <span class="hint">XADD · Enter 提交</span></div>'
        + '<div class="compose-row">'
        + '<div class="compose-field grow"><label>Fields JSON</label><input id="newXFields" placeholder=\'{"field":"value"}\' /></div>'
        + '<div class="compose-actions"><button class="btn btn-primary" id="btnXAdd">XADD</button></div>'
        + '</div>'
        + '<div class="compose-row" style="margin-top:8px">'
        + '<div class="compose-field score"><label>XTRIM maxlen</label><input id="xTrimLen" type="number" min="0" placeholder="保留条数" /></div>'
        + '<div class="compose-actions"><button type="button" class="btn btn-soft" id="btnXTrim">XTRIM</button></div>'
        + '</div></div>'
        + '<div class="edit-members-lab">Entries · ' + entries.length
        + (d.streamLength != null ? ' / XLEN ' + d.streamLength : '') + '</div>'
        + '<div class="edit-table-wrap">'
        + (entries.length
          ? '<table class="edit-table"><thead><tr><th style="width:140px">ID</th><th>Fields</th><th class="col-act"></th></tr></thead><tbody>'
            + entries.map(e => '<tr data-id="' + esc(e.id) + '" data-search="' + esc(e.id + ' ' + fieldsJson(e)) + '">'
              + '<td class="mono">' + esc(e.id) + '</td>'
              + '<td class="mono" style="word-break:break-all;font-size:11px">' + esc(fieldsJson(e)) + '</td>'
              + '<td class="col-act"><button type="button" class="btn btn-danger btn-xs btn-xdel">删</button></td></tr>').join('')
            + '</tbody></table>'
          : '<div class="edit-empty">空 stream</div>')
        + '</div></div>'
    }
    return '<div class="kd-preview"><div class="kd-preview-lab">Preview</div><pre>' + esc(d.preview || '') + '</pre></div>'
  }

  function bindEnterSubmit(inputIds, btnId) {
    inputIds.forEach(id => {
      const el = document.getElementById(id)
      if (!el) return
      el.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          const btn = document.getElementById(btnId)
          if (btn) btn.click()
        }
      }
    })
  }

  function bindKeyEditor(d) {
    const saveStr = document.getElementById('btnSaveStr')
    const strBox = document.getElementById('strValue')
    if (saveStr && strBox) {
      const original = d.stringValue || ''
      const dirty = document.getElementById('strDirty')
      const syncSaveStr = () => {
        const changed = strBox.value !== original
        saveStr.disabled = !changed
        if (dirty) dirty.className = changed ? 'dirty-dot' : ''
      }
      syncSaveStr()
      strBox.oninput = syncSaveStr
      const doSave = async () => {
        if (saveStr.disabled) return
        await invoke('redis/set-string', { key: S.selectedKey, value: strBox.value })
        toast('已保存')
        showKey(S.selectedKey)
      }
      saveStr.onclick = () => doSave().catch(showErr)
      strBox.onkeydown = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault()
          doSave().catch(showErr)
        }
      }
    }
    const copyVal = document.getElementById('btnCopyVal')
    if (copyVal && strBox) {
      copyVal.onclick = async () => {
        if (await copyText(strBox.value)) toast('已复制值')
        else toast('无法写入剪贴板')
      }
    }
    bindEnterSubmit(['newField', 'newHVal'], 'btnHAdd')
    bindEnterSubmit(['newLVal'], 'btnLPush')
    bindEnterSubmit(['newMember'], 'btnSAdd')
    bindEnterSubmit(['newZScore', 'newZMember'], 'btnZAdd')
    bindEnterSubmit(['newXFields'], 'btnXAdd')
    document.querySelectorAll('.btn-hset').forEach(btn => {
      const tr = btn.closest('tr')
      const input = tr && tr.querySelector('.hv')
      if (input) {
        const original = input.value
        btn.disabled = true
        input.oninput = () => { btn.disabled = input.value === original }
      }
      btn.onclick = async () => {
        if (btn.disabled) return
        const row = btn.closest('tr')
        await invoke('redis/hash-set', { key: S.selectedKey, field: row.querySelector('.hf').value, value: row.querySelector('.hv').value })
        toast('字段已保存')
        showKey(S.selectedKey)
      }
    })
    document.querySelectorAll('.btn-hdel').forEach(btn => {
      btn.onclick = async () => {
        const field = btn.closest('tr').querySelector('.hf').value
        if (!confirm('删除字段 ' + field + '？')) return
        await invoke('redis/hash-del', { key: S.selectedKey, field })
        toast('字段已删除')
        showKey(S.selectedKey)
      }
    })
    const addH = document.getElementById('btnHAdd')
    if (addH) {
      addH.onclick = async () => {
        const field = document.getElementById('newField').value.trim()
        if (!field) { toast('请输入 field'); return }
        await invoke('redis/hash-set', { key: S.selectedKey, field, value: document.getElementById('newHVal').value })
        toast('已添加字段')
        showKey(S.selectedKey)
      }
    }
    document.querySelectorAll('.btn-lset').forEach(btn => {
      const tr = btn.closest('tr')
      const input = tr && tr.querySelector('.lv')
      if (input) {
        const original = input.value
        btn.disabled = true
        input.oninput = () => { btn.disabled = input.value === original }
      }
      btn.onclick = async () => {
        if (btn.disabled) return
        const row = btn.closest('tr')
        await invoke('redis/list-set', { key: S.selectedKey, index: Number(row.dataset.i), value: row.querySelector('.lv').value })
        toast('已更新元素')
        showKey(S.selectedKey)
      }
    })
    const push = async (side) => {
      const value = document.getElementById('newLVal').value
      await invoke('redis/list-push', { key: S.selectedKey, value, side })
      toast(side === 'left' ? '已 LPUSH' : '已 RPUSH')
      showKey(S.selectedKey)
    }
    const rp = document.getElementById('btnLPush')
    const lp = document.getElementById('btnLPushL')
    if (rp) rp.onclick = () => push('right').catch(showErr)
    if (lp) lp.onclick = () => push('left').catch(showErr)
    document.querySelectorAll('.btn-srem').forEach(btn => {
      btn.onclick = async () => {
        await invoke('redis/set-rem', { key: S.selectedKey, member: btn.dataset.m })
        toast('已移除')
        showKey(S.selectedKey)
      }
    })
    const sadd = document.getElementById('btnSAdd')
    if (sadd) {
      sadd.onclick = async () => {
        const member = document.getElementById('newMember').value
        if (!member) { toast('请输入 member'); return }
        await invoke('redis/set-add', { key: S.selectedKey, member })
        toast('已添加')
        showKey(S.selectedKey)
      }
    }
    document.querySelectorAll('.btn-zsave').forEach(btn => {
      const tr = btn.closest('tr')
      const input = tr && tr.querySelector('.zs')
      if (input) {
        const original = input.value
        btn.disabled = true
        input.oninput = () => { btn.disabled = input.value === original }
      }
      btn.onclick = async () => {
        if (btn.disabled) return
        const row = btn.closest('tr')
        const score = Number(row.querySelector('.zs').value)
        if (!Number.isFinite(score)) { toast('score 无效'); return }
        await invoke('redis/zset-add', { key: S.selectedKey, member: row.dataset.m, score })
        toast('已更新 score')
        showKey(S.selectedKey)
      }
    })
    document.querySelectorAll('.btn-zrem').forEach(btn => {
      btn.onclick = async () => {
        const member = btn.closest('tr').dataset.m
        if (!confirm('ZREM ' + member + '？')) return
        await invoke('redis/zset-rem', { key: S.selectedKey, member })
        toast('已移除')
        showKey(S.selectedKey)
      }
    })
    const zadd = document.getElementById('btnZAdd')
    if (zadd) {
      zadd.onclick = async () => {
        const member = (document.getElementById('newZMember').value || '').trim()
        const score = Number(document.getElementById('newZScore').value)
        if (!member) { toast('请输入 member'); return }
        if (!Number.isFinite(score)) { toast('请输入有效 score'); return }
        await invoke('redis/zset-add', { key: S.selectedKey, member, score })
        toast('已 ZADD')
        showKey(S.selectedKey)
      }
    }
    document.querySelectorAll('.btn-xdel').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.closest('tr').dataset.id
        if (!confirm('XDEL ' + id + '？')) return
        await invoke('redis/stream-del', { key: S.selectedKey, id })
        toast('已删除条目')
        showKey(S.selectedKey)
      }
    })
    const xadd = document.getElementById('btnXAdd')
    if (xadd) {
      xadd.onclick = async () => {
        const raw = (document.getElementById('newXFields').value || '').trim()
        if (!raw) { toast('请输入 fields JSON'); return }
        let fields
        try { fields = JSON.parse(raw) } catch (e) { toast('JSON 无效'); return }
        if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
          toast('fields 须为对象'); return
        }
        const res = await invoke('redis/stream-add', { key: S.selectedKey, fields })
        toast('已 XADD ' + (res.id || ''))
        showKey(S.selectedKey)
      }
    }
    const xtrim = document.getElementById('btnXTrim')
    if (xtrim) {
      xtrim.onclick = async () => {
        const maxlen = Number(document.getElementById('xTrimLen').value)
        if (!Number.isFinite(maxlen) || maxlen < 0) { toast('请输入 maxlen'); return }
        if (!confirm('XTRIM maxlen=' + maxlen + '？')) return
        const res = await invoke('redis/stream-trim', { key: S.selectedKey, maxlen })
        toast('已 TRIM · 删除 ' + (res.trimmed != null ? res.trimmed : '?'))
        showKey(S.selectedKey)
      }
    }
  }



    RO.keys = {
      keysDetailEmpty, typeIco, shortKey, setKeysSelectMode, paintKeyFocus, moveKeyFocus,
      openFocusedKey, deleteCurrentKey, consoleCmdForKey, sendKeyToConsole, openKeyInBrowser,
      keyFromRedisCommand, loadKeys, paintKeysBulk, bulkDeleteKeys, paintKeysMeta,
      paintKeyList, doKeyScan, removeKeyFromList, applyKeyTtl, openKdOps, showKey,
      renderKeyEditor, bindKeyEditor,
    };

  
})();
