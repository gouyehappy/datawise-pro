/* global datawisePlugin */
(function () {
  'use strict'

  const HOST_COLORS = ['#4d8ef0', '#38bdf8', '#3ecf8e', '#e0b44a', '#c084fc', '#f472b6', '#fb923c']

  const state = {
    connectionId: '',
    group: null,
    servers: [],
    files: [],
    rawLines: [],
    hostFilter: [],
    levels: [],
    levelMulti: false,
    hostMulti: false,
    openStacks: new Set(),
    openBodies: new Set(),
    matchMode: 'contains',
    fileFilter: [],
    selectedKeys: new Set(),
    lastPickKey: '',
    busy: false,
    tab: 'logs',
    following: false,
    followTimer: null,
    followBusy: false,
    stickBottom: true,
    painting: false,
    ignoreScrollUntil: 0,
    lastKeys: new Set(),
    showContext: true,
    contextRadius: 2,
    wrap: true,
    timeFocus: null,
    timeWindow: null,
    uniqueOnly: false,
    scenes: [],
    activeSceneId: '',
    pins: [],
    mutes: [],
    traceId: '',
    cursorKey: '',
    openJson: new Set(),
    prevErrAdded: 0,
    cursors: {},
    paintedKeys: [],
    hostSkew: {},
    histoWindow: null,
    unreadCount: 0,
    followPace: 2,
    keywordHistory: [],
    bookmarks: [],
    clusterFilter: '',
    compare: null,
    lastCompare: null,
    mergeChain: Promise.resolve(),
    searchEpoch: 0,
    followEpoch: 0,
    searchCancelled: false,
    followKeepKeyword: false,
    keywordJoin: 'and',
    olderPage: 0,
    peerEv: null,
    folds: { health: true, stats: true, insight: true, bookmarks: true },
    traceErrorsOnly: false,
    session: {
      serviceName: '',
      logDir: '',
      logGlob: '*.log',
      primaryHost: '',
      user: '',
      password: '',
      privateKey: '',
      defaultPort: 22,
      jumpHost: '',
      jumpPort: 2222,
      jumpUser: '',
      jumpPassword: '',
      jumps: [],
    },
    sessionApplied: false,
    savedProfile: null,
    hydrating: false,
  }

  const $ = (id) => document.getElementById(id)

  function storageKey() {
    return `servers:${state.connectionId || 'default'}`
  }

  function sessionStorageKey() {
    return `session:${state.connectionId || 'default'}`
  }

  function scenesStorageKey() {
    return `scenes:${state.connectionId || 'default'}`
  }

  function setBadge(text, kind) {
    const el = $('healthBadge')
    el.textContent = text
    el.className = 'badge' + (kind ? ` is-${kind}` : '')
  }

  function setStatus(msg) {
    const text = String(msg || '').trim() || '就绪'
    const line = $('statusLine')
    const bar = $('statusBar')
    if (line) {
      line.textContent = text
      line.title = text
    }
    if (!bar) return
    const bad = /失败|错误|超时|Timeout|不可用|连不上|没有进入|请先|不正确/i.test(text)
    const live = /跟随中|LIVE|等待新日志/i.test(text)
    bar.classList.toggle('is-err', bad)
    bar.classList.toggle('is-live', !bad && live)
    bar.classList.toggle('is-ok', !bad && !live && text !== '就绪')
  }

  function setLoading(on) {
    $('logPane').classList.toggle('is-loading', on && state.tab === 'logs')
    $('filePane').classList.toggle('is-loading', on && state.tab === 'files')
  }

  function uid() {
    return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  }

  function normalizeServer(raw, defaultPort) {
    const host = String(raw.host || '').trim()
    const port = Number(raw.port) > 0 ? Number(raw.port) : defaultPort || 22
    const label = String(raw.label || host || 'server').trim()
    return {
      id: String(raw.id || `${host}:${port}`).trim() || uid(),
      host,
      port,
      label,
      enabled: raw.enabled !== false,
      jumpId: String(raw.jumpId || raw.jump_id || '').trim(),
      user: String(raw.user || '').trim(),
      password: String(raw.password || ''),
      logDir: String(raw.logDir || raw.log_dir || '').trim(),
      status: raw.status || '',
      statusKind: raw.statusKind || '',
    }
  }

  function normalizeJump(raw) {
    const host = String(raw.host || '').trim()
    const port = Number(raw.port) > 0 ? Number(raw.port) : 2222
    return {
      id: String(raw.id || `${host}:${port}`).trim() || uid(),
      label: String(raw.label || '').trim(),
      host,
      port,
      user: String(raw.user || '').trim(),
      password: String(raw.password || ''),
    }
  }

  function migrateJumps(session) {
    const hadList = Array.isArray(session.jumps) && session.jumps.some((j) => j && j.host)
    const jumps = hadList
      ? session.jumps.map(normalizeJump).filter((j) => j.host)
      : []
    if (!jumps.length && session.jumpHost) {
      jumps.push(normalizeJump({
        id: '_default',
        label: session.jumpHost,
        host: session.jumpHost,
        port: session.jumpPort || 2222,
        user: session.jumpUser || '',
        password: session.jumpPassword || '',
      }))
      session.assignLegacyJump = true
    }
    session.jumps = jumps
    if (jumps[0]) {
      session.jumpHost = jumps[0].host
      session.jumpPort = jumps[0].port
      session.jumpUser = jumps[0].user
      session.jumpPassword = jumps[0].password
    } else {
      session.jumpHost = ''
      session.jumpPort = 2222
      session.jumpUser = ''
      session.jumpPassword = ''
    }
    return session
  }

  async function applyLegacyJumpIds() {
    if (!state.session.assignLegacyJump) return
    const jump = (state.session.jumps || [])[0]
    if (!jump) {
      delete state.session.assignLegacyJump
      return
    }
    for (const srv of state.servers) {
      if (!srv.jumpId) srv.jumpId = jump.id
    }
    delete state.session.assignLegacyJump
    await saveServers()
    await saveSession()
  }

  function serverPayload(s) {
    return {
      id: s.id,
      host: s.host,
      port: s.port,
      label: s.label,
      enabled: s.enabled !== false,
      jumpId: s.jumpId || '',
      user: s.user || '',
      password: s.password || '',
      logDir: s.logDir || '',
    }
  }

  function jumpLabel(jump) {
    if (!jump) return ''
    const name = jump.label && jump.label !== jump.host ? jump.label : jump.host
    return `${name}:${jump.port || 2222}`
  }

  function parseStoredServers(stored) {
    if (Array.isArray(stored)) return stored
    if (typeof stored === 'string' && stored.trim()) {
      try {
        const parsed = JSON.parse(stored)
        return Array.isArray(parsed) ? parsed : null
      } catch (_) {
        return null
      }
    }
    return null
  }

  async function loadServers() {
    const api = window.datawisePlugin
    let stored = null
    try {
      stored = await api.storage.get(storageKey())
    } catch (_) {
      stored = null
    }
    const defaultPort = state.group?.defaultPort || 22
    const seed = (state.group?.seedServers || []).map((s) => normalizeServer(s, defaultPort))
    const storedList = parseStoredServers(stored)
    const profileServers = savedProfile()?.servers
    const remembered = storedList && storedList.length
      ? storedList
      : (Array.isArray(profileServers) && profileServers.length ? profileServers : null)
    if (remembered && remembered.length) {
      const saved = remembered.map((s) => normalizeServer(s, defaultPort))
      for (const item of seed) {
        if (!saved.some((s) => s.host === item.host && Number(s.port) === Number(item.port))) {
          saved.push(item)
        }
      }
      state.servers = saved
    } else {
      state.servers = seed
    }
    if (state.servers.length) await saveServers()
  }

  async function saveServers() {
    const api = window.datawisePlugin
    const payload = state.servers.map(serverPayload)
    try {
      await api.storage.set(storageKey(), JSON.stringify(payload))
    } catch (e) {
      console.warn('persist servers failed', e)
    }
    await persistProfile()
  }

  function sessionReady() {
    return !!state.session.logDir
  }

  function normalizeDir(path) {
    return String(path || '').trim().replace(/\/+$/, '')
  }

  function dirFromFilePath(file) {
    const text = String(file || '').trim().replace(/\\/g, '/')
    if (!text.includes('/')) return ''
    return normalizeDir(text.replace(/\/[^/]+$/, ''))
  }

  function viewingServers() {
    return state.servers
      .filter((srv) => srv.enabled !== false)
      .filter((srv) => !state.hostFilter.length || state.hostFilter.includes(srv.id))
  }

  function activeLogDirs() {
    const fallback = normalizeDir(state.session.logDir || state.group?.logDir || '')
    const dirs = []
    const seen = new Set()
    for (const srv of viewingServers()) {
      const dir = normalizeDir(srv.logDir || fallback)
      if (!dir || seen.has(dir)) continue
      seen.add(dir)
      dirs.push(dir)
    }
    if (dirs.length) return dirs
    if (fallback) return [fallback]
    const fromFiles = new Set()
    for (const line of state.rawLines) {
      if (state.hostFilter.length && !state.hostFilter.includes(line.hostId) && !state.hostFilter.includes(line.host)) continue
      const dir = dirFromFilePath(line.file || line.filePath || line.path)
      if (dir) fromFiles.add(dir)
    }
    return [...fromFiles]
  }

  function activeLogFiles() {
    const counts = new Map()
    const source = state.rawLines.length ? state.rawLines : []
    for (const line of source) {
      if (state.hostFilter.length && !state.hostFilter.includes(line.hostId) && !state.hostFilter.includes(line.host)) continue
      const name = String(line.file || '').split(/[/\\]/).pop()
      if (!name) continue
      counts.set(name, (counts.get(name) || 0) + 1)
    }
    if (state.fileFilter.length) {
      return state.fileFilter.map((name) => String(name).split(/[/\\]/).pop()).filter(Boolean)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name)
  }

  function syncSessionChrome() {
    const s = state.session
    const dirs = activeLogDirs()
    const files = activeLogFiles()
    const primaryDir = dirs[0] || ''
    const title = s.serviceName || shortName(primaryDir) || state.group?.name || '日志查询'
    const short = shortName(title)
    $('serviceTitle').textContent = short
    $('serviceTitle').title = title
    const sub = $('chromeSub')
    if (sub) {
      const enabled = viewingServers().length || state.servers.filter((srv) => srv.enabled !== false).length
      if (files.length === 1) sub.textContent = files[0]
      else if (files.length > 1) sub.textContent = `${files.length} 个文件`
      else sub.textContent = enabled ? `${enabled} 台实例` : '工作台'
      sub.title = files.length ? files.join(' · ') : ''
    }
    const pathEl = $('chromePath')
    const metaEl = $('chromeMeta')
    const endpoint = $('btnOpenSession')
    if (!endpoint || !pathEl || !metaEl) return
    if (!s.logDir && !dirs.length) {
      pathEl.textContent = '点此配置目录与登录…'
      metaEl.innerHTML = ''
      endpoint.title = '填写日志目录和登录'
      endpoint.classList.add('is-empty')
      return
    }
    endpoint.classList.remove('is-empty')
    let pathText = primaryDir || normalizeDir(s.logDir)
    let pathTitle = pathText
    if (dirs.length > 1) {
      pathText = `${primaryDir} 等 ${dirs.length} 个目录`
      pathTitle = dirs.join('\n')
    } else if (files.length === 1 && primaryDir) {
      pathTitle = `${primaryDir}/${files[0]}`
    }
    pathEl.textContent = pathText || '点此配置目录与登录…'
    pathEl.title = pathTitle
    const jumps = s.jumps || []
    const pills = []
    if (files.length === 1) {
      pills.push(`<span class="chrome__pill is-file" title="${escapeHtml(pathTitle)}">${escapeHtml(files[0])}</span>`)
    } else if (files.length > 1) {
      pills.push(`<span class="chrome__pill is-file" title="${escapeHtml(files.join(' · '))}">${files.length} 个文件</span>`)
    }
    if (s.user) pills.push(`<span class="chrome__pill is-user" title="默认登录用户">默认 ${escapeHtml(s.user)}</span>`)
    if (jumps.length) pills.push(`<span class="chrome__pill is-jump" title="已配置的跳板">${jumps.length} 个跳板</span>`)
    metaEl.innerHTML = pills.join('')
    endpoint.title = '修改查询配置'
  }

  async function loadSession() {
    const api = window.datawisePlugin
    let stored = null
    try {
      stored = await api.storage.get(sessionStorageKey())
    } catch (_) {
      stored = null
    }
    let parsed = null
    if (typeof stored === 'string' && stored.trim()) {
      try { parsed = JSON.parse(stored) } catch (_) { parsed = null }
    } else if (stored && typeof stored === 'object') {
      parsed = stored
    }
    const profile = savedProfile()
    if (!(parsed && parsed.logDir) && profile?.logDir) {
      parsed = profile
    }
    if (parsed && typeof parsed === 'object' && parsed.logDir) {
      state.session = parsed === profile ? sessionFromProfile(profile) : migrateJumps({
        serviceName: String(parsed.serviceName || '').trim(),
        logDir: String(parsed.logDir || '').trim(),
        logGlob: String(parsed.logGlob || '*.log').trim() || '*.log',
        primaryHost: String(parsed.primaryHost || '').trim(),
        user: String(parsed.user || '').trim(),
        password: String(parsed.password || ''),
        privateKey: String(parsed.privateKey || ''),
        defaultPort: Number(parsed.defaultPort) > 0 ? Number(parsed.defaultPort) : 22,
        jumpHost: String(parsed.jumpHost || '').trim(),
        jumpPort: Number(parsed.jumpPort) > 0 ? Number(parsed.jumpPort) : 2222,
        jumpUser: String(parsed.jumpUser || '').trim(),
        jumpPassword: String(parsed.jumpPassword || ''),
        jumps: Array.isArray(parsed.jumps) ? parsed.jumps : [],
      })
    } else if (state.group) {
      state.session = migrateJumps({
        serviceName: state.group.serviceName || state.group.name || '',
        logDir: state.group.logDir || '',
        logGlob: state.group.logGlob || '*.log',
        primaryHost: (state.group.seedServers || [])[0]?.host || '',
        user: state.group.user || '',
        password: '',
        privateKey: '',
        defaultPort: state.group.defaultPort || 22,
        jumpHost: state.group.jumpHost || '',
        jumpPort: state.group.jumpPort || 2222,
        jumpUser: state.group.jumpUser || '',
        jumpPassword: '',
        jumps: Array.isArray(state.group.jumps) ? state.group.jumps : [],
      })
    }
  }

  function savedProfile() {
    const profile = state.savedProfile
    return profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : null
  }

  function sessionFromProfile(profile) {
    return migrateJumps({
      serviceName: String(profile.serviceName || '').trim(),
      logDir: String(profile.logDir || '').trim(),
      logGlob: String(profile.logGlob || '*.log').trim() || '*.log',
      primaryHost: String(profile.primaryHost || '').trim(),
      user: String(profile.user || '').trim(),
      password: String(profile.password || ''),
      privateKey: String(profile.privateKey || ''),
      defaultPort: Number(profile.defaultPort) > 0 ? Number(profile.defaultPort) : 22,
      jumpHost: '',
      jumpPort: 2222,
      jumpUser: '',
      jumpPassword: '',
      jumps: Array.isArray(profile.jumps) ? profile.jumps : [],
    })
  }

  async function persistProfile() {
    if (state.hydrating || !state.connectionId) return
    try {
      await invoke('logs/profile/put', {
        serviceName: state.session.serviceName || '',
        logDir: state.session.logDir || '',
        logGlob: state.session.logGlob || '*.log',
        user: state.session.user || '',
        password: state.session.password || '',
        privateKey: state.session.privateKey || '',
        defaultPort: state.session.defaultPort || 22,
        primaryHost: state.session.primaryHost || '',
        jumps: state.session.jumps || [],
        servers: state.servers.map(serverPayload),
        scenes: state.scenes || [],
      })
    } catch (e) {
      console.warn('persist profile failed', e)
    }
  }

  async function saveSession() {
    try {
      await window.datawisePlugin.storage.set(sessionStorageKey(), JSON.stringify(state.session))
    } catch (e) {
      console.warn('persist session failed', e)
    }
    await persistProfile()
  }

  function readSessionDraft() {
    const typedPassword = $('sessPassword').value
    const keyOpen = $('sessKeyBox')?.open === true
    const password = typedPassword || state.session.password || ''
    const privateKey = keyOpen ? $('sessPrivateKey').value : (state.session.privateKey || '')
    const jumps = (state.session.jumps || []).map(normalizeJump).filter((j) => j.host)
    const first = jumps[0]
    return migrateJumps({
      serviceName: $('sessService').value.trim(),
      logDir: $('sessLogDir').value.trim(),
      logGlob: $('sessLogGlob').value.trim() || '*.log',
      primaryHost: state.session.primaryHost || '',
      user: $('sessUser').value.trim(),
      password,
      privateKey,
      defaultPort: state.session.defaultPort || 22,
      jumpHost: first?.host || '',
      jumpPort: first?.port || 2222,
      jumpUser: first?.user || '',
      jumpPassword: first?.password || '',
      jumps,
    })
  }

  function refreshSessionHint() {
    const draft = readSessionDraft()
    const hint = $('sessionHint')
    const apply = $('btnApplySession')
    const test = $('btnTestSession')
    if (!hint || !apply) return draft
    hint.classList.remove('is-ok', 'is-bad')
    if (!draft.logDir) {
      hint.textContent = '请填写日志目录'
      apply.disabled = true
      if (test) test.disabled = true
    } else if (!state.servers.length) {
      hint.textContent = '再到左侧添加实例。多台跳板或账号可在添加实例时分别选择'
      apply.disabled = false
      if (test) test.disabled = true
    } else {
      hint.textContent = '默认登录只用于没有单独填写账号的实例'
      apply.disabled = false
      if (test) test.disabled = false
    }
    return draft
  }

  function focusSessionGap(next) {
    if (!next.logDir) {
      $('sessLogDir').focus()
      return true
    }
    return false
  }

  async function persistSessionDraft(next) {
    state.session = migrateJumps(next)
    state.sessionApplied = false
    await saveSession()
    await pushSessionConfig()
  }

  function renderJumpList() {
    const list = $('jumpList')
    if (!list) return
    list.innerHTML = ''
    for (const jump of state.session.jumps || []) {
      const li = document.createElement('li')
      li.className = 'jump-item'
      const body = document.createElement('div')
      body.innerHTML =
        `<span class="jump-item__title">${escapeHtml(jump.label || jump.host)}</span>` +
        `<span class="jump-item__meta">${escapeHtml(jump.user || '—')} · ${escapeHtml(jump.host)}:${jump.port || 2222}</span>`
      const actions = document.createElement('div')
      actions.className = 'jump-item__actions'
      const editBtn = document.createElement('button')
      editBtn.type = 'button'
      editBtn.className = 'icon-btn'
      editBtn.title = '编辑'
      editBtn.textContent = '✎'
      editBtn.addEventListener('click', () => openJumpDialog(jump))
      const delBtn = document.createElement('button')
      delBtn.type = 'button'
      delBtn.className = 'icon-btn is-danger'
      delBtn.title = '移除'
      delBtn.textContent = '×'
      delBtn.addEventListener('click', () => {
        state.session.jumps = (state.session.jumps || []).filter((j) => j.id !== jump.id)
        for (const srv of state.servers) {
          if (srv.jumpId === jump.id) srv.jumpId = ''
        }
        migrateJumps(state.session)
        void saveSession()
        void saveServers()
        renderJumpList()
        refreshSessionHint()
      })
      actions.appendChild(editBtn)
      actions.appendChild(delBtn)
      li.appendChild(body)
      li.appendChild(actions)
      list.appendChild(li)
    }
  }

  function openJumpDialog(existing) {
    $('jumpDialogTitle').textContent = existing ? '编辑跳板' : '添加跳板'
    $('editJumpId').value = existing?.id || ''
    $('jmpLabel').value = existing?.label || ''
    $('jmpHost').value = existing?.host || ''
    $('jmpPort').value = existing?.port || 2222
    $('jmpUser').value = existing?.user || ''
    $('jmpPassword').value = ''
    $('jmpPassword').placeholder = existing?.password ? '已保存，留空不改' : '跳板登录密码'
    $('jmpPasswordNote').classList.toggle('hidden', !existing?.password)
    $('jumpDialog').showModal()
    $('jmpHost').focus()
  }

  function commitJump() {
    const host = $('jmpHost').value.trim()
    if (!host) {
      $('jmpHost').focus()
      return
    }
    const editing = $('editJumpId').value
    const prev = (state.session.jumps || []).find((j) => j.id === editing)
    const next = normalizeJump({
      id: editing || uid(),
      label: $('jmpLabel').value.trim(),
      host,
      port: Number($('jmpPort').value) || 2222,
      user: $('jmpUser').value.trim(),
      password: $('jmpPassword').value || prev?.password || '',
    })
    if (!next.password && !prev?.password) {
      $('jmpPassword').focus()
      return
    }
    const list = state.session.jumps || []
    const idx = list.findIndex((j) => j.id === next.id)
    if (idx >= 0) list[idx] = next
    else list.push(next)
    state.session.jumps = list
    migrateJumps(state.session)
    void saveSession()
    $('jumpDialog').close()
    renderJumpList()
    refreshSessionHint()
  }

  function fillServerJumpSelect(selected) {
    const hidden = $('srvJump')
    const menu = $('srvJumpMenu')
    const label = $('srvJumpLabel')
    if (!hidden || !menu || !label) return
    const jumps = state.session.jumps || []
    let value = ''
    if (selected && jumps.some((j) => j.id === selected)) value = selected
    else if (!selected && jumps.length === 1) value = jumps[0].id
    hidden.value = value
    const current = jumps.find((j) => j.id === value)
    label.textContent = current ? jumpLabel(current) : '直连'
    menu.innerHTML = ''
    const options = [{ id: '', title: '直连', meta: '不经过跳板' }].concat(jumps.map((j) => ({
      id: j.id,
      title: j.label && j.label !== j.host ? j.label : j.host,
      meta: `${j.user ? j.user + ' · ' : ''}${j.host}:${j.port || 2222}`,
    })))
    for (const opt of options) {
      const li = document.createElement('li')
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'picker__opt' + (opt.id === value ? ' is-selected' : '')
      btn.setAttribute('role', 'option')
      btn.dataset.value = opt.id
      btn.innerHTML = `<span>${escapeHtml(opt.title)}</span><small>${escapeHtml(opt.meta)}</small>`
      btn.addEventListener('click', () => chooseServerJump(opt.id, opt.id ? jumpLabel(jumps.find((j) => j.id === opt.id)) : '直连'))
      li.appendChild(btn)
      menu.appendChild(li)
    }
  }

  function chooseServerJump(value, text) {
    const hidden = $('srvJump')
    const label = $('srvJumpLabel')
    if (hidden) hidden.value = value || ''
    if (label) label.textContent = text || '直连'
    document.querySelectorAll('#srvJumpMenu .picker__opt').forEach((btn) => {
      btn.classList.toggle('is-selected', btn.dataset.value === (value || ''))
    })
    closeServerJumpMenu()
  }

  function closeServerJumpMenu() {
    const picker = $('srvJumpPicker')
    const menu = $('srvJumpMenu')
    const btn = $('srvJumpBtn')
    if (picker) picker.classList.remove('is-open')
    if (menu) menu.hidden = true
    if (btn) btn.setAttribute('aria-expanded', 'false')
  }

  function toggleServerJumpMenu() {
    const picker = $('srvJumpPicker')
    const menu = $('srvJumpMenu')
    const btn = $('srvJumpBtn')
    if (!picker || !menu || !btn) return
    const open = menu.hidden
    if (!open) {
      closeServerJumpMenu()
      return
    }
    menu.hidden = false
    picker.classList.add('is-open')
    btn.setAttribute('aria-expanded', 'true')
  }

  function openSessionDialog() {
    const s = state.session
    $('sessService').value = s.serviceName || ''
    $('sessLogDir').value = s.logDir || ''
    $('sessLogGlob').value = s.logGlob || '*.log'
    $('sessUser').value = s.user || ''
    $('sessPassword').value = ''
    $('sessPassword').type = 'password'
    $('btnTogglePassword').textContent = '显示'
    $('sessPassword').placeholder = s.password ? '已保存，留空不改' : '密码或私钥二选一'
    $('sessPasswordNote').classList.toggle('hidden', !s.password)
    $('sessPrivateKey').value = s.privateKey || ''
    $('sessKeyBox').open = !!s.privateKey.trim()
    renderJumpList()
    refreshSessionHint()
    $('sessionDialog').showModal()
    if (!s.logDir) $('sessLogDir').focus()
    else if (!s.user) $('sessUser').focus()
    else $('sessLogDir').focus()
  }

  async function testSessionFromDialog() {
    const next = refreshSessionHint()
    if (focusSessionGap(next)) return
    const hint = $('sessionHint')
    const btn = $('btnTestSession')
    if (btn) btn.disabled = true
    hint.textContent = '正在连接…'
    hint.classList.remove('is-ok', 'is-bad')
    try {
      await persistSessionDraft(next)
      const picked = state.servers.filter((s) => s.enabled !== false)
      if (!picked.length) {
        hint.textContent = '请先在左侧添加实例'
        hint.classList.add('is-bad')
        return
      }
      const res = await invoke('logs/probe', { servers: picked.map(serverPayload) })
      applyHostResults(res)
      const rows = res.results || []
      const ok = rows.filter((r) => r.ok).length
      if (ok === rows.length && rows.length) {
        hint.textContent = `已连上 ${ok} 台`
        hint.classList.add('is-ok')
      } else {
        const failed = rows.find((r) => !r.ok)
        hint.textContent = failed?.message || `连上 ${ok} / ${rows.length} 台`
        hint.classList.add(ok ? 'is-ok' : 'is-bad')
      }
      syncSessionChrome()
      setBadge(ok ? 'ready' : 'error', ok ? 'ok' : 'err')
    } catch (e) {
      hint.textContent = e?.message || '暂时连不上'
      hint.classList.add('is-bad')
      setBadge('error', 'err')
    } finally {
      if (btn) btn.disabled = false
    }
  }

  async function applySessionFromDialog() {
    const next = refreshSessionHint()
    if (focusSessionGap(next)) return
    try {
      await persistSessionDraft(next)
    } catch (e) {
      setBadge('error', 'err')
      setStatus(e?.message || String(e))
      return
    }
    $('sessionDialog').close()
    syncSessionChrome()
    renderServers()
    setBadge('ready', 'ok')
    setStatus('配置已应用')
    if (state.servers.some((s) => s.enabled !== false)) {
      await runSearch({ forceTail: true, keepFollow: state.following })
    }
  }

  async function pushSessionConfig() {
    const jumps = (state.session.jumps || []).map((j) => ({
      id: j.id,
      label: j.label || '',
      host: j.host,
      port: j.port || 2222,
      user: j.user || '',
      password: j.password || '',
    }))
    const first = jumps[0]
    const res = await invoke('logs/configure', {
      serviceName: state.session.serviceName || state.session.logDir,
      logDir: state.session.logDir,
      logGlob: state.session.logGlob,
      user: state.session.user,
      password: state.session.password,
      privateKey: state.session.privateKey,
      defaultPort: state.session.defaultPort,
      primaryHost: state.session.primaryHost,
      jumpHost: first?.host || '',
      jumpPort: first?.port || 2222,
      jumpUser: first?.user || '',
      jumpPassword: first?.password || '',
      jumps,
    })
    state.group = res.group || state.group
    state.sessionApplied = true
    return res
  }

  async function ensureSessionApplied() {
    if (!sessionReady()) {
      openSessionDialog()
      throw new Error('请先填写查询配置')
    }
    if (state.sessionApplied) return
    await pushSessionConfig()
  }

  function renderCrumbs() {
    const box = $('crumbs')
    const dirs = activeLogDirs()
    const files = activeLogFiles()
    const service = shortName(state.session.serviceName || dirs[0] || state.group?.serviceName || state.group?.name || '服务')
    const dirLabel = dirs.length > 1
      ? `${dirs[0]} 等 ${dirs.length} 个`
      : (dirs[0] || normalizeDir(state.group?.logDir) || '日志目录')
    const parts = [service, dirLabel]
    if (state.hostFilter.length === 1) {
      const host = state.servers.find((s) => s.id === state.hostFilter[0])
      const shown = host && host.label && host.label !== host.host ? host.label : (host?.host || state.hostFilter[0])
      parts.push(shown)
    } else if (state.hostFilter.length > 1) {
      parts.push(`${state.hostFilter.length} 台实例`)
    }
    if (files.length === 1) parts.push(files[0])
    else if (files.length > 1) parts.push(`${files.length} 个文件`)
    box.innerHTML = parts.map((part, i) => {
      const current = i === parts.length - 1 ? ' is-current' : ''
      const sep = i === 0 ? '' : '<span class="crumb-sep">/</span>'
      return `${sep}<span class="crumb${current}" title="${escapeHtml(part)}">${escapeHtml(part)}</span>`
    }).join('')
    syncFilePickLabel()
  }

  function syncFilePickLabel() {
    const btn = $('btnFilePick')
    if (!btn) return
    const files = activeLogFiles()
    if (files.length === 1) {
      btn.textContent = files[0]
      btn.title = `当前文件：${files[0]}`
      btn.classList.add('is-active')
    } else if (files.length > 1) {
      btn.textContent = `${files.length} 个文件`
      btn.title = files.join('\n')
      btn.classList.add('is-active')
    } else {
      btn.textContent = '当前文件'
      btn.title = '切换当前日志文件'
      btn.classList.remove('is-active')
    }
  }

  function lineLevel(line) {
    const parsed = parseLogBody(line.text)
    return (line.level || parsed.level || '').toUpperCase().replace('WARNING', 'WARN')
  }

  function collectStats() {
    const stats = new Map()
    for (const line of state.rawLines) {
      const key = line.hostId || line.host
      if (!key) continue
      const cur = stats.get(key) || { n: 0, err: 0, warn: 0 }
      cur.n += 1
      const level = lineLevel(line)
      if (level === 'ERROR' || level === 'FATAL') cur.err += 1
      else if (level === 'WARN') cur.warn += 1
      stats.set(key, cur)
    }
    return stats
  }

  function selectHost(id) {
    if (state.hostMulti) {
      toggleValue(state.hostFilter, id)
    } else if (state.hostFilter.length === 1 && state.hostFilter[0] === id) {
      state.hostFilter = []
    } else {
      state.hostFilter = [id]
    }
  }

  function focusHostLevel(id, level) {
    state.hostFilter = [id]
    state.levels = [level]
    state.levelMulti = false
    syncLevelChips()
    paintLines()
    paintFiles()
  }

  function applyFoldState(id, expanded) {
    state.folds[id] = expanded
    const map = {
      health: $('healthRail'),
      stats: $('statsFold'),
      insight: $('insightFold'),
      bookmarks: $('bookmarkFold'),
    }
    const el = map[id]
    if (!el) return
    el.classList.toggle('is-collapsed', !expanded)
    el.querySelector('.side-fold__tog')?.setAttribute('aria-expanded', expanded ? 'true' : 'false')
  }

  function wireFoldToggles() {
    document.querySelectorAll('[data-fold]').forEach((btn) => {
      if (btn.dataset.foldWired) return
      btn.dataset.foldWired = '1'
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const id = btn.dataset.fold
        applyFoldState(id, !state.folds[id])
      })
    })
  }

  function renderSideStats(stats) {
    const box = $('sideStats')
    const fold = $('statsFold')
    if (!box) return
    let n = 0
    let err = 0
    let warn = 0
    for (const line of state.rawLines) {
      if (state.hostFilter.length && !state.hostFilter.includes(line.hostId) && !state.hostFilter.includes(line.host)) continue
      n += 1
      const level = lineLevel(line)
      if (level === 'ERROR' || level === 'FATAL') err += 1
      else if (level === 'WARN') warn += 1
    }
    if (!state.rawLines.length) {
      box.innerHTML = ''
      if (fold) fold.hidden = true
      return
    }
    if (fold) {
      fold.hidden = false
      applyFoldState('stats', state.folds.stats !== false)
    }
    box.innerHTML =
      `<button type="button" data-stat="ALL">行 ${n}</button>` +
      `<button type="button" data-stat="ERROR" class="${err ? 'is-hot' : ''}">错误 ${err}</button>` +
      `<button type="button" data-stat="WARN" class="${warn ? 'is-hot' : ''}">警告 ${warn}</button>`
    box.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const stat = btn.dataset.stat
        state.levels = stat === 'ALL' ? [] : [stat]
        state.levelMulti = false
        syncLevelChips()
        paintLines()
      })
    })
  }

  function hostStatusBrief(message) {
    const text = String(message || '')
    if (/超时|Timeout/i.test(text)) return '超时'
    if (/连不上|无法连接|没有进入/.test(text)) return '连不上'
    if (/没有匹配|无文件/.test(text)) return '无文件'
    if (/密码|认证|登录/.test(text)) return '登录失败'
    return text.length > 6 ? `${text.slice(0, 6)}` : (text || '异常')
  }

  function renderServers() {
    const list = $('serverList')
    list.innerHTML = ''
    $('serverCount').textContent = String(state.servers.length)
    $('btnAllHosts').classList.toggle('is-active', !state.hostFilter.length)
    const multiBtn = $('btnHostMulti')
    if (multiBtn) {
      multiBtn.classList.toggle('is-on', state.hostMulti)
      multiBtn.setAttribute('aria-pressed', state.hostMulti ? 'true' : 'false')
    }
    const stats = collectStats()
    if (!state.servers.length) {
      const empty = document.createElement('li')
      empty.className = 'side-empty'
      empty.textContent = '还没有实例。点上方「添加」把服务器加进来。'
      list.appendChild(empty)
      renderSideStats()
      renderCrumbs()
      return
    }
    const order = state.servers
      .map((srv, idx) => ({ srv, idx }))
      .sort((a, b) => {
        const na = Number(lastIp(a.srv.host))
        const nb = Number(lastIp(b.srv.host))
        if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
        return String(a.srv.host).localeCompare(String(b.srv.host))
      })
    for (const { srv, idx } of order) {
      const li = document.createElement('li')
      li.className = 'server-item'
        + (srv.enabled ? '' : ' is-off')
        + (state.hostFilter.includes(srv.id) ? ' is-selected' : '')

      const use = document.createElement('input')
      use.type = 'checkbox'
      use.className = 'server-item__use'
      use.checked = srv.enabled !== false
      use.title = '参与查询'
      use.addEventListener('click', (e) => e.stopPropagation())
      use.addEventListener('change', async () => {
        srv.enabled = use.checked
        await saveServers()
        renderServers()
        if (state.busy) return
        await runSearch({ forceTail: true, keepFollow: state.following })
      })

      const label = String(srv.label || '').trim()
      const shown = label && label !== srv.host ? label : (srv.host || label)
      const color = hostColor(srv.id || srv.host)
      const rowStats = stats.get(srv.id) || stats.get(srv.host) || { n: 0, err: 0, warn: 0 }
      const hit = document.createElement('button')
      hit.type = 'button'
      hit.className = 'server-item__hit'
      const jump = (state.session.jumps || []).find((j) => j.id === srv.jumpId)
      hit.title = [
        shown !== srv.host ? `${shown} · ${srv.host}:${srv.port}` : `${srv.host}:${srv.port}`,
        jump ? `经 ${jumpLabel(jump)}` : '',
        srv.statusKind === 'err' ? srv.status : '',
      ].filter(Boolean).join(' · ')
      const brief = srv.statusKind === 'err' ? hostStatusBrief(srv.status) : ''
      hit.innerHTML =
        `<i class="swatch${brief ? ' is-down' : ''}" style="background:${color}"></i>` +
        (brief ? `<span class="host-state is-err" title="${escapeHtml(srv.status || '')}">${escapeHtml(brief)}</span>` : '') +
        `<span class="server-item__octet">${escapeHtml(shown)}</span>` +
        `<span class="server-item__meta">` +
          (jump ? `<span class="meta-n" title="经 ${escapeHtml(jumpLabel(jump))}">跳板</span>` : '') +
          (rowStats.n ? `<span class="meta-n" title="当前窗口行数">${rowStats.n}</span>` : '') +
          (rowStats.err ? `<span class="meta-err" data-act="err" title="只看这台的错误">${rowStats.err}</span>` : '') +
          (rowStats.warn ? `<span class="meta-warn" data-act="warn" title="只看这台的警告">${rowStats.warn}</span>` : '') +
        `</span>`
      hit.addEventListener('click', (event) => {
        const act = event.target.closest('[data-act]')
        if (act?.dataset.act === 'err') {
          focusHostLevel(srv.id, 'ERROR')
          return
        }
        if (act?.dataset.act === 'warn') {
          focusHostLevel(srv.id, 'WARN')
          return
        }
        selectHost(srv.id)
        paintLines()
        paintFiles()
        updateSelectionBars()
      })

      const actions = document.createElement('div')
      actions.className = 'server-item__actions'
      const editBtn = document.createElement('button')
      editBtn.type = 'button'
      editBtn.className = 'icon-btn'
      editBtn.title = '编辑'
      editBtn.textContent = '✎'
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        openServerDialog(srv)
      })
      const delBtn = document.createElement('button')
      delBtn.type = 'button'
      delBtn.className = 'icon-btn is-danger'
      delBtn.title = '移除'
      delBtn.textContent = '×'
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation()
        state.servers.splice(idx, 1)
        state.hostFilter = state.hostFilter.filter((id) => id !== srv.id)
        await saveServers()
        renderServers()
        paintLines()
        paintFiles()
      })
      actions.append(editBtn, delBtn)

      if (srv.statusKind === 'err') {
        const re = document.createElement('button')
        re.type = 'button'
        re.className = 'server-item__reconnect'
        re.title = srv.status || '重连这台实例'
        re.textContent = '重连'
        re.addEventListener('click', (e) => {
          e.stopPropagation()
          void reconnectServer(srv)
        })
        actions.prepend(re)
        li.classList.add('is-down')
      }
      li.append(use, hit, actions)
      list.appendChild(li)
    }
    renderSideStats()
    renderCrumbs()
    syncSessionChrome()
  }

  function syncServerPreview() {
    const host = $('srvHost').value.trim()
    const label = $('srvLabel').value.trim()
    const shown = label && label !== host ? label : host
    $('serverPreview').textContent = shown ? `列表中显示为 ${shown}` : '有显示名用显示名，否则显示完整 IP'
    $('btnSaveServer').textContent = $('editServerId').value ? '保存' : '添加'
  }

  function openServerDialog(existing) {
    $('serverDialogTitle').textContent = existing ? '编辑实例' : '添加实例'
    $('serverDialogLede').textContent = existing
      ? '地址保存后，是否参与查询仍用左侧勾选。'
      : '先把地址加进左侧列表。需要跳板时在下面选择。'
    $('editServerId').value = existing?.id || ''
    const label = existing?.label || ''
    $('srvLabel').value = label && label !== existing?.host ? label : ''
    $('srvHost').value = existing?.host || ''
    $('srvPort').value = existing?.port || state.session.defaultPort || 22
    $('srvLogDir').value = existing?.logDir || ''
    $('srvUser').value = existing?.user || ''
    $('srvPassword').value = ''
    $('srvPassword').placeholder = existing?.password ? '已保存，留空不改' : '留空则用默认密码'
    fillServerJumpSelect(existing?.jumpId || '')
    syncServerPreview()
    $('serverDialog').showModal()
    $('srvHost').focus()
    $('srvHost').select()
  }

  function draftServer() {
    const host = $('srvHost').value.trim()
    const editing = $('editServerId').value
    const prev = state.servers.find((s) => s.id === editing)
    return normalizeServer({
      id: editing || `test-${host}`,
      host,
      port: Number($('srvPort').value) || 22,
      label: $('srvLabel').value.trim() || host,
      enabled: true,
      jumpId: $('srvJump')?.value || '',
      user: $('srvUser').value.trim(),
      password: $('srvPassword').value || prev?.password || '',
      logDir: $('srvLogDir').value.trim(),
    }, 22)
  }

  async function testServerFromDialog() {
    const server = draftServer()
    const preview = $('serverPreview')
    if (!server.host) {
      $('srvHost').focus()
      return
    }
    if (!state.session.logDir && !server.logDir) {
      preview.textContent = '先在配置里填写日志目录，或在这里填写这台机器的目录'
      preview.classList.add('is-bad')
      return
    }
    const btn = $('btnTestServer')
    if (btn) btn.disabled = true
    preview.classList.remove('is-ok', 'is-bad')
    preview.textContent = '正在连接…'
    try {
      await ensureSessionApplied()
      const res = await invoke('logs/probe', { servers: [serverPayload(server)] })
      const row = (res.results || [])[0]
      if (row?.ok) {
        const n = Number(row.fileCount) || 0
        preview.textContent = n ? `已连上，找到 ${n} 个日志` : '已连上，这个目录里还没有日志'
        preview.classList.add('is-ok')
      } else {
        preview.textContent = row?.message || '暂时连不上'
        preview.classList.add('is-bad')
      }
    } catch (e) {
      preview.textContent = e?.message || '暂时连不上'
      preview.classList.add('is-bad')
    } finally {
      if (btn) btn.disabled = false
    }
  }

  async function commitServer() {
    const host = $('srvHost').value.trim()
    const port = Number($('srvPort').value) || state.group?.defaultPort || 22
    if (!host) {
      $('srvHost').focus()
      return
    }
    const editing = $('editServerId').value
    const duplicate = state.servers.find((s) => s.host === host && Number(s.port) === port && s.id !== editing)
    if (duplicate && !editing) {
      $('serverDialog').close()
      setStatus(`${lastIp(host)} 已在列表中，正在重新拉取`)
      selectHost(duplicate.id)
      await runSearch({ forceTail: true, keepFollow: state.following })
      return
    }
    const id = editing || uid()
    const prev = state.servers.find((s) => s.id === id)
    const next = normalizeServer({
      id,
      label: $('srvLabel').value.trim() || host,
      host,
      port,
      enabled: prev ? prev.enabled !== false : true,
      jumpId: $('srvJump')?.value || '',
      user: $('srvUser').value.trim(),
      password: $('srvPassword').value || prev?.password || '',
      logDir: $('srvLogDir').value.trim(),
    }, state.group?.defaultPort || 22)
    const idx = state.servers.findIndex((s) => s.id === id)
    if (idx >= 0) state.servers[idx] = { ...state.servers[idx], ...next, status: '', statusKind: '' }
    else state.servers.push(next)
    if (state.hostFilter.length && !state.hostFilter.includes(next.id)) state.hostFilter.push(next.id)
    await saveServers()
    $('serverDialog').close()
    if (!next.enabled) {
      renderServers()
      setStatus(`${lastIp(host)} 已保存，未参与查询`)
      return
    }
    if (state.busy) {
      renderServers()
      setStatus(`${lastIp(host)} 已在列表中，当前查询结束后点「尾部」即可带上它`)
      return
    }
    setStatus(`已加入 ${lastIp(host)}，正在拉取日志…`)
    await runSearch({ forceTail: true, keepFollow: state.following })
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function queryOptions() {
    return {
      keyword: $('keyword').value.trim(),
      matchMode: state.matchMode,
      ignoreCase: $('ignoreCase').checked,
      exclude: $('exclude').value.trim(),
      remoteGrep: $('remoteGrep').checked,
      keywordJoin: state.keywordJoin === 'or' ? 'or' : 'and',
    }
  }

  function parseExcludeTerms(raw) {
    const text = String(raw || '').trim()
    if (!text) return []
    const out = []
    let buf = ''
    let inQuote = false
    for (const ch of text) {
      if (ch === '"') {
        inQuote = !inQuote
        continue
      }
      if ((ch === ',' || ch === '|') && !inQuote) {
        const term = buf.trim()
        if (term) out.push(term)
        buf = ''
        continue
      }
      buf += ch
    }
    const last = buf.trim()
    if (last) out.push(last)
    return out.length ? out : [text]
  }

  function termHits(row, term, opts) {
    if (opts.matchMode === 'regex') {
      return new RegExp(term, opts.ignoreCase ? 'i' : '').test(row)
    }
    if (opts.matchMode === 'exact') {
      const left = row.trim()
      const right = term.trim()
      return opts.ignoreCase ? left.toLowerCase() === right.toLowerCase() : left === right
    }
    if (opts.matchMode === 'whole') {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return new RegExp(`\\b${escaped}\\b`, opts.ignoreCase ? 'i' : '').test(row)
    }
    if (opts.ignoreCase) return row.toLowerCase().includes(term.toLowerCase())
    return row.includes(term)
  }

  function lineMatches(text, opts) {
    const row = String(text ?? '')
    const excludes = parseExcludeTerms(opts.exclude)
    if (excludes.some((term) => rowIncludes(row, term, opts.ignoreCase))) return false
    const keywords = parseExcludeTerms(opts.keyword)
    if (!keywords.length) return true
    try {
      if (opts.matchMode === 'exact' || opts.keywordJoin === 'or') {
        return keywords.some((term) => termHits(row, term, opts))
      }
      return keywords.every((term) => termHits(row, term, opts))
    } catch (_) {
      return true
    }
  }

  function rowIncludes(row, term, ignoreCase) {
    if (ignoreCase) return row.toLowerCase().includes(term.toLowerCase())
    return row.includes(term)
  }

  function messageRanges(raw, opts) {
    const ranges = []
    const keywords = parseExcludeTerms(opts.keyword)
    if (keywords.length && opts.matchMode !== 'exact') {
      try {
        const flags = opts.ignoreCase ? 'gi' : 'g'
        const parts = keywords.map((term) => {
          if (opts.matchMode === 'regex') return term
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          return opts.matchMode === 'whole' ? `\\b${escaped}\\b` : escaped
        })
        const re = new RegExp(parts.join('|'), flags)
        for (const match of raw.matchAll(re)) {
          if (match.index == null) continue
          ranges.push({ start: match.index, end: match.index + match[0].length, kind: 'mark' })
        }
      } catch (_) { /* invalid regex stays plain */ }
    }
    const tokenRe = /(?:(?:traceId|trace_id|requestId|request_id|reqId|req_id|spanId|span_id|correlationId|correlation_id|TID)\s*[=:#]\s*['"]?)([A-Za-z0-9_.:-]{6,80})|(\b[A-Z][A-Za-z0-9_.]*(?:Exception|Error)\b)/gi
    for (const match of raw.matchAll(tokenRe)) {
      const value = match[1] || match[2]
      if (!value || match.index == null) continue
      const start = match.index + match[0].lastIndexOf(value)
      ranges.push({ start, end: start + value.length, kind: match[1] ? 'trace' : 'token', value })
    }
    ranges.sort((a, b) => a.start - b.start || (a.kind === 'token' ? -1 : 1))
    return ranges
  }

  function highlight(text, opts) {
    const raw = String(text ?? '')
    const ranges = messageRanges(raw, opts)
    if (!ranges.length) return escapeHtml(raw)
    let out = ''
    let last = 0
    for (const range of ranges) {
      if (range.start < last) continue
      out += escapeHtml(raw.slice(last, range.start))
      const body = escapeHtml(raw.slice(range.start, range.end))
      if (range.kind === 'token' || range.kind === 'trace') {
        out += `<button type="button" class="log-token" data-kind="${range.kind}" data-token="${escapeHtml(range.value)}">${body}</button>`
      } else {
        out += `<span class="mark">${body}</span>`
      }
      last = range.end
    }
    return out + escapeHtml(raw.slice(last))
  }

  function toggleKeyword(term) {
    const name = String(term || '').trim()
    if (!name) return
    const terms = parseExcludeTerms($('keyword').value)
    const index = terms.findIndex((item) => item.toLowerCase() === name.toLowerCase())
    if (index >= 0) terms.splice(index, 1)
    else terms.push(name)
    $('keyword').value = terms.join(', ')
    syncKeywordClear()
    refreshLocalFilter()
  }

  function mutesStorageKey() {
    return `mutes:${state.connectionId || 'default'}`
  }

  function isMuted(ev) {
    if (!state.mutes.length) return false
    const logger = ev.parsed?.loggerFull || ev.parsed?.logger || ''
    const sig = eventSignature(ev)
    return state.mutes.some((mute) => {
      if (mute.kind === 'logger') return logger === mute.value || ev.parsed?.logger === mute.value
      return mute.kind === 'sig' && sig === mute.value
    })
  }

  function countMuteHits(kind, value) {
    const probe = { kind, value: String(value || '') }
    return viewEvents().filter((ev) => {
      if (ev.context) return false
      const logger = ev.parsed?.loggerFull || ev.parsed?.logger || ''
      if (probe.kind === 'logger') return logger === probe.value || ev.parsed?.logger === probe.value
      return eventSignature(ev) === probe.value
    }).length
  }

  async function requestMute(kind, value, label) {
    const name = String(value || '').trim()
    if (!name) return
    if (state.mutes.some((mute) => mute.kind === kind && mute.value === name)) {
      setStatus('这类已经屏蔽')
      return
    }
    const hits = countMuteHits(kind, name)
    const ok = await askConfirm(
      '确认屏蔽',
      `将屏蔽「${shortName(label || name)}」，大约藏掉当前窗口里的 ${hits} 条。`,
      '屏蔽'
    )
    if (!ok) return
    const named = await askName('命名这条屏蔽（可选）', '方便以后识别，可直接回车用默认名。', shortName(label || name))
    state.mutes.push({ kind, value: name, label: named || label || name })
    saveMutes()
    refreshLocalFilter()
    setStatus(`已屏蔽 ${shortName(named || label || name)} · ${hits} 条`)
  }

  function askConfirm(title, lede, okLabel) {
    const dlg = $('nameDialog')
    const input = $('nameDialogInput')
    const field = $('nameDialogField')
    $('nameDialogTitle').textContent = title
    $('nameDialogLede').textContent = lede
    $('btnConfirmName').textContent = okLabel || '确定'
    if (field) field.classList.add('hidden')
    input.value = ''
    return new Promise((resolve) => {
      let settled = false
      const done = (ok) => {
        if (settled) return
        settled = true
        if (field) field.classList.remove('hidden')
        $('btnConfirmName').textContent = '保存'
        if (dlg.open) dlg.close()
        resolve(ok)
      }
      const onOk = () => done(true)
      const onCancel = () => done(false)
      const onDialogCancel = (e) => {
        e.preventDefault()
        done(false)
      }
      $('btnConfirmName').addEventListener('click', onOk)
      $('btnCancelName').addEventListener('click', onCancel)
      dlg.addEventListener('cancel', onDialogCancel)
      dlg.addEventListener('close', () => {
        $('btnConfirmName').removeEventListener('click', onOk)
        $('btnCancelName').removeEventListener('click', onCancel)
        dlg.removeEventListener('cancel', onDialogCancel)
        if (field) field.classList.remove('hidden')
        $('btnConfirmName').textContent = '保存'
        done(false)
      }, { once: true })
      dlg.showModal()
      $('btnConfirmName').focus()
    })
  }

  async function loadMutes() {
    let stored = null
    try {
      stored = await window.datawisePlugin.storage.get(mutesStorageKey())
    } catch (_) {
      stored = null
    }
    let parsed = null
    if (typeof stored === 'string' && stored.trim()) {
      try { parsed = JSON.parse(stored) } catch (_) { parsed = null }
    } else if (Array.isArray(stored)) {
      parsed = stored
    }
    state.mutes = Array.isArray(parsed)
      ? parsed.filter((item) => item && item.value).map((item) => ({
          kind: item.kind === 'logger' ? 'logger' : 'sig',
          value: String(item.value),
          label: String(item.label || item.value),
        }))
      : []
  }

  async function saveMutes() {
    try {
      await window.datawisePlugin.storage.set(mutesStorageKey(), JSON.stringify(state.mutes))
    } catch (_) { /* keep the in-memory list */ }
  }

  function collectTraceEvents(id) {
    const needle = String(id || '')
    if (!needle) return []
    return foldLines(state.rawLines)
      .filter((ev) => eventBlob(ev).includes(needle))
      .sort((a, b) => eventTimeMs(a) - eventTimeMs(b))
  }

  function openTrace(id) {
    const name = String(id || '').trim()
    if (!name) return
    state.traceId = name
    renderTrace()
  }

  function closeTrace() {
    state.traceId = ''
    const panel = $('tracePanel')
    if (panel) panel.classList.add('hidden')
  }

  function renderTrace() {
    const panel = $('tracePanel')
    const body = $('traceBody')
    if (!panel || !body) return
    if (!state.traceId) {
      panel.classList.add('hidden')
      return
    }
    const events = collectTraceEvents(state.traceId)
    panel.classList.remove('hidden')
    $('traceTitle').textContent = state.traceId
    const firstMs = events.length ? eventTimeMs(events[0]) : 0
    const hosts = new Set(events.map((ev) => ev.host || ev.line?.hostId || ''))
    let windowed = state.histoWindow
      ? events.filter((ev) => {
          const ts = eventTimeMs(ev)
          return !ts || (ts >= state.histoWindow.fromMs && ts <= state.histoWindow.toMs)
        })
      : events
    if (state.traceErrorsOnly) {
      windowed = windowed.filter((ev) => ev.level === 'ERROR' || ev.level === 'FATAL')
    }
    $('btnTraceErrors')?.classList.toggle('is-on', state.traceErrorsOnly)
    $('btnTraceErrors')?.setAttribute('aria-pressed', state.traceErrorsOnly ? 'true' : 'false')
    let prevMs = 0
    body.innerHTML = windowed.map((ev) => {
      const ts = eventTimeMs(ev)
      const step = prevMs && ts ? `+${formatGap(Math.max(0, ts - prevMs))}` : (ts && firstMs ? '+0 毫秒' : '')
      if (ts) prevMs = ts
      const bad = ev.level === 'ERROR' || ev.level === 'FATAL'
      const msg = String(ev.parsed?.message || ev.line?.text || '').replace(/\s+/g, ' ').slice(0, 180)
      return `<button type="button" class="trace-row${bad ? ' is-error' : ''}" data-key="${escapeHtml(lineKey(ev.line))}" data-ts="${ts || 0}">` +
        `<span class="trace-row__when">${escapeHtml(formatClock(ev.line).slice(11))}</span>` +
        `<span class="trace-row__delta">${escapeHtml(step)}</span>` +
        `<span class="trace-row__host">${escapeHtml(lastIp(ev.line.host || ev.line.hostLabel))}</span>` +
        `<span class="trace-row__level">${escapeHtml(ev.level || '·')}</span>` +
        `<span class="trace-row__msg">${escapeHtml(msg)}</span>` +
        `</button>`
    }).join('')
    if (!events.length) $('traceMeta').textContent = '当前窗口里没有这条链路'
    else if (!windowed.length) $('traceMeta').textContent = '这一分钟里没有链路日志'
    else {
      $('traceMeta').textContent =
        `${windowed.length}${windowed.length === events.length ? '' : ` / ${events.length}`} 条 · ${hosts.size} 台 · ${formatClock(events[0].line)} 起`
    }
    body.querySelectorAll('.trace-row').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key || ''
        const row = [...document.querySelectorAll('#logStream .log-line')].find((el) => el.dataset.key === key)
        if (row) {
          state.cursorKey = key
          if (state.following) state.stickBottom = false
          focusLogRow(row)
          return
        }
        const ts = Number(btn.dataset.ts || 0)
        if (!$('keyword').value.includes(state.traceId)) toggleKeyword(state.traceId)
        if (ts) setTimeFocus(ts)
      })
    })
  }

  function renderHisto(events) {
    const el = $('errorHisto')
    if (!el) return
    const buckets = new Map()
    for (const ev of events) {
      if (ev.context) continue
      const level = ev.level
      if (level !== 'ERROR' && level !== 'FATAL' && level !== 'WARN') continue
      const ts = eventTimeMs(ev)
      if (!ts) continue
      const minute = Math.floor(ts / 60000) * 60000
      const slot = buckets.get(minute) || { t: minute, error: 0, warn: 0 }
      if (level === 'WARN') slot.warn += ev.repeat || 1
      else slot.error += ev.repeat || 1
      buckets.set(minute, slot)
    }
    const slots = [...buckets.values()].sort((a, b) => a.t - b.t)
    const clusters = collectClusters(events).slice(0, 6)
    $('clusterBar')?.classList.add('hidden')
    if (slots.length < 2 && !clusters.length) {
      el.classList.add('hidden')
      el.innerHTML = ''
      return
    }
    let step = 60000
    let bars = []
    if (slots.length) {
      const span = slots[slots.length - 1].t - slots[0].t
      step = span > 48 * 60000 ? Math.ceil(span / 48 / 60000) * 60000 : 60000
      const merged = new Map()
      for (const slot of slots) {
        const t = Math.floor(slot.t / step) * step
        const cur = merged.get(t) || { t, error: 0, warn: 0 }
        cur.error += slot.error
        cur.warn += slot.warn
        merged.set(t, cur)
      }
      bars = [...merged.values()]
    }
    const max = Math.max(1, ...bars.map((bar) => bar.error + bar.warn))
    el.classList.remove('hidden')
    const chips = clusters.map((c) =>
      `<button type="button" class="cluster-chip${state.clusterFilter === c.key ? ' is-on' : ''}" data-key="${escapeHtml(c.key)}" title="${escapeHtml(c.name + ' · ' + c.message)}">` +
      `${escapeHtml(shortName(c.name))} <em>${c.count}</em></button>`
    ).join('') + (state.clusterFilter ? `<button type="button" class="cluster-chip is-clear" data-key="">看全部异常</button>` : '')
    el.innerHTML =
      (chips ? `<div class="histo__chips">${chips}</div>` : '') +
      (bars.length ? `<div class="histo__bars">` + bars.map((bar) => {
      const total = bar.error + bar.warn
      const h = Math.max(4, Math.round((total / max) * 26))
      const eh = total ? Math.round((bar.error / total) * h) : 0
      const label = formatQueryTime(bar.t).slice(11, 16)
      return `<button type="button" class="histo__bar" data-from="${bar.t}" data-to="${bar.t + step - 1}" title="${label} · ERROR ${bar.error} · WARN ${bar.warn}">` +
        `<span class="histo__stack" style="height:${h}px"><i class="is-warn" style="height:${Math.max(0, h - eh)}px"></i><i class="is-err" style="height:${eh}px"></i></span>` +
        `<em>${label}</em></button>`
      }).join('') + `</div>` : '')
    el.querySelectorAll('.cluster-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key || ''
        state.clusterFilter = state.clusterFilter === key ? '' : key
        refreshLocalFilter()
      })
    })
    el.querySelectorAll('.histo__bar').forEach((btn) => {
      const from = Number(btn.dataset.from)
      const to = Number(btn.dataset.to)
      if (state.histoWindow && state.histoWindow.fromMs === from) btn.classList.add('is-active')
      btn.addEventListener('click', () => {
        state.timeFocus = null
        if (state.histoWindow && state.histoWindow.fromMs === from) {
          state.histoWindow = null
          state.timeWindow = null
        } else {
          state.histoWindow = { fromMs: from, toMs: to }
          state.timeWindow = { fromMs: from, toMs: to }
        }
        if (state.traceId) renderTrace()
        refreshLocalFilter()
      })
    })
  }

  const LF = window.LogFormat || {}
  const maybeJson = LF.maybeJson || ((text) => /[{[]\s*["{[]/.test(String(text || '')))
  const prettyJson = LF.prettyJson || (() => '')
  const messageIsLong = LF.messageIsLong || ((text) => String(text || '').length > 160)
  const previewMessage = LF.previewMessage || ((text) => String(text || '').slice(0, 160))
  const stackPeek = LF.stackPeek || (() => '')
  const sameSecond = LF.sameSecond || (() => false)
  const formatClock = LF.formatClock || ((line) => {
    if (line && line.ts) return String(line.ts).replace('T', ' ').replace(/Z$/, '')
    if (line && line.tsMs) {
      const d = new Date(line.tsMs)
      if (Number.isNaN(d.getTime())) return '—'
      const p = (n, w = 2) => String(n).padStart(w, '0')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
    }
    return '—'
  })
  const relativeTime = LF.relativeTime || (() => '')
  const formatClockCompact = LF.formatClockCompact || ((line) => formatClock(line))

  function activeLogDirsSafe() {
    try { return activeLogDirs() } catch (_) { return [] }
  }

  function buildIncidentNote() {
    const events = viewEvents().filter((ev) => !ev.context)
    const hosts = [...new Set(events.map((ev) => ev.line.hostLabel || ev.line.host).filter(Boolean))]
    const times = events.map(eventTimeMs).filter(Boolean)
    const from = times.length ? formatQueryTime(Math.min(...times)) : ''
    const to = times.length ? formatQueryTime(Math.max(...times)) : ''
    const pins = state.pins.map((pin) => `- ${pin.ts} ${pin.host} ${pin.level} ${pin.message}`).join('\n')
    const shown = events.slice(0, 80).map((ev) => {
      const first = ev.first || ev.line
      const msg = String(ev.parsed?.message || first.text || '').replace(/\s+/g, ' ').slice(0, 220)
      return `- ${formatClock(first)} [${first.hostLabel || first.host}] ${ev.level || ''} ${msg}`
    }).join('\n')
    const more = events.length > 80 ? `\n… 另有 ${events.length - 80} 条` : ''
    const scene = state.scenes.find((s) => s.id === state.activeSceneId)
    const files = activeLogFiles()
    return [
      `服务 ${$('serviceTitle')?.textContent || ''}`.trim(),
      scene ? `场景 ${scene.name}` : '',
      activeLogDirsSafe().length ? `目录 ${activeLogDirsSafe().join('、')}` : '',
      files.length ? `文件 ${files.join('、')}` : '',
      from ? `时间 ${from} → ${to}` : '',
      hosts.length ? `实例 ${hosts.join('、')}` : '',
      $('keyword').value.trim() ? `关键字 ${$('keyword').value.trim()}` : '',
      state.levels.length ? `级别 ${state.levels.join(', ')}` : '',
      pins ? `钉住\n${pins}` : '',
      shown ? `日志\n${shown}${more}` : '日志\n当前窗口没有可见日志',
    ].filter(Boolean).join('\n')
  }

  function moveCursor(dir) {
    const rows = [...document.querySelectorAll('#logStream .log-line')]
    if (!rows.length) return
    let index = rows.findIndex((row) => row.dataset.key === state.cursorKey || row.classList.contains('is-focus'))
    if (index < 0) index = dir > 0 ? -1 : rows.length
    index = Math.max(0, Math.min(rows.length - 1, index + dir))
    state.cursorKey = rows[index].dataset.key || ''
    if (state.following) {
      state.stickBottom = false
      $('btnJumpBottom')?.classList.remove('hidden')
    }
    focusLogRow(rows[index])
  }

  function hostColor(hostId) {
    let h = 0
    const s = String(hostId || '')
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
    return HOST_COLORS[h % HOST_COLORS.length]
  }

  function visibleLines() {
    const opts = queryOptions()
    return state.rawLines.filter((line) => lineVisible(line, opts, true))
  }

  function lineVisible(line, opts, useLevel) {
    if (state.hostFilter.length && !state.hostFilter.includes(line.hostId) && !state.hostFilter.includes(line.host)) return false
    if (state.fileFilter.length) {
      const name = String(line.file || '')
      if (!state.fileFilter.some((f) => name === f || name.endsWith(f))) return false
    }
    if (useLevel && state.levels.length) {
      const level = lineLevel(line)
      const hit = state.levels.includes(level) || (level === 'FATAL' && state.levels.includes('ERROR'))
      if (!hit) return false
    }
    return lineMatches(line.text, opts)
  }

  function isContinuation(text) {
    const raw = String(text || '').replace(/\s+$/, '')
    if (!raw || parseLogBody(raw).level) return false
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(raw)) return false
    return /^(?:\s*at\s+\S+\(|\s*Caused by:|\s*Suppressed:|\s*\.\.\. \d+ more\b)/.test(raw)
  }

  function foldLines(lines) {
    const out = []
    const lastByHost = new Map()
    for (const line of lines) {
      const host = line.hostId || line.host || ''
      const parsed = parseLogBody(line.text)
      const level = (line.level || parsed.level || '').replace('WARNING', 'WARN')
      const prev = lastByHost.get(host)
      if (!level && isContinuation(line.text) && prev) {
        prev.stack.push(line)
        continue
      }
      const sig = `${host}|${level}|${parsed.loggerFull || parsed.logger}|${parsed.message}`
      if (prev && prev.sig === sig && !prev.stack.length && out[out.length - 1] === prev) {
        prev.repeat += 1
        prev.line = line
        continue
      }
      const item = { line, first: line, parsed, level, sig, host, repeat: 1, stack: [], context: false }
      out.push(item)
      lastByHost.set(host, item)
    }
    return out
  }

  function eventBlob(ev) {
    return [ev.line.text, ...ev.stack.map((row) => row.text)].join('\n')
  }

  function eventPassesExclude(ev, opts) {
    const excludes = parseExcludeTerms(opts.exclude)
    if (!excludes.length) return true
    const blob = eventBlob(ev)
    return !excludes.some((term) => rowIncludes(blob, term, opts.ignoreCase))
  }

  function eventHits(ev, opts) {
    const probe = { keyword: opts.keyword, matchMode: opts.matchMode, ignoreCase: opts.ignoreCase, exclude: '' }
    if (!lineMatches(eventBlob(ev), probe)) return false
    if (!state.levels.length) return true
    return state.levels.includes(ev.level) || (ev.level === 'FATAL' && state.levels.includes('ERROR'))
  }

  function withContext(events, hits) {
    const radius = Math.max(0, Number(state.contextRadius) || 0)
    const keep = new Array(events.length).fill(false)
    const context = new Array(events.length).fill(false)
    for (let i = 0; i < events.length; i++) {
      if (!hits[i]) continue
      keep[i] = true
      let before = 0
      for (let j = i - 1; j >= 0 && before < radius; j--) {
        if (events[j].host !== events[i].host) continue
        if (!keep[j]) context[j] = true
        keep[j] = true
        before += 1
      }
      let after = 0
      for (let j = i + 1; j < events.length && after < radius; j++) {
        if (events[j].host !== events[i].host) continue
        if (!keep[j]) context[j] = true
        keep[j] = true
        after += 1
      }
    }
    const out = []
    for (let i = 0; i < events.length; i++) {
      if (!keep[i]) continue
      events[i].context = context[i] && !hits[i]
      out.push(events[i])
    }
    return out
  }

  function eventTimeMs(ev) {
    return Number(ev.line?.tsMs || ev.first?.tsMs || 0) || 0
  }

  function inTimeFocus(ev) {
    const ts = eventTimeMs(ev)
    if (state.timeWindow) {
      if (!ts) return true
      return ts >= state.timeWindow.fromMs && ts <= state.timeWindow.toMs
    }
    if (!state.timeFocus) return true
    if (!ts) return true
    return Math.abs(ts - state.timeFocus.centerMs) <= state.timeFocus.radiusMs
  }

  function eventSignature(ev) {
    const msg = String(ev.parsed?.message || ev.line?.text || '')
      .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '#ip')
      .replace(/\b\d{6,}\b/g, '#n')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160)
    return `${ev.level || ''}|${ev.parsed?.loggerFull || ev.parsed?.logger || ''}|${msg}`
  }

  function uniqueHostIds(events) {
    const hosts = new Map()
    for (const ev of events) {
      const sig = eventSignature(ev)
      const host = ev.host || ev.line?.hostId || ev.line?.host || ''
      if (!hosts.has(sig)) hosts.set(sig, new Set())
      hosts.get(sig).add(host)
    }
    return hosts
  }

  function viewEvents() {
    const opts = queryOptions()
    const folded = foldLines(state.rawLines.filter((line) => lineVisible(line, { keyword: '', matchMode: 'contains', ignoreCase: true, exclude: '' }, false)))
    const pool = []
    const hits = []
    for (const ev of folded) {
      if (!eventPassesExclude(ev, opts)) continue
      if (isMuted(ev)) continue
      if (!inTimeFocus(ev)) continue
      pool.push(ev)
      hits.push(eventHits(ev, opts))
    }
    const filtering = parseExcludeTerms(opts.keyword).length > 0 || state.levels.length > 0
    let events
    if (!filtering || !state.showContext || !state.contextRadius) {
      events = pool.filter((_, index) => hits[index]).map((ev) => {
        ev.context = false
        return ev
      })
    } else {
      events = withContext(pool, hits)
    }
    if (state.uniqueOnly) {
      const hostMap = uniqueHostIds(events.filter((ev) => !ev.context))
      events = events.filter((ev) => {
        if (ev.context) return true
        const hosts = hostMap.get(eventSignature(ev))
        return hosts && hosts.size === 1
      })
    }
    if (state.clusterFilter) {
      events = events.filter((ev) => ev.context || clusterKey(ev) === state.clusterFilter)
    }
    if (state.compare) {
      const ids = new Set([state.compare.left, state.compare.right].filter(Boolean))
      if (ids.size) {
        events = events.filter((ev) => {
          const id = ev.host || ev.line?.hostId || ev.line?.host || ''
          return ids.has(id)
        })
      }
    }
    return events
  }

  function normalizeClusterMsg(text) {
    return String(text || '')
      .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '#ip')
      .replace(/\b[0-9a-f]{8,}\b/gi, '#hex')
      .replace(/\b\d{4,}\b/g, '#n')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120)
  }

  function clusterKey(ev) {
    const blob = eventBlob(ev)
    const ex = blob.match(/\b([A-Z][A-Za-z0-9_.]*(?:Exception|Error))\b/)
    const name = ex ? ex[1] : (ev.level === 'ERROR' || ev.level === 'FATAL' ? 'ERROR' : '')
    if (!name) return ''
    return `${name}|${normalizeClusterMsg(ev.parsed?.message || ev.line?.text || '')}`
  }

  function collectClusters(events) {
    const map = new Map()
    for (const ev of events) {
      if (ev.context) continue
      if (ev.level !== 'ERROR' && ev.level !== 'FATAL' && !/\b(?:Exception|Error)\b/.test(eventBlob(ev))) continue
      const key = clusterKey(ev)
      if (!key) continue
      const cur = map.get(key) || { key, name: key.split('|')[0], message: key.split('|').slice(1).join('|'), count: 0, hosts: new Set() }
      cur.count += ev.repeat || 1
      cur.hosts.add(ev.host || ev.line?.hostId || '')
      map.set(key, cur)
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }

  function renderClusters() {
    $('clusterBar')?.classList.add('hidden')
  }

  function renderHealth() {
    const rail = $('healthRail')
    const body = $('healthBody')
    if (!rail || !body) return
    const list = state.servers.filter((s) => {
      if (s.enabled === false) return false
      if (s.statusKind === 'err' || s.statusKind === 'busy') return true
      return Boolean(skewLabel(s.id))
    })
    const bad = list.filter((s) => s.statusKind === 'err')
    const reconnectBtn = $('btnReconnectBad')
    if (reconnectBtn) reconnectBtn.classList.toggle('hidden', !bad.length)
    if (!list.length) {
      rail.hidden = true
      body.innerHTML = ''
      return
    }
    rail.hidden = false
    applyFoldState('health', state.folds.health !== false)
    body.innerHTML = list.map((srv) => {
      const kind = srv.statusKind === 'err' ? 'err' : (srv.statusKind === 'busy' ? 'busy' : 'ok')
      const skew = skewLabel(srv.id)
      const brief = srv.statusKind === 'busy' ? '读取中' : (srv.statusKind === 'err' ? hostStatusBrief(srv.status) : '时钟偏差')
      return `<div class="health-item is-${kind}">` +
        `<i style="background:${hostColor(srv.id)}"></i>` +
        `<span>${escapeHtml(srv.label && srv.label !== srv.host ? srv.label : lastIp(srv.host))}</span>` +
        `<em title="${escapeHtml(srv.status || '')}">${escapeHtml(brief)}${skew ? ` ${skew}` : ''}</em>` +
        `</div>`
    }).join('')
  }

  async function reconnectBadHosts() {
    const bad = state.servers.filter((s) => s.enabled !== false && s.statusKind === 'err')
    if (!bad.length) {
      setStatus('当前没有异常实例')
      return
    }
    setStatus(`正在重连 ${bad.length} 台异常实例…`)
    let ok = 0
    for (const srv of bad) {
      try {
        await reconnectServer(srv)
        if (srv.statusKind === 'ok') ok += 1
      } catch (_) { /* per-host status already set */ }
    }
    renderHealth()
    setStatus(`异常重连完成 · ${ok}/${bad.length} 台恢复`)
  }

  function followDelay() {
    return ({ 1: 1000, 2: 2000, 3: 5000 })[state.followPace] || 2000
  }

  function syncFollowPaceChip() {
    const btn = $('btnFollowPace')
    if (!btn) return
    const value = ({ 1: '1 秒', 2: '2 秒', 3: '5 秒' })[state.followPace] || '2 秒'
    const em = $('followPaceValue')
    if (em) em.textContent = value
    else btn.textContent = `刷新间隔 ${value}`
    btn.dataset.pace = String(state.followPace)
  }

  function cycleFollowPace() {
    state.followPace = state.followPace >= 3 ? 1 : state.followPace + 1
    syncFollowPaceChip()
    setStatus(({ 1: '跟随间隔 1 秒', 2: '跟随间隔 2 秒', 3: '跟随间隔 5 秒' })[state.followPace])
  }

  function updateJumpBottom() {
    const btn = $('btnJumpBottom')
    if (!btn) return
    if (!state.following || state.stickBottom) {
      btn.classList.add('hidden')
      btn.textContent = '↓ 最新'
    } else {
      btn.classList.remove('hidden')
      btn.textContent = state.unreadCount > 0 ? `${state.unreadCount} 条新日志` : '↓ 最新'
    }
    updateOlderBtn()
  }

  function updateOlderBtn() {
    const btn = $('btnOlder')
    if (!btn) return
    const show = state.rawLines.length > 0 && !state.busy && !(state.following && state.stickBottom)
    btn.classList.toggle('hidden', !show)
    btn.textContent = state.olderPage > 0 ? `更早 · 第 ${state.olderPage + 1} 页` : '更早'
  }

  function keywordHistoryKey() {
    return `kw-history:${state.connectionId || 'default'}`
  }

  async function loadKeywordHistory() {
    try {
      const raw = await window.datawisePlugin.storage.get(keywordHistoryKey())
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      state.keywordHistory = Array.isArray(parsed) ? parsed.map(String).filter(Boolean).slice(0, 12) : []
    } catch (_) {
      state.keywordHistory = []
    }
  }

  async function rememberKeyword(value) {
    const text = String(value || '').trim()
    if (!text) return
    state.keywordHistory = [text, ...state.keywordHistory.filter((item) => item !== text)].slice(0, 12)
    try {
      await window.datawisePlugin.storage.set(keywordHistoryKey(), JSON.stringify(state.keywordHistory))
    } catch (_) { /* ignore */ }
  }

  function renderKeywordHistory(query) {
    const box = $('kwHistory')
    if (!box) return
    const q = String(query ?? ($('keyword')?.value || '')).trim().toLowerCase()
    if (!q) {
      box.classList.add('hidden')
      box.innerHTML = ''
      return
    }
    const items = state.keywordHistory.filter((item) => item.toLowerCase().includes(q)).slice(0, 8)
    if (!items.length) {
      box.classList.add('hidden')
      box.innerHTML = ''
      return
    }
    box.classList.remove('hidden')
    box.innerHTML = items.map((item) =>
      `<button type="button" class="kw-history__item" role="option">${escapeHtml(item)}</button>`
    ).join('')
    box.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        $('keyword').value = btn.textContent || ''
        syncKeywordClear()
        box.classList.add('hidden')
        refreshLocalFilter()
      })
    })
  }

  function bookmarksKey() {
    return `bookmarks:${state.connectionId || 'default'}`
  }

  async function loadBookmarks() {
    try {
      const raw = await window.datawisePlugin.storage.get(bookmarksKey())
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      state.bookmarks = Array.isArray(parsed) ? parsed.filter((b) => b && b.key).slice(0, 20) : []
    } catch (_) {
      state.bookmarks = []
    }
    renderBookmarks()
  }

  async function saveBookmarks() {
    try {
      await window.datawisePlugin.storage.set(bookmarksKey(), JSON.stringify(state.bookmarks))
    } catch (_) { /* ignore */ }
  }

  function addBookmarkHere() {
    const pane = $('logPane')
    const top = pane.getBoundingClientRect().top
    const row = [...pane.querySelectorAll('.log-line')].find((el) => el.getBoundingClientRect().bottom > top + 8)
    if (!row) {
      setStatus('当前没有可记的位置')
      return
    }
    const key = row.dataset.key || ''
    const when = row.querySelector('.log-line__time')?.textContent || ''
    const msg = row.querySelector('.log-line__body')?.textContent || ''
    state.bookmarks = [{ id: uid(), key, when, message: msg.slice(0, 80) }, ...state.bookmarks.filter((b) => b.key !== key)].slice(0, 20)
    saveBookmarks()
    renderBookmarks()
    setStatus('已记下当前位置')
  }

  function renderBookmarks() {
    const rail = $('bookmarkRail')
    const body = $('bookmarkBody')
    const fold = $('bookmarkFold')
    if (!rail || !body) return
    rail.classList.remove('hidden')
    if (fold) {
      fold.hidden = false
      applyFoldState('bookmarks', state.folds.bookmarks !== false)
    }
    if (!state.bookmarks.length) {
      body.innerHTML = `<div class="bookmark-empty">滚动到关心的位置后点「记下这里」</div>`
      return
    }
    body.innerHTML = state.bookmarks.map((b) =>
      `<button type="button" class="bookmark-item" data-id="${escapeHtml(b.id)}" data-key="${escapeHtml(b.key)}" title="${escapeHtml(b.message || '')}">` +
      `<span>${escapeHtml(b.when || '书签')}</span>` +
      `<em data-act="del">×</em></button>`
    ).join('')
    body.querySelectorAll('.bookmark-item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        if (e.target.closest('[data-act="del"]')) {
          state.bookmarks = state.bookmarks.filter((b) => b.id !== btn.dataset.id)
          saveBookmarks()
          renderBookmarks()
          return
        }
        const row = [...document.querySelectorAll('#logStream .log-line')].find((el) => el.dataset.key === btn.dataset.key)
        if (row) {
          state.stickBottom = false
          state.cursorKey = btn.dataset.key
          focusLogRow(row)
          updateJumpBottom()
        } else setStatus('书签不在当前筛选里')
      })
    })
  }

  function compareKey() {
    return `compare:${state.connectionId || 'default'}`
  }

  async function loadLastCompare() {
    try {
      const raw = await window.datawisePlugin.storage.get(compareKey())
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (parsed && parsed.left && parsed.right) state.lastCompare = parsed
    } catch (_) {
      state.lastCompare = null
    }
  }

  async function saveLastCompare(pair) {
    state.lastCompare = pair
    try {
      await window.datawisePlugin.storage.set(compareKey(), JSON.stringify(pair))
    } catch (_) { /* ignore */ }
  }

  function openCompare() {
    const bar = $('compareBar')
    if (!bar) return
    const left = $('compareLeft')
    const right = $('compareRight')
    const opts = state.servers.map((s) =>
      `<option value="${escapeHtml(s.id)}">${escapeHtml(s.label && s.label !== s.host ? s.label : s.host)}</option>`
    ).join('')
    left.innerHTML = opts
    right.innerHTML = opts
    const remembered = state.compare || state.lastCompare
    const ids = new Set(state.servers.map((s) => s.id))
    if (state.servers[0]) left.value = (remembered?.left && ids.has(remembered.left)) ? remembered.left : state.servers[0].id
    if (state.servers[1]) {
      right.value = (remembered?.right && ids.has(remembered.right)) ? remembered.right : state.servers[1].id
    } else if (state.servers[0]) {
      right.value = state.servers[0].id
    }
    bar.classList.remove('hidden')
  }

  function applyCompare() {
    const left = $('compareLeft')?.value || ''
    const right = $('compareRight')?.value || ''
    if (!left || !right || left === right) {
      setStatus('请选择两台不同的实例')
      return
    }
    state.compare = { left, right }
    void saveLastCompare({ left, right })
    state.hostFilter = [left, right]
    state.hostMulti = true
    $('compareBar')?.classList.add('hidden')
    renderServers()
    paintComparePanes()
    refreshLocalFilter()
    setStatus(`对比 ${lastIp(state.servers.find((s) => s.id === left)?.host || left)} ↔ ${lastIp(state.servers.find((s) => s.id === right)?.host || right)}`)
  }

  function closeCompare() {
    state.compare = null
    $('compareBar')?.classList.add('hidden')
    $('compareSplit')?.classList.add('hidden')
    $('logStream')?.classList.remove('hidden')
    refreshLocalFilter()
  }

  function paintComparePanes() {
    const split = $('compareSplit')
    const stream = $('logStream')
    if (!state.compare) {
      split?.classList.add('hidden')
      return
    }
    const events = viewEvents().filter((ev) => !ev.context)
    const left = events.filter((ev) => (ev.host || ev.line?.hostId) === state.compare.left)
    const right = events.filter((ev) => (ev.host || ev.line?.hostId) === state.compare.right)
    const leftSigs = new Set(left.map(eventSignature))
    const rightSigs = new Set(right.map(eventSignature))
    const renderPane = (list, otherSigs, title) =>
      `<div class="compare-pane__head">${escapeHtml(title)} · ${list.length}</div>` +
      list.slice(-120).map((ev) => {
        const unique = !otherSigs.has(eventSignature(ev))
        const msg = String(ev.parsed?.message || ev.line?.text || '').replace(/\s+/g, ' ').slice(0, 160)
        return `<div class="compare-line${unique ? ' is-diff' : ''}"><time>${escapeHtml(formatClock(ev.line).slice(11))}</time><b>${escapeHtml(ev.level || '')}</b><span>${escapeHtml(msg)}</span></div>`
      }).join('')
    const lName = state.servers.find((s) => s.id === state.compare.left)
    const rName = state.servers.find((s) => s.id === state.compare.right)
    $('comparePaneL').innerHTML = renderPane(left, rightSigs, lName?.label || lName?.host || '左')
    $('comparePaneR').innerHTML = renderPane(right, leftSigs, rName?.label || rName?.host || '右')
    split.classList.remove('hidden')
    stream.classList.add('hidden')
  }

  function downloadVisibleLogs() {
    const events = viewEvents()
    const text = events.map((ev) => {
      const first = ev.first || ev.line
      const stack = ev.stack.map((row) => row.text).join('\n')
      const head = `[${first.hostLabel || first.host}] ${formatClock(first)} ${ev.level || ''} ${first.text}`
      return stack ? `${head}\n${stack}` : head
    }).join('\n')
    const blob = new Blob([text || ''], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.log`
    a.click()
    URL.revokeObjectURL(url)
    setStatus(`已下载 ${events.length} 条`)
  }

  async function exportMutes() {
    if (!state.mutes.length) {
      setStatus('还没有屏蔽规则')
      return
    }
    await copyText(JSON.stringify(state.mutes, null, 2), `已复制 ${state.mutes.length} 条屏蔽规则`)
  }

  function openMuteImport() {
    const pop = $('muteImportPop')
    if (!pop) return
    $('muteImportText').value = ''
    pop.classList.remove('hidden')
    $('muteImportText')?.focus()
  }

  function closeMuteImport() {
    $('muteImportPop')?.classList.add('hidden')
  }

  async function importMutesFromText() {
    const raw = String($('muteImportText')?.value || '').trim()
    if (!raw) {
      setStatus('请粘贴屏蔽规则 JSON')
      return
    }
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch (_) {
      setStatus('JSON 格式不对')
      return
    }
    const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.mutes) ? parsed.mutes : null)
    if (!list) {
      setStatus('需要数组，或带 mutes 字段的对象')
      return
    }
    const existing = new Set(state.mutes.map((m) => `${m.kind}|${m.value}`))
    let added = 0
    for (const item of list) {
      if (!item || !item.kind || item.value == null) continue
      const kind = String(item.kind)
      const value = String(item.value)
      const key = `${kind}|${value}`
      if (existing.has(key)) continue
      existing.add(key)
      state.mutes.push({
        kind,
        value,
        label: item.label ? String(item.label) : '',
      })
      added += 1
    }
    if (!added) {
      setStatus('没有新的屏蔽规则')
      return
    }
    await saveMutes()
    closeMuteImport()
    paintLines()
    setStatus(`已导入 ${added} 条屏蔽规则`)
  }

  function enqueueMerge(fn) {
    state.mergeChain = state.mergeChain.then(fn).catch(() => {})
    return state.mergeChain
  }

  async function mapPool(items, concurrency, worker) {
    const list = [...items]
    const limit = Math.max(1, Math.min(concurrency, list.length || 1))
    let index = 0
    const runners = Array.from({ length: limit }, async () => {
      while (index < list.length) {
        const i = index
        index += 1
        await worker(list[i], i)
      }
    })
    await Promise.all(runners)
  }

  function markHostsBusy() {
    for (const srv of state.servers) {
      if (srv.enabled === false) continue
      srv.status = '读取中…'
      srv.statusKind = 'busy'
    }
    renderServers()
    renderHealth()
  }

  function shortThread(name) {
    const text = String(name || '')
    if (!text) return ''
    if (text.length <= 18) return text
    return `…${text.slice(-16)}`
  }

  function toLocalInputValue(ms) {
    const d = new Date(ms)
    if (Number.isNaN(d.getTime())) return ''
    const p = (n, w = 2) => String(n).padStart(w, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  }

  function parseLocalInput(value) {
    const text = String(value || '').trim()
    if (!text) return null
    const normalized = text.includes('T') ? text : text.replace(' ', 'T')
    const ms = Date.parse(normalized.length === 16 ? `${normalized}:00` : normalized)
    return Number.isFinite(ms) ? ms : null
  }

  function formatQueryTime(ms) {
    const d = new Date(ms)
    const p = (n, w = 2) => String(n).padStart(w, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  }

  function readTimeRangeInputs() {
    const fromMs = parseLocalInput($('timeFrom')?.value)
    const toMs = parseLocalInput($('timeTo')?.value)
    if (fromMs == null && toMs == null) return null
    if (fromMs != null && toMs != null && fromMs > toMs) {
      throw new Error('开始时间不能晚于结束时间')
    }
    return {
      fromMs: fromMs ?? toMs - 3600000,
      toMs: toMs ?? fromMs + 3600000,
    }
  }

  async function runTimeRangeSearch() {
    let range
    try {
      range = readTimeRangeInputs()
    } catch (e) {
      setStatus(e?.message || String(e))
      return
    }
    if (!range) {
      setStatus('先选开始和结束时间')
      $('timeFrom')?.focus()
      return
    }
    state.timeFocus = null
    state.timeWindow = range
    if (!$('timeFrom').value) $('timeFrom').value = toLocalInputValue(range.fromMs)
    if (!$('timeTo').value) $('timeTo').value = toLocalInputValue(range.toMs)
    await runSearch({
      timeFrom: formatQueryTime(range.fromMs),
      timeTo: formatQueryTime(range.toMs),
    })
  }

  function formatGap(ms) {
    if (ms < 1000) return `${Math.max(0, Math.round(ms))} 毫秒`
    if (ms < 60000) return `${Math.round(ms / 1000)} 秒`
    if (ms < 3600000) return `${Math.floor(ms / 60000)} 分 ${Math.round((ms % 60000) / 1000)} 秒`
    return `${Math.floor(ms / 3600000)} 小时 ${Math.floor((ms % 3600000) / 60000)} 分`
  }

  function syncContextChip() {
    const btn = $('btnContext')
    if (!btn) return
    const on = state.showContext && state.contextRadius > 0
    btn.classList.toggle('is-active', on)
    btn.setAttribute('aria-pressed', on ? 'true' : 'false')
    const label = btn.querySelector('span')
    const text = on ? `命中前后留 ±${state.contextRadius}` : '命中前后不保留'
    if (label) label.textContent = text
    else btn.textContent = text
  }

  function cycleContext() {
    if (!state.showContext || state.contextRadius <= 0) {
      state.showContext = true
      state.contextRadius = 2
    } else if (state.contextRadius === 2) {
      state.contextRadius = 5
    } else {
      state.showContext = false
      state.contextRadius = 0
    }
    syncContextChip()
    refreshLocalFilter()
  }

  function clearAllFilters() {
    $('keyword').value = ''
    $('exclude').value = ''
    syncKeywordClear()
    state.levels = []
    state.levelMulti = false
    state.hostFilter = []
    state.fileFilter = []
    state.timeFocus = null
    state.timeWindow = null
    state.uniqueOnly = false
    state.mutes = []
    state.traceId = ''
    state.cursorKey = ''
    state.histoWindow = null
    state.clusterFilter = ''
    state.unreadCount = 0
    if ($('timeFrom')) $('timeFrom').value = ''
    if ($('timeTo')) $('timeTo').value = ''
    $('btnUniqueOnly')?.classList.remove('is-active')
    $('btnUniqueOnly')?.setAttribute('aria-pressed', 'false')
    closeTrace()
    closeCompare()
    saveMutes()
    syncLevelChips()
    renderCrumbs()
    refreshLocalFilter()
    setStatus('已清空筛选')
  }

  async function loadScenes() {
    const api = window.datawisePlugin
    let stored = null
    try {
      stored = await api.storage.get(scenesStorageKey())
    } catch (_) {
      stored = null
    }
    let parsed = null
    if (typeof stored === 'string' && stored.trim()) {
      try { parsed = JSON.parse(stored) } catch (_) { parsed = null }
    } else if (Array.isArray(stored)) {
      parsed = stored
    }
    if (!Array.isArray(parsed) || !parsed.length) {
      const fromProfile = savedProfile()?.scenes
      if (Array.isArray(fromProfile) && fromProfile.length) parsed = fromProfile
    }
    state.scenes = Array.isArray(parsed)
      ? parsed.filter((s) => s && s.id && s.name).map((s) => ({
          id: String(s.id),
          name: String(s.name),
          enabledIds: Array.isArray(s.enabledIds) ? s.enabledIds.map(String) : [],
          hostFilter: Array.isArray(s.hostFilter) ? s.hostFilter.map(String) : [],
          keyword: String(s.keyword || ''),
          exclude: String(s.exclude || ''),
          levels: Array.isArray(s.levels) ? s.levels.map(String) : [],
          matchMode: String(s.matchMode || 'contains'),
          ignoreCase: s.ignoreCase !== false,
          remoteGrep: s.remoteGrep !== false,
        }))
      : []
    renderScenePicker()
  }

  async function saveScenes() {
    try {
      await window.datawisePlugin.storage.set(scenesStorageKey(), JSON.stringify(state.scenes))
    } catch (e) {
      console.warn('persist scenes failed', e)
    }
    await persistProfile()
  }

  function defaultSceneName() {
    const enabled = state.servers.filter((s) => s.enabled !== false)
    const hosts = enabled.slice(0, 2).map((s) => lastIp(s.host) || s.label).join('/')
    const kw = parseExcludeTerms($('keyword').value).slice(0, 1).join('')
    const bits = [hosts || '场景', kw].filter(Boolean)
    return bits.join(' · ').slice(0, 28)
  }

  function renderScenePicker() {
    const menu = $('sceneMenu')
    const label = $('sceneLabel')
    if (!menu || !label) return
    const active = state.scenes.find((s) => s.id === state.activeSceneId)
    label.textContent = active ? active.name : (state.scenes.length ? '选场景' : '场景')
    $('sceneId').value = active?.id || ''
    menu.innerHTML = ''
    const none = document.createElement('li')
    none.innerHTML = `<button type="button" class="picker__opt${!active ? ' is-selected' : ''}" data-id="">当前（未选场景）</button>`
    menu.appendChild(none)
    for (const scene of state.scenes) {
      const li = document.createElement('li')
      li.innerHTML = `<button type="button" class="picker__opt${scene.id === state.activeSceneId ? ' is-selected' : ''}" data-id="${escapeHtml(scene.id)}">${escapeHtml(scene.name)}</button>`
      menu.appendChild(li)
    }
    menu.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id || ''
        closeSceneMenu()
        if (!id) {
          state.activeSceneId = ''
          renderScenePicker()
          return
        }
        void applyScene(id)
      })
    })
  }

  function closeSceneMenu() {
    const picker = $('scenePicker')
    const menu = $('sceneMenu')
    const btn = $('sceneBtn')
    if (menu) menu.hidden = true
    picker?.classList.remove('is-open')
    btn?.setAttribute('aria-expanded', 'false')
  }

  function toggleSceneMenu() {
    const menu = $('sceneMenu')
    if (!menu) return
    const open = menu.hidden
    menu.hidden = !open
    $('scenePicker')?.classList.toggle('is-open', open)
    $('sceneBtn')?.setAttribute('aria-expanded', open ? 'true' : 'false')
    if (open) renderScenePicker()
  }

  function askName(title, lede, value) {
    const dlg = $('nameDialog')
    const input = $('nameDialogInput')
    const field = $('nameDialogField')
    if (field) field.classList.remove('hidden')
    $('btnConfirmName').textContent = '保存'
    $('nameDialogTitle').textContent = title
    $('nameDialogLede').textContent = lede
    input.value = value || ''
    return new Promise((resolve) => {
      let settled = false
      const done = (text) => {
        if (settled) return
        settled = true
        if (dlg.open) dlg.close()
        resolve(text)
      }
      const onOk = () => done(input.value.trim())
      const onCancel = () => done(null)
      const onKey = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          done(input.value.trim())
        }
      }
      const onDialogCancel = (e) => {
        e.preventDefault()
        done(null)
      }
      $('btnConfirmName').addEventListener('click', onOk)
      $('btnCancelName').addEventListener('click', onCancel)
      input.addEventListener('keydown', onKey)
      dlg.addEventListener('cancel', onDialogCancel)
      dlg.addEventListener('close', () => {
        $('btnConfirmName').removeEventListener('click', onOk)
        $('btnCancelName').removeEventListener('click', onCancel)
        input.removeEventListener('keydown', onKey)
        dlg.removeEventListener('cancel', onDialogCancel)
        done(null)
      }, { once: true })
      dlg.showModal()
      input.focus()
      input.select()
    })
  }

  async function saveCurrentScene() {
    const fallback = defaultSceneName()
    const existing = state.scenes.find((s) => s.id === state.activeSceneId)
    const asked = await askName(
      existing ? '更新场景' : '保存场景',
      '记下当前勾选的实例和筛选，之后可以一键切回来。',
      existing?.name || fallback,
    )
    if (asked === null) return
    const sceneName = asked || existing?.name || fallback
    const scene = {
      id: existing?.id || uid(),
      name: sceneName,
      enabledIds: state.servers.filter((s) => s.enabled !== false).map((s) => s.id),
      hostFilter: [...state.hostFilter],
      keyword: $('keyword').value.trim(),
      exclude: $('exclude').value.trim(),
      levels: [...state.levels],
      matchMode: state.matchMode,
      ignoreCase: $('ignoreCase').checked,
      remoteGrep: $('remoteGrep').checked,
    }
    if (existing) {
      const idx = state.scenes.findIndex((s) => s.id === existing.id)
      state.scenes[idx] = scene
    } else {
      state.scenes.unshift(scene)
    }
    state.activeSceneId = scene.id
    await saveScenes()
    renderScenePicker()
    setStatus(`已保存场景 ${scene.name}`)
  }

  async function deleteActiveScene() {
    if (!state.activeSceneId) {
      setStatus('还没有选中的场景')
      return
    }
    const name = state.scenes.find((s) => s.id === state.activeSceneId)?.name || ''
    state.scenes = state.scenes.filter((s) => s.id !== state.activeSceneId)
    state.activeSceneId = ''
    await saveScenes()
    renderScenePicker()
    setStatus(name ? `已删除场景 ${name}` : '已删除场景')
  }

  async function applyScene(id) {
    const scene = state.scenes.find((s) => s.id === id)
    if (!scene) return
    state.activeSceneId = scene.id
    const enabled = new Set(scene.enabledIds)
    if (enabled.size) {
      for (const srv of state.servers) srv.enabled = enabled.has(srv.id)
    }
    state.hostFilter = scene.hostFilter.filter((hid) => state.servers.some((s) => s.id === hid))
    $('keyword').value = scene.keyword || ''
    $('exclude').value = scene.exclude || ''
    syncKeywordClear()
    state.levels = [...(scene.levels || [])]
    state.levelMulti = state.levels.length > 1
    setMatchMode(scene.matchMode || 'contains')
    $('ignoreCase').checked = scene.ignoreCase !== false
    $('remoteGrep').checked = scene.remoteGrep !== false
    syncLevelChips()
    await saveServers()
    renderScenePicker()
    renderServers()
    await runSearch({ forceTail: true })
    setStatus(`已切换到场景 ${scene.name}`)
  }

  function setTimeFocus(centerMs) {
    if (!centerMs) return
    if (state.timeFocus && Math.abs(state.timeFocus.centerMs - centerMs) < 500) {
      state.timeFocus = null
    } else {
      state.timeFocus = { centerMs, radiusMs: 30000 }
    }
    refreshLocalFilter()
  }

  function togglePin(ev) {
    const key = lineKey(ev.line)
    const index = state.pins.findIndex((p) => p.key === key)
    if (index >= 0) {
      state.pins.splice(index, 1)
    } else {
      const first = ev.first || ev.line
      state.pins.unshift({
        key,
        text: first.text || '',
        host: first.host || first.hostLabel || '',
        hostId: first.hostId || '',
        level: ev.level || '',
        ts: formatClock(first),
        message: (ev.parsed?.message || first.text || '').slice(0, 180),
      })
      if (state.pins.length > 12) state.pins.length = 12
    }
    renderPinStrip()
    paintLines()
  }

  function copyOneLine(ev) {
    const first = ev.first || ev.line
    const last = ev.line
    const when = ev.repeat > 1 ? `${formatClock(first)} → ${formatClock(last)} ×${ev.repeat}` : formatClock(first)
    const stack = ev.stack.map((row) => row.text).join('\n')
    const text = [`[${first.hostLabel || first.host}] ${when} ${ev.level || ''} ${first.text}`, stack].filter(Boolean).join('\n')
    copyText(text, '已复制这一条')
  }

  function formatEventLine(ev) {
    const first = ev.first || ev.line
    const stack = (ev.stack || []).map((row) => row.text).join('\n')
    const head = `[${first.hostLabel || first.host}] ${formatClock(first)} ${ev.level || ''} ${first.text}`
    return stack ? `${head}\n${stack}` : head
  }

  function copyContext(ev, radius = 5) {
    const events = viewEvents().filter((item) => !item.context)
    const key = lineKey(ev.first || ev.line)
    const idx = events.findIndex((item) => lineKey(item.first || item.line) === key)
    if (idx < 0) {
      copyOneLine(ev)
      return
    }
    const slice = events.slice(Math.max(0, idx - radius), idx + radius + 1)
    const text = slice.map(formatEventLine).join('\n')
    copyText(text, `已复制前后文 ${slice.length} 条`)
  }

  function searchFromLine(ev) {
    const first = ev.first || ev.line
    const ms = Number(first.tsMs || 0)
    if (!ms) {
      setStatus('这一行没有可识别的时间')
      return
    }
    stopFollow()
    const from = toLocalInputValue(ms)
    const to = toLocalInputValue(Date.now())
    if ($('timeFrom')) $('timeFrom').value = from
    if ($('timeTo')) $('timeTo').value = to
    state.timeFocus = null
    state.timeWindow = { fromMs: ms, toMs: Date.now() }
    void runSearch({ timeFrom: from, timeTo: to })
  }

  function openPeerCheck(ev) {
    const pop = $('peerPop')
    const body = $('peerBody')
    if (!pop || !body) return
    state.peerEv = ev
    const sig = eventSignature(ev)
    const counts = new Map()
    for (const line of state.rawLines) {
      const parsed = parseLogBody(line.text)
      const probe = {
        line,
        first: line,
        parsed,
        level: lineLevel(line),
        stack: [],
        repeat: 1,
        host: line.hostId || line.host,
      }
      if (eventSignature(probe) !== sig) continue
      const id = line.hostId || line.host
      counts.set(id, (counts.get(id) || 0) + 1)
    }
    const rows = state.servers.filter((s) => s.enabled !== false).map((srv) => {
      const n = counts.get(srv.id) || counts.get(srv.host) || 0
      const label = srv.label && srv.label !== srv.host ? srv.label : lastIp(srv.host)
      return `<div class="peer-row ${n ? 'is-hit' : 'is-miss'}"><span>${escapeHtml(label)}</span><em>${n ? `${n} 条` : '没有'}</em></div>`
    })
    body.innerHTML = rows.join('') || '<div class="file-pop__empty">还没有可对照的实例</div>'
    pop.classList.remove('hidden')
  }

  function closePeerPop() {
    $('peerPop')?.classList.add('hidden')
  }

  function searchPeerSignature() {
    const ev = state.peerEv
    if (!ev) return
    const msg = String(ev.parsed?.message || ev.line?.text || '').trim().slice(0, 80)
    const ex = msg.match(/\b[A-Z][A-Za-z0-9_.]*(?:Exception|Error)\b/)
    const term = ex ? ex[0] : msg.split(/\s+/).slice(0, 6).join(' ')
    if (!term) {
      setStatus('这条没什么好搜的')
      return
    }
    closePeerPop()
    $('keyword').value = term
    syncKeywordClear()
    state.keywordJoin = 'and'
    syncJoinModes()
    void runSearch()
  }

  function workspaceKey() {
    return `workspace:${state.connectionId || 'default'}`
  }

  async function loadWorkspace() {
    try {
      const raw = await window.datawisePlugin.storage.get(workspaceKey())
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (!parsed || typeof parsed !== 'object') return
      if (typeof parsed.keyword === 'string') $('keyword').value = parsed.keyword
      if (typeof parsed.exclude === 'string' && $('exclude')) $('exclude').value = parsed.exclude
      if (typeof parsed.matchMode === 'string') setMatchMode(parsed.matchMode)
      if (parsed.keywordJoin === 'or' || parsed.keywordJoin === 'and') {
        state.keywordJoin = parsed.keywordJoin
        syncJoinModes()
      }
      if (Array.isArray(parsed.levels)) state.levels = parsed.levels.map(String)
      if (typeof parsed.levelMulti === 'boolean') state.levelMulti = parsed.levelMulti
      if (Array.isArray(parsed.fileFilter)) state.fileFilter = parsed.fileFilter.map(String)
      if (Number(parsed.maxLines) > 0 && $('maxLines')) $('maxLines').value = String(parsed.maxLines)
      if (typeof parsed.ignoreCase === 'boolean' && $('ignoreCase')) $('ignoreCase').checked = parsed.ignoreCase
      if (typeof parsed.remoteGrep === 'boolean' && $('remoteGrep')) $('remoteGrep').checked = parsed.remoteGrep
      if (typeof parsed.followKeepKeyword === 'boolean') state.followKeepKeyword = parsed.followKeepKeyword
      syncKeywordClear()
      syncLevelChips()
      syncFollowKeywordChip()
      syncQueryOptsChip()
      renderCrumbs()
    } catch (_) { /* ignore */ }
  }

  async function saveWorkspace() {
    try {
      const payload = {
        keyword: $('keyword')?.value || '',
        exclude: $('exclude')?.value || '',
        matchMode: state.matchMode,
        keywordJoin: state.keywordJoin,
        levels: state.levels,
        levelMulti: state.levelMulti,
        fileFilter: state.fileFilter,
        maxLines: Number($('maxLines')?.value) || 200,
        ignoreCase: !!$('ignoreCase')?.checked,
        remoteGrep: !!$('remoteGrep')?.checked,
        followKeepKeyword: !!state.followKeepKeyword,
      }
      await window.datawisePlugin.storage.set(workspaceKey(), JSON.stringify(payload))
    } catch (_) { /* ignore */ }
  }

  function syncJoinModes() {
    document.querySelectorAll('#joinModes .chip').forEach((chip) => {
      chip.classList.toggle('is-active', chip.dataset.join === state.keywordJoin)
    })
    syncQueryOptsChip()
  }

  function formatFileMtime(sec) {
    const ms = Number(sec || 0) * (Number(sec) > 1e12 ? 1 : 1000)
    if (!ms) return ''
    const d = new Date(ms)
    if (Number.isNaN(d.getTime())) return ''
    const p = (n, w = 2) => String(n).padStart(w, '0')
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }

  function topCounted(map, limit) {
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
  }

  function renderInsight(sourceEvents) {
    const rail = $('insightRail')
    const body = $('insightBody')
    const fold = $('insightFold')
    if (!rail || !body) return
    if (!state.rawLines.length) {
      if (fold) fold.hidden = true
      body.innerHTML = ''
      return
    }
    const events = (sourceEvents || viewEvents()).filter((ev) => !ev.context)
    const exceptions = new Map()
    const loggers = new Map()
    const traces = new Map()
    const exRe = /\b([A-Z][A-Za-z0-9_.]*(?:Exception|Error))\b/g
    const trRe = /(?:(?:traceId|trace_id|requestId|request_id|reqId|req_id|TID)\s*[=:#]\s*['"]?)([A-Za-z0-9_.:-]{6,80})/gi
    for (const ev of events) {
      const blob = eventBlob(ev)
      if (ev.parsed?.logger) loggers.set(ev.parsed.logger, (loggers.get(ev.parsed.logger) || 0) + (ev.repeat || 1))
      for (const match of blob.matchAll(exRe)) {
        exceptions.set(match[1], (exceptions.get(match[1]) || 0) + 1)
      }
      for (const match of blob.matchAll(trRe)) {
        traces.set(match[1], (traces.get(match[1]) || 0) + 1)
      }
    }
    const sections = []
    const pushSection = (title, items, kind) => {
      if (!items.length) return
      sections.push(
        `<div class="insight__sec"><div class="insight__label">${title}</div>` +
        items.map(([name, count]) =>
          `<button type="button" class="insight__item" data-kind="${kind}" data-value="${escapeHtml(name)}" title="${escapeHtml(name)}">` +
          `<span>${escapeHtml(shortName(name))}</span><em>${count}</em></button>`
        ).join('') +
        `</div>`
      )
    }
    const clusters = collectClusters(events).slice(0, 5)
    if (clusters.length) {
      sections.push(
        `<div class="insight__sec"><div class="insight__label">异常簇</div>` +
        clusters.map((c) =>
          `<button type="button" class="insight__item" data-kind="cluster" data-value="${escapeHtml(c.key)}" title="${escapeHtml(c.message)}">` +
          `<span>${escapeHtml(shortName(c.name))}</span><em>${c.count}/${c.hosts.size}台</em></button>`
        ).join('') +
        `</div>`
      )
    }
    pushSection('异常', topCounted(exceptions, 5), 'keyword')
    pushSection('Logger', topCounted(loggers, 5), 'logger')
    pushSection('链路', topCounted(traces, 4), 'trace')
    if (!sections.length) {
      if (fold) fold.hidden = true
      body.innerHTML = ''
      return
    }
    if (fold) {
      fold.hidden = false
      applyFoldState('insight', state.folds.insight !== false)
    }
    body.innerHTML = sections.join('')
    body.querySelectorAll('.insight__item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const value = btn.dataset.value || ''
        if (btn.dataset.kind === 'trace') {
          openTrace(value)
          return
        }
        if (btn.dataset.kind === 'cluster') {
          state.clusterFilter = state.clusterFilter === value ? '' : value
          refreshLocalFilter()
          return
        }
        if (btn.dataset.kind === 'logger') {
          const terms = parseExcludeTerms($('keyword').value)
          if (!terms.some((term) => term.toLowerCase() === value.toLowerCase())) {
            $('keyword').value = terms.length ? `${terms.join(', ')}, ${value}` : value
            syncKeywordClear()
          }
          refreshLocalFilter()
          return
        }
        toggleKeyword(value)
      })
    })
  }

  function renderFilterBar() {
    const bar = $('filterBar')
    if (!bar) return
    const chips = []
    const kw = parseExcludeTerms($('keyword').value)
    for (const term of kw) chips.push({ kind: 'keyword', label: term, value: term })
    const ex = parseExcludeTerms($('exclude').value)
    for (const term of ex) chips.push({ kind: 'exclude', label: `排除 ${term}`, value: term })
    for (const level of state.levels) chips.push({ kind: 'level', label: level, value: level })
    if (state.hostFilter.length === 1) {
      const host = state.servers.find((s) => s.id === state.hostFilter[0])
      const shown = host && host.label && host.label !== host.host ? host.label : (host?.host || state.hostFilter[0])
      chips.push({ kind: 'host', label: shown, value: state.hostFilter[0] })
    } else if (state.hostFilter.length > 1) {
      chips.push({ kind: 'host', label: `${state.hostFilter.length} 台`, value: '' })
    }
    if (state.timeWindow) {
      chips.push({
        kind: 'window',
        label: `${formatQueryTime(state.timeWindow.fromMs).slice(5, 16)} → ${formatQueryTime(state.timeWindow.toMs).slice(11, 16)}`,
        value: '',
      })
    } else if (state.timeFocus) {
      const d = new Date(state.timeFocus.centerMs)
      const p = (n, w = 2) => String(n).padStart(w, '0')
      chips.push({
        kind: 'time',
        label: `附近 ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ±30s`,
        value: '',
      })
    }
    if (state.uniqueOnly) chips.push({ kind: 'unique', label: '仅单机', value: '' })
    if (state.clusterFilter) {
      chips.push({ kind: 'cluster', label: `簇 ${shortName(state.clusterFilter.split('|')[0] || '异常')}`, value: '' })
    }
    if (state.compare) chips.push({ kind: 'compare', label: '双机对比', value: '' })
    for (const mute of state.mutes) {
      chips.push({ kind: 'mute', label: `屏蔽 ${shortName(mute.label || mute.value)}`, value: `${mute.kind}\n${mute.value}` })
    }
    if (state.fileFilter.length === 1) {
      chips.push({ kind: 'file', label: state.fileFilter[0], value: '' })
    } else if (state.fileFilter.length > 1) {
      chips.push({ kind: 'file', label: `${state.fileFilter.length} 个文件`, value: '' })
    }
    const tf = $('timeFrom')?.value || ''
    const tt = $('timeTo')?.value || ''
    if (!state.timeWindow && (tf || tt)) {
      chips.push({
        kind: 'window',
        label: `时间 ${tf.slice(5, 16) || '…'} → ${tt.slice(11, 16) || '…'}`,
        value: '',
      })
    }
    if (state.following && state.followKeepKeyword && ($('keyword')?.value || '').trim()) {
      chips.push({ kind: 'followKw', label: '跟随带关键字', value: '' })
    }
    if (state.keywordJoin === 'or' && parseExcludeTerms($('keyword')?.value || '').length > 1) {
      chips.push({ kind: 'join', label: '任一包含', value: '' })
    }
    if (!chips.length) {
      bar.classList.add('hidden')
      bar.innerHTML = ''
      return
    }
    bar.classList.remove('hidden')
    bar.innerHTML =
      chips.map((chip) =>
        `<button type="button" class="filter-chip" data-kind="${chip.kind}" data-value="${escapeHtml(chip.value)}" title="点一下去掉">` +
        `${escapeHtml(chip.label)}<span aria-hidden="true">×</span></button>`
      ).join('') +
      `<button type="button" class="filter-chip is-clear" data-kind="all">全部清除</button>`
    bar.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.kind
        const value = btn.dataset.value || ''
        if (kind === 'all') {
          clearAllFilters()
          return
        }
        if (kind === 'keyword') toggleKeyword(value)
        else if (kind === 'exclude') {
          const next = parseExcludeTerms($('exclude').value).filter((t) => t !== value)
          $('exclude').value = next.join(', ')
          refreshLocalFilter()
        } else if (kind === 'level') {
          state.levels = state.levels.filter((l) => l !== value)
          syncLevelChips()
          refreshLocalFilter()
        } else if (kind === 'host') {
          state.hostFilter = []
          renderServers()
          refreshLocalFilter()
        } else if (kind === 'time') {
          state.timeFocus = null
          refreshLocalFilter()
        } else if (kind === 'window') {
          state.timeWindow = null
          if ($('timeFrom')) $('timeFrom').value = ''
          if ($('timeTo')) $('timeTo').value = ''
          refreshLocalFilter()
        } else if (kind === 'unique') {
          state.uniqueOnly = false
          $('btnUniqueOnly')?.classList.remove('is-active')
          $('btnUniqueOnly')?.setAttribute('aria-pressed', 'false')
          refreshLocalFilter()
        } else if (kind === 'file') {
          state.fileFilter = []
          paintFiles()
          refreshLocalFilter()
        } else if (kind === 'mute') {
          const split = value.indexOf('\n')
          const muteKind = split >= 0 ? value.slice(0, split) : ''
          const muteValue = split >= 0 ? value.slice(split + 1) : value
          state.mutes = state.mutes.filter((m) => !(m.kind === muteKind && m.value === muteValue))
          saveMutes()
          refreshLocalFilter()
        } else if (kind === 'cluster') {
          state.clusterFilter = ''
          refreshLocalFilter()
        } else if (kind === 'compare') {
          closeCompare()
        } else if (kind === 'followKw') {
          state.followKeepKeyword = false
          syncFollowKeywordChip()
          refreshLocalFilter()
        } else if (kind === 'join') {
          state.keywordJoin = 'and'
          syncJoinModes()
          refreshLocalFilter()
        }
      })
    })
  }

  function renderPinStrip() {
    const strip = $('pinStrip')
    if (!strip) return
    if (!state.pins.length) {
      strip.classList.add('hidden')
      strip.innerHTML = ''
      return
    }
    strip.classList.remove('hidden')
    strip.innerHTML =
      `<div class="pin-strip__head">钉住 ${state.pins.length}</div>` +
      state.pins.map((pin) =>
        `<button type="button" class="pin-card" data-key="${escapeHtml(pin.key)}" title="${escapeHtml(pin.text)}">` +
        `<span class="pin-card__meta">${escapeHtml(pin.ts)} · ${escapeHtml(lastIp(pin.host))} ${escapeHtml(pin.level || '')}</span>` +
        `<span class="pin-card__msg">${escapeHtml(pin.message)}</span>` +
        `<span class="pin-card__x" data-act="unpin" title="取消钉住">×</span>` +
        `</button>`
      ).join('')
    strip.querySelectorAll('.pin-card').forEach((card) => {
      card.addEventListener('click', (event) => {
        if (event.target.closest('[data-act="unpin"]')) {
          state.pins = state.pins.filter((p) => p.key !== card.dataset.key)
          renderPinStrip()
          paintLines()
          return
        }
        const key = card.dataset.key
        const row = [...document.querySelectorAll('#logStream .log-line')].find((el) => el.dataset.key === key)
        if (row) focusLogRow(row)
        else setStatus('这条不在当前筛选里，可先放宽筛选')
      })
    })
  }

  function clockRange(first, last) {
    const start = formatClock(first)
    const end = formatClock(last)
    if (!start || start === '—' || start === end) return ''
    if (start.slice(0, 10) === end.slice(0, 10)) return `${start.slice(11)} → ${end.slice(11)}`
    return `${start} → ${end}`
  }

  function focusLogRow(row) {
    document.querySelectorAll('.log-line.is-focus').forEach((el) => el.classList.remove('is-focus'))
    if (!row) return
    row.classList.add('is-focus')
    row.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  function jumpError(dir) {
    const rows = [...document.querySelectorAll('#logStream .log-line.level-ERROR, #logStream .log-line.level-FATAL')]
    if (!rows.length) {
      setStatus('当前没有错误')
      return
    }
    const paneTop = $('logPane').getBoundingClientRect().top
    let index = -1
    if (dir > 0) {
      index = rows.findIndex((row) => row.getBoundingClientRect().top > paneTop + 56)
      if (index < 0) {
        focusLogRow(rows[rows.length - 1])
        setStatus('已经是最后一条错误')
        return
      }
    } else {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].getBoundingClientRect().top < paneTop - 4) {
          index = i
          break
        }
      }
      if (index < 0) {
        focusLogRow(rows[0])
        setStatus('已经是第一条错误')
        return
      }
    }
    focusLogRow(rows[index])
    const line = rows[index]
    const when = line.querySelector('.log-line__time')?.textContent || ''
    setStatus(`错误 ${index + 1} / ${rows.length}${when ? ` · ${when}` : ''}`)
  }

  function lineKey(line) {
    return `${line.hostId || line.host}|${line.tsMs || line.ts || ''}|${line.lineNo || ''}|${line.text || ''}`
  }

  function lastIp(value) {
    const text = String(value || '').trim()
    const ip = text.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/)
    if (ip) return ip[1].split('.').pop()
    return shortName(text)
  }

  function shortName(name) {
    const text = String(name || '')
    const ip = text.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/)
    if (ip) return ip[1].split('.').pop()
    const parts = text.split(/[./]/).filter(Boolean)
    return parts.length > 1 ? parts[parts.length - 1] : text
  }

  function shortLogger(name) {
    return shortName(name)
  }

  function parseLogBody(text) {
    const raw = String(text ?? '').replace(/\s+$/, '')
    const withThread = raw.match(/^(?:\d{4}-\d{2}-\d{2}[ T])?\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?\s+\[([^\]]+)\]\s+(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL)\s+(\S+)\s+-\s+([\s\S]*)$/i)
    if (withThread) {
      return {
        thread: withThread[1],
        level: withThread[2].toUpperCase() === 'WARNING' ? 'WARN' : withThread[2].toUpperCase(),
        logger: shortLogger(withThread[3]),
        loggerFull: withThread[3],
        message: withThread[4],
      }
    }
    const plain = raw.match(/^(?:\d{4}-\d{2}-\d{2}[ T])?\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?\s+(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL)\s+(\S+)\s+-\s+([\s\S]*)$/i)
    if (plain) {
      return {
        thread: '',
        level: plain[1].toUpperCase() === 'WARNING' ? 'WARN' : plain[1].toUpperCase(),
        logger: shortLogger(plain[2]),
        loggerFull: plain[2],
        message: plain[3],
      }
    }
    const stripped = raw.replace(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?\s*/, '')
    return { thread: '', level: '', logger: '', loggerFull: '', message: stripped }
  }

  function captureScrollAnchor(pane) {
    const top = pane.getBoundingClientRect().top
    const rows = pane.querySelectorAll('.log-line')
    for (const row of rows) {
      const rect = row.getBoundingClientRect()
      if (rect.bottom > top + 8) {
        return { key: row.dataset.key || '', offset: rect.top - top, top: pane.scrollTop }
      }
    }
    return { key: '', offset: 0, top: pane.scrollTop }
  }

  function restoreScrollAnchor(pane, anchor) {
    if (!anchor) return
    if (anchor.key) {
      const row = [...pane.querySelectorAll('.log-line')].find((el) => el.dataset.key === anchor.key)
      if (row) {
        const delta = row.getBoundingClientRect().top - pane.getBoundingClientRect().top - anchor.offset
        pane.scrollTop += delta
        return
      }
    }
    pane.scrollTop = anchor.top || 0
  }

  function pinToBottom(pane) {
    const pin = () => {
      if (!state.stickBottom) return
      state.painting = true
      state.ignoreScrollUntil = Date.now() + 240
      pane.scrollTop = pane.scrollHeight
    }
    pin()
    requestAnimationFrame(() => {
      pin()
      requestAnimationFrame(pin)
    })
  }

  function skewLabel(hostId) {
    const ms = state.hostSkew[hostId]
    if (!Number.isFinite(ms) || Math.abs(ms) < 800) return ''
    const sec = (ms / 1000).toFixed(1)
    return ms > 0 ? `+${sec}s` : `${sec}s`
  }

  function pickLogRange(fromKey, toKey, events) {
    const keys = events.map((item) => lineKey(item.first || item.line))
    const a = keys.indexOf(fromKey)
    const b = keys.indexOf(toKey)
    if (a < 0 || b < 0) {
      state.selectedKeys = new Set([toKey])
      return
    }
    const [lo, hi] = a < b ? [a, b] : [b, a]
    state.selectedKeys = new Set(keys.slice(lo, hi + 1))
  }

  function syncLogSelection() {
    document.querySelectorAll('#logStream .log-line').forEach((el) => {
      el.classList.toggle('is-picked', state.selectedKeys.has(el.dataset.key))
    })
    const n = state.selectedKeys.size
    const btn = $('btnCopyVisible')
    if (btn && !btn.disabled) btn.textContent = n > 1 ? `复制 ${n}` : '复制'
  }

  function handleLogRowClick(ev, key, event) {
    const line = ev.line
    const parsed = ev.parsed
    const level = ev.level
    const first = ev.first || line
    const act = event.target.closest('[data-act]')
    if (act?.dataset.act === 'pin') {
      togglePin(ev)
      return
    }
    if (act?.dataset.act === 'copy') {
      copyOneLine(ev)
      return
    }
    if (act?.dataset.act === 'copy-ctx') {
      copyContext(ev, 5)
      return
    }
    if (act?.dataset.act === 'from-now') {
      searchFromLine(ev)
      return
    }
    if (act?.dataset.act === 'peers') {
      openPeerCheck(ev)
      return
    }
    if (act?.dataset.act === 'mute') {
      if (parsed.loggerFull || parsed.logger) void requestMute('logger', parsed.loggerFull || parsed.logger, parsed.logger || parsed.loggerFull)
      else void requestMute('sig', eventSignature(ev), (parsed.message || line.text || '').slice(0, 80))
      return
    }
    if (act?.dataset.act === 'mute-sig') {
      void requestMute('sig', eventSignature(ev), (parsed.message || line.text || '').slice(0, 80))
      return
    }
    if (act?.dataset.act === 'body') {
      if (state.openBodies.has(key)) state.openBodies.delete(key)
      else state.openBodies.add(key)
      paintLines()
      return
    }
    if (event.target.closest('.log-line__time')) {
      const center = Number(first.tsMs || line.tsMs || 0)
      if (center) {
        state.timeWindow = null
        setTimeFocus(center)
      }
      return
    }
    if (event.target.closest('.log-line__thread') && parsed.thread) {
      toggleKeyword(parsed.thread)
      return
    }
    const token = event.target.closest('.log-token')
    if (token) {
      if (token.dataset.kind === 'trace') openTrace(token.dataset.token || '')
      else toggleKeyword(token.dataset.token || '')
      return
    }
    if (event.target.closest('.log-stack__toggle')) {
      if (state.openStacks.has(key)) state.openStacks.delete(key)
      else state.openStacks.add(key)
      paintLines()
      return
    }
    if (event.target.closest('.level-tag') && level) {
      state.levels = [level === 'FATAL' ? 'ERROR' : level]
      state.levelMulti = false
      syncLevelChips()
      paintLines()
      return
    }
    if (event.target.closest('.log-line__logger') && parsed.logger) {
      toggleKeyword(parsed.logger)
      return
    }
    if (event.target.closest('.log-line__ops') || event.target.closest('button')) return

    state.cursorKey = key
    if (event.shiftKey && state.lastPickKey) {
      const events = viewEvents().filter((item) => !item.context)
      pickLogRange(state.lastPickKey, key, events)
    } else if (event.metaKey || event.ctrlKey) {
      if (state.selectedKeys.has(key)) state.selectedKeys.delete(key)
      else state.selectedKeys.add(key)
      state.lastPickKey = key
    } else {
      state.selectedKeys = new Set([key])
      state.lastPickKey = key
    }
    syncLogSelection()
    document.querySelectorAll('.log-line.is-focus').forEach((el) => el.classList.remove('is-focus'))
    event.currentTarget?.classList.add('is-focus')
  }

  function createLogRow(ev, opts, markNew, prevTs) {
    const nodes = []
    const line = ev.line
    const parsed = ev.parsed
    const level = ev.level
    const color = hostColor(line.hostId || line.host)
    const row = document.createElement('article')
    const key = lineKey(line)
    const stackOpen = state.openStacks.has(key)
    const first = ev.first || line
    const range = ev.repeat > 1 ? clockRange(first, line) : ''
    const pinned = state.pins.some((p) => p.key === key)
    const ts = eventTimeMs(ev)
    if (prevTs && ts && ts - prevTs >= 8000) {
      const gap = document.createElement('div')
      gap.className = 'log-gap'
      gap.textContent = `间隔 ${formatGap(ts - prevTs)}`
      nodes.push(gap)
    }
    const unique = state.uniqueOnly && !ev.context
    const sameSec = sameSecond(prevTs, ts)
    row.className = 'log-line'
      + (level ? ` level-${level}` : '')
      + (ev.context ? ' is-context' : '')
      + (pinned ? ' is-pinned' : '')
      + (unique ? ' is-unique' : '')
      + (state.cursorKey === key ? ' is-focus' : '')
      + (state.selectedKeys.has(key) ? ' is-picked' : '')
      + (markNew && !state.lastKeys.has(key) ? ' is-new' : '')
      + (sameSec ? ' is-same-sec' : '')
    row.dataset.key = key
    row.dataset.ts = String(ts || 0)
    const fullClock = formatClock(first)
    row.title = [
      ev.repeat > 1 ? `第一次 ${fullClock}` : fullClock,
      line.host || line.hostLabel,
      level,
      parsed.thread ? `线程 ${parsed.thread}` : '',
      parsed.loggerFull || '',
      line.file || '',
      relativeTime(first),
      'Shift 多选 · Ctrl 点选',
    ].filter(Boolean).join(' · ')
    const peek = !stackOpen && ev.stack.length ? stackPeek(ev.stack) : ''
    const stackHtml = ev.stack.length
      ? `<button type="button" class="log-stack__toggle">${stackOpen ? '收起堆栈' : `堆栈 ${ev.stack.length}`}</button>` +
        (!stackOpen && peek ? `<span class="log-stack__peek" title="${escapeHtml(ev.stack[0].text || '')}">${escapeHtml(peek)}</span>` : '') +
        (stackOpen ? `<pre class="log-stack">${ev.stack.map((item) => highlight(item.text, opts)).join('\n')}</pre>` : '')
      : ''
    const fileTip = line.file ? String(line.file).split(/[/\\]/).pop() : ''
    const expanded = state.openBodies.has(key)
    const jsonPretty = expanded ? prettyJson(parsed.message) : ''
    const long = messageIsLong(parsed.message) || maybeJson(parsed.message)
    const bodyText = expanded
      ? (jsonPretty || parsed.message)
      : (long ? previewMessage(parsed.message) : parsed.message)
    const ago = relativeTime(first)
    const showAgo = state.following && ago
    row.innerHTML =
      `<time class="log-line__time" title="${escapeHtml(fullClock)} · 点一下看附近 30 秒">` +
        `<span class="log-line__clock">${escapeHtml(formatClockCompact(first))}</span>` +
        (showAgo ? `<span class="log-line__ago">${escapeHtml(ago)}</span>` : '') +
      `</time>` +
      `<span class="host-pill" title="${escapeHtml(line.host || line.hostLabel)}" style="--host:${color};color:${color};background:color-mix(in srgb, ${color} 16%, transparent)">` +
        `<i class="host-dot" aria-hidden="true"></i>${escapeHtml(lastIp(line.host || line.hostLabel))}</span>` +
      `<span class="level-tag${level ? ` level-${escapeHtml(level)}` : ''}" title="只看这个级别">${escapeHtml(level || '·')}</span>` +
      (parsed.thread
        ? `<button type="button" class="log-line__thread" title="线程 ${escapeHtml(parsed.thread)} · 点击只看这个线程">${escapeHtml(shortThread(parsed.thread))}</button>`
        : `<span class="log-line__thread is-empty"></span>`) +
      `<div class="log-line__msg">` +
        (parsed.logger ? `<span class="log-line__logger" title="${escapeHtml(parsed.loggerFull)} · 点击只看这个类">${escapeHtml(parsed.logger)}</span>` : '') +
        (fileTip ? `<span class="log-line__file" title="${escapeHtml(line.file || '')}">${escapeHtml(fileTip)}</span>` : '') +
        `<span class="log-clip${expanded ? ' is-open' : (long ? ' is-clamped' : '')}">` +
          (expanded && jsonPretty
            ? `<pre class="log-json">${escapeHtml(bodyText)}</pre>`
            : `<span class="log-line__body">${highlight(bodyText, opts)}</span>`) +
          (long
            ? `<button type="button" class="log-more" data-act="body">${expanded ? '收起' : '展开'}</button>`
            : '') +
        `</span>` +
        (ev.repeat > 1 ? `<button type="button" class="log-repeat" data-act="mute-sig" title="屏蔽这类重复日志">×${ev.repeat}${range ? `<span class="log-repeat__when">${escapeHtml(range)}</span>` : ''}</button>` : '') +
        stackHtml +
      `</div>` +
      `<div class="log-line__ops">` +
        `<button type="button" class="log-op" data-act="pin" title="${pinned ? '取消钉住' : '钉住'}">${pinned ? '★' : '☆'}</button>` +
        `<button type="button" class="log-op" data-act="mute" title="屏蔽这个 Logger，以后不再显示">屏蔽</button>` +
        `<button type="button" class="log-op" data-act="copy" title="复制这一条">复制</button>` +
        `<button type="button" class="log-op" data-act="copy-ctx" title="复制前后 5 行">前后文</button>` +
        `<button type="button" class="log-op" data-act="from-now" title="从这一行查到现在">到现在</button>` +
        `<button type="button" class="log-op" data-act="peers" title="看其它实例有没有同类日志">其它台</button>` +
      `</div>`
    row.addEventListener('click', (event) => handleLogRowClick(ev, key, event))
    nodes.push(row)
    return { nodes, ts: ts || prevTs, key }
  }

  function paintLines(options = {}) {
    const lite = options.lite === true
    const preferAppend = options.append === true && state.stickBottom
    if (!lite) renderServers()
    const markNew = options.markNew === true
    const events = viewEvents()
    const opts = queryOptions()
    const empty = $('emptyState')
    const stream = $('logStream')
    const pane = $('logPane')
    const keys = events.map((ev) => lineKey(ev.line))
    const prevKeys = state.paintedKeys || []
    const canAppend = preferAppend
      && prevKeys.length > 0
      && keys.length > prevKeys.length
      && prevKeys.every((key, index) => key === keys[index])
      && stream.querySelectorAll('.log-line').length === prevKeys.length

    if (canAppend) {
      state.painting = true
      state.ignoreScrollUntil = Date.now() + 120
      const frag = document.createDocumentFragment()
      let prevTs = Number(stream.querySelector('.log-line:last-child')?.dataset.ts || 0)
      for (const ev of events.slice(prevKeys.length)) {
        const built = createLogRow(ev, opts, markNew, prevTs)
        built.nodes.forEach((node) => frag.appendChild(node))
        prevTs = built.ts
      }
      stream.appendChild(frag)
      state.paintedKeys = keys
      state.lastKeys = new Set(keys.slice(-400))
      $('logTabCount').textContent = String(events.length)
      if (!lite) {
        renderFilterBar()
        renderInsight(events)
        renderHisto(events)
        renderClusters(events)
        renderHealth()
      }
      if (state.traceId) renderTrace()
      if (state.compare) paintComparePanes()
      const dl = $('btnDownload')
      if (dl) dl.disabled = !events.length
      pinToBottom(pane)
      requestAnimationFrame(() => {
        state.painting = false
        state.ignoreScrollUntil = Date.now() + 80
      })
      updateSelectionBars()
      syncLogSelection()
      return
    }

    const keepPlace = !state.stickBottom
    const anchor = keepPlace ? captureScrollAnchor(pane) : null
    state.painting = true
    state.ignoreScrollUntil = Date.now() + 120
    stream.innerHTML = ''
    stream.classList.toggle('no-wrap', !state.wrap)
    $('logTabCount').textContent = state.rawLines.length ? String(events.length) : ''
    if (!lite) {
      renderFilterBar()
      renderInsight(events)
      renderPinStrip()
      renderHisto(events)
      renderClusters(events)
      renderHealth()
    }
    if (state.traceId) renderTrace()
    const exportBtn = $('btnExport')
    if (exportBtn) exportBtn.disabled = !events.length && !state.pins.length
    const dl = $('btnDownload')
    if (dl) dl.disabled = !events.length
    if (!events.length) {
      empty.classList.remove('hidden')
      if (!state.compare) stream.classList.add('hidden')
      $('btnCopyVisible').disabled = true
      if (exportBtn) exportBtn.disabled = !state.pins.length
      updateJumpBottom()
      state.paintedKeys = []
      state.painting = false
      updateSelectionBars()
      if (state.rawLines.length) {
        empty.querySelector('strong').textContent = '当前筛选没有日志'
        empty.querySelector('p').textContent = '换匹配模式、去掉排除词，或点「清筛选」放宽条件。点时间可看附近 30 秒。'
      }
      if (state.compare) paintComparePanes()
      return
    }
    empty.classList.add('hidden')
    if (state.compare) {
      stream.classList.add('hidden')
      paintComparePanes()
    } else {
      stream.classList.remove('hidden')
      $('compareSplit')?.classList.add('hidden')
    }
    $('btnCopyVisible').disabled = false
    const frag = document.createDocumentFragment()
    let prevTs = 0
    for (const ev of events) {
      const built = createLogRow(ev, opts, markNew, prevTs)
      built.nodes.forEach((node) => frag.appendChild(node))
      prevTs = built.ts
    }
    stream.innerHTML = ''
    stream.appendChild(frag)
    state.paintedKeys = keys
    state.lastKeys = new Set(keys.slice(-400))
    if (state.stickBottom) pinToBottom(pane)
    else restoreScrollAnchor(pane, anchor)
    updateJumpBottom()
    requestAnimationFrame(() => {
      state.painting = false
      state.ignoreScrollUntil = Date.now() + 80
    })
    updateSelectionBars()
    syncLogSelection()
  }

  function visibleFiles() {
    const keyword = $('keyword').value.trim().toLowerCase()
    return state.files.filter((file) => {
      if (state.hostFilter.length && !state.hostFilter.includes(file.hostId)) return false
      if (!keyword) return true
      return `${file.name} ${file.path} ${file.hostLabel}`.toLowerCase().includes(keyword)
    })
  }

  function paintFiles() {
    const files = visibleFiles()
    const empty = $('fileEmpty')
    const table = $('fileTable')
    const body = $('fileBody')
    body.innerHTML = ''
    $('fileTabCount').textContent = state.files.length ? String(files.length) : ''
    if (!files.length) {
      empty.classList.remove('hidden')
      table.classList.add('hidden')
      if (state.files.length) {
        empty.querySelector('strong').textContent = '没有符合筛选的文件'
        empty.querySelector('p').textContent = '清掉关键字或实例筛选后再看。'
      }
      return
    }
    empty.classList.add('hidden')
    table.classList.remove('hidden')
    const frag = document.createDocumentFragment()
    for (const file of files) {
      const picked = state.fileFilter.includes(file.name)
      const tr = document.createElement('tr')
      const color = hostColor(file.hostId)
      tr.className = picked ? 'is-selected' : ''
      tr.title = '点击多选，再拉取这些文件的尾部'
      tr.innerHTML =
        `<td class="col-check"><input type="checkbox" ${picked ? 'checked' : ''} aria-label="选择文件" /></td>` +
        `<td class="file-name">${escapeHtml(file.name)}</td>` +
        `<td class="col-host"><span class="host-pill" title="${escapeHtml(file.host || file.hostLabel)}" style="color:${color};background:color-mix(in srgb, ${color} 16%, transparent)">${escapeHtml(lastIp(file.host || file.hostLabel))}</span></td>` +
        `<td class="col-size">${escapeHtml(formatBytes(file.size))}</td>` +
        `<td class="col-path">${escapeHtml(file.path)}</td>`
      tr.addEventListener('click', () => {
        toggleValue(state.fileFilter, file.name)
        paintFiles()
        paintLines()
        updateSelectionBars()
      })
      frag.appendChild(tr)
    }
    body.appendChild(frag)
  }

  function showTab(name) {
    state.tab = name
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.classList.toggle('is-active', tab.dataset.tab === name)
    })
    $('panel-logs').classList.toggle('is-active', name === 'logs')
    $('panel-files').classList.toggle('is-active', name === 'files')
  }

  async function invoke(method, params) {
    const api = window.datawisePlugin
    return api.invoke(method, {
      connectionId: state.connectionId,
      ...params,
    })
  }

  function toggleValue(list, value) {
    const index = list.indexOf(value)
    if (index >= 0) list.splice(index, 1)
    else list.push(value)
  }

  function toggleValueSet(set, value) {
    if (set.has(value)) set.delete(value)
    else set.add(value)
  }

  function enabledServersPayload() {
    return state.servers
      .filter((s) => s.enabled !== false)
      .filter((s) => !state.hostFilter.length || state.hostFilter.includes(s.id))
      .map(serverPayload)
  }

  function updateSelectionBars() {
    const fileBar = $('fileSelection')
    const files = state.fileFilter.length
    fileBar.classList.toggle('hidden', files === 0)
    $('fileSelectionCount').textContent = `已选 ${files} 个文件`
  }

  function syncCancelBtn(on) {
    $('btnCancelSearch')?.classList.toggle('hidden', !on)
  }

  function cancelSearch() {
    if (!state.busy) return
    state.searchCancelled = true
    state.searchEpoch += 1
    syncCancelBtn(false)
    setStatus('已取消本次查询 · 已出结果保留')
    setBadge('ok', 'ok')
  }

  async function withBusy(label, fn) {
    if (state.busy) return
    state.busy = true
    state.searchCancelled = false
    setBadge('busy', 'busy')
    setStatus(label)
    setLoading(true)
    syncCancelBtn(true)
    try {
      await fn()
      if (!state.searchCancelled) setBadge(state.following ? 'live' : 'ok', 'ok')
    } catch (e) {
      if (state.searchCancelled) return
      const msg = e?.message || String(e)
      setBadge('error', 'err')
      setStatus(msg)
      console.error(e)
    } finally {
      state.busy = false
      setLoading(false)
      syncCancelBtn(false)
    }
  }

  function refreshHostSkew() {
    const byHost = new Map()
    for (const line of state.rawLines.slice(-800)) {
      const id = line.hostId || line.host
      const ts = Number(line.tsMs || 0)
      if (!id || !ts) continue
      if (!byHost.has(id)) byHost.set(id, [])
      byHost.get(id).push(ts)
    }
    if (byHost.size < 2) {
      state.hostSkew = {}
      return
    }
    const medians = {}
    for (const [id, arr] of byHost) {
      arr.sort((a, b) => a - b)
      medians[id] = arr[Math.floor(arr.length / 2)]
    }
    const baseId = state.servers.find((s) => s.enabled !== false)?.id || Object.keys(medians)[0]
    const base = medians[baseId] || Object.values(medians)[0]
    const skew = {}
    for (const [id, mid] of Object.entries(medians)) {
      skew[id] = mid - base
    }
    state.hostSkew = skew
  }

  function applyHostResults(res) {
    if (Array.isArray(res.errors)) {
      for (const err of res.errors) {
        const srv = state.servers.find((s) => s.id === err.id || s.label === err.label)
        if (srv) {
          srv.status = err.message
          srv.statusKind = 'err'
        }
      }
    }
    for (const h of res.hosts || res.results || []) {
      const srv = state.servers.find((s) => s.id === h.id)
      if (!srv) continue
      if (h.ok === false) {
        srv.status = h.message || '暂时连不上'
        srv.statusKind = 'err'
      } else if (h.lineCount != null) {
        const tag = h.rotated ? '已轮转 · ' : (h.incremental ? '' : '')
        srv.status = `${tag}${h.file || '—'} · ${h.lineCount} 行`
        srv.statusKind = 'ok'
      } else if (h.fileCount != null) {
        srv.status = `${h.fileCount} 个文件`
        srv.statusKind = 'ok'
      }
      if (h.cursor && h.cursor.path) {
        state.cursors[h.id] = {
          path: h.cursor.path,
          size: Number(h.cursor.size || 0),
          inode: String(h.cursor.inode || ''),
        }
      } else if (h.filePath) {
        state.cursors[h.id] = {
          path: h.filePath,
          size: Number(h.fileSize || 0),
          inode: String(h.fileInode || ''),
        }
      }
    }
    refreshHostSkew()
    renderServers()
  }

  async function reconnectServer(srv) {
    try {
      setStatus(`正在重连 ${srv.label || srv.host}…`)
      const res = await invoke('logs/reconnect', {
        servers: [serverPayload(srv)],
        serverId: srv.id,
      })
      srv.status = res.message || '已重连'
      srv.statusKind = 'ok'
      delete state.cursors[srv.id]
      renderServers()
      setStatus(`${srv.label || srv.host} 已重连`)
    } catch (e) {
      srv.status = e?.message || String(e)
      srv.statusKind = 'err'
      renderServers()
      setStatus(e?.message || String(e))
    }
  }

  async function runProbe() {
    try {
      await ensureSessionApplied()
    } catch (e) {
      setStatus(e?.message || String(e))
      return
    }
    await withBusy('正在探测各实例…', async () => {
      const res = await invoke('logs/probe', { servers: enabledServersPayload() })
      applyHostResults(res)
      const ok = (res.results || []).filter((r) => r.ok).length
      setStatus(`探测完成：${ok}/${(res.results || []).length} 台可用`)
    })
  }

  function modeLabel(mode) {
    return ({ contains: '包含', whole: '整词', exact: '精准', regex: '正则' })[mode] || mode
  }

  function mergeIncoming(lines, opts = {}) {
    const seen = new Set(state.rawLines.map(lineKey))
    let added = 0
    const fresh = []
    for (const line of lines || []) {
      const key = lineKey(line)
      if (seen.has(key)) continue
      fresh.push(line)
      seen.add(key)
      added += 1
    }
    if (opts.prepend) state.rawLines = fresh.concat(state.rawLines)
    else state.rawLines.push(...fresh)
    state.rawLines.sort((a, b) => {
      const ta = Number(a.tsMs || 0)
      const tb = Number(b.tsMs || 0)
      if (ta && tb && ta !== tb) return ta - tb
      return Number(a.lineNo || 0) - Number(b.lineNo || 0)
    })
    const pages = Math.max(1, (state.olderPage || 0) + 1)
    const maxKeep = Math.max(Number($('maxLines').value) || 200, 200) * Math.max(3, pages + 1)
    if (state.rawLines.length > maxKeep) {
      state.rawLines = opts.prepend
        ? state.rawLines.slice(0, maxKeep)
        : state.rawLines.slice(-maxKeep)
    }
    return added
  }

  function syncFollowButton() {
    const btn = $('btnFollow')
    btn.classList.toggle('is-on', state.following)
    btn.textContent = state.following ? '停止跟随' : '跟随'
    document.body.classList.toggle('is-following', state.following)
  }

  function stopFollow(reason) {
    if (state.followTimer) {
      clearTimeout(state.followTimer)
      state.followTimer = null
    }
    const was = state.following
    state.following = false
    state.followBusy = false
    state.followEpoch += 1
    syncFollowButton()
    if (was) setStatus(reason || '已停止跟随')
  }

  function followErrorText(error) {
    const msg = error?.message || String(error || '')
    if (/TimeoutException|timed out|超时/i.test(msg)) return '这次读取超时了，跟随会再试'
    return msg || '跟随暂时没读到新日志'
  }

  function scheduleFollow(delayMs) {
    if (state.followTimer) clearTimeout(state.followTimer)
    state.followTimer = setTimeout(() => { void followTick() }, delayMs)
  }

  async function followTick() {
    if (!state.following || state.busy || state.followBusy) return
    state.followBusy = true
    const epoch = ++state.followEpoch
    let retryIn = followDelay()
    try {
      const q = queryOptions()
      const maxLines = Number($('maxLines').value) || 200
      const servers = enabledServersPayload()
      let added = 0
      let errAdded = 0
      let errHosts = 0
      await mapPool(servers, Math.min(4, servers.length || 1), async (srv) => {
        if (!state.following || epoch !== state.followEpoch) return
        const live = state.servers.find((s) => s.id === srv.id)
        try {
          const keepKw = state.followKeepKeyword && q.keyword
          const res = await invoke('logs/tail', {
            servers: [srv],
            keyword: keepKw ? q.keyword : '',
            matchMode: keepKw ? q.matchMode : 'contains',
            ignoreCase: q.ignoreCase,
            exclude: q.exclude,
            keywordJoin: q.keywordJoin,
            level: 'ALL',
            maxLines,
            remoteGrep: false,
            files: state.fileFilter,
            cursors: state.cursors[srv.id] ? { [srv.id]: state.cursors[srv.id] } : {},
          })
          if (!state.following || epoch !== state.followEpoch) return
          await enqueueMerge(() => {
            if (!state.following || epoch !== state.followEpoch) return
            applyHostResults(res)
            const incoming = res.lines || []
            const seen = new Set(state.rawLines.map(lineKey))
            for (const line of incoming) {
              if (seen.has(lineKey(line))) continue
              const lv = String(line.level || '').toUpperCase()
              if (lv === 'ERROR' || lv === 'FATAL' || /\b(?:ERROR|FATAL)\b/.test(line.text || '')) errAdded += 1
            }
            added += mergeIncoming(incoming)
            if ((res.errors || []).length) errHosts += (res.errors || []).length
          })
        } catch (e) {
          errHosts += 1
          if (live) {
            live.status = e?.message || '读取失败'
            live.statusKind = 'err'
          }
        }
      })
      if (!state.following || epoch !== state.followEpoch) return
      renderHealth()
      setBadge('live', 'ok')
      const spike = errAdded >= 3 && errAdded >= Math.max(3, (state.prevErrAdded || 0) * 2)
      state.prevErrAdded = errAdded
      if (added > 0) {
        if (!state.stickBottom) {
          state.unreadCount += added
          updateJumpBottom()
        } else {
          state.sideDirty = (state.sideDirty || 0) + added
          const refreshSide = state.sideDirty >= 160
          paintLines({ markNew: true, lite: !refreshSide, append: true })
          if (refreshSide) {
            state.sideDirty = 0
            renderServers()
            syncSessionChrome()
          }
        }
      } else {
        try { await invoke('logs/keepalive', {}) } catch (_) { /* keep trying next tick */ }
        if (state.stickBottom) {
          const pane = $('logPane')
          if (pane.scrollHeight - pane.scrollTop - pane.clientHeight > 8) pinToBottom(pane)
        }
      }
      if (spike) {
        setStatus(`错误突然变多 · 本轮 ${errAdded} 条 ERROR`)
      } else if (!state.stickBottom) {
        setStatus(state.unreadCount > 0
          ? `跟随已暂停 · ${state.unreadCount} 条新日志`
          : '跟随已暂停 · 滑到底部继续')
        updateJumpBottom()
      } else if (added > 0) {
        const kwHint = q.keyword && !state.followKeepKeyword ? ' · 关键字仅本地' : (state.followKeepKeyword && q.keyword ? ' · 带关键字' : '')
        setStatus(`跟随中 · 新增 ${added} 行 · 窗口 ${visibleLines().length}${kwHint}${errHosts ? ` · ${errHosts} 台暂不可用` : ''}`)
      } else {
        const kwHint = q.keyword && !state.followKeepKeyword ? ' · 关键字仅本地' : (state.followKeepKeyword && q.keyword ? ' · 带关键字' : '')
        setStatus(`跟随中 · 等待新日志 · ${visibleLines().length} 行${kwHint}${errHosts ? ` · ${errHosts} 台暂不可用` : ''}`)
      }
    } catch (e) {
      if (!state.following) return
      retryIn = Math.max(followDelay(), 5000)
      setBadge('live', 'ok')
      setStatus(followErrorText(e))
    } finally {
      state.followBusy = false
      if (state.following) scheduleFollow(retryIn)
    }
  }

  async function startFollow() {
    showTab('logs')
    state.stickBottom = true
    state.unreadCount = 0
    state.following = true
    syncFollowButton()
    setBadge('live', 'ok')
    setStatus('正在跟随新日志…')
    await runSearch({ forceTail: true, keepFollow: true })
    if (!state.following) return
    scheduleFollow(followDelay())
  }

  async function toggleFollow() {
    if (state.following) stopFollow('已停止跟随')
    else await startFollow()
  }

  async function runSearch(opts = {}) {
    try {
      await ensureSessionApplied()
    } catch (e) {
      setStatus(e?.message || String(e))
      return
    }
    const q = queryOptions()
    const maxLines = Number($('maxLines').value) || 200
    const olderPage = Number(opts.olderPage || 0)
    const keepLines = !!opts.keepLines || olderPage > 0
    if (!opts.keepFollow) stopFollow()
    showTab('logs')
    const timeFrom = opts.timeFrom || ''
    const timeTo = opts.timeTo || ''
    const usingTime = !!(timeFrom || timeTo)
    if (usingTime) stopFollow()
    if (!keepLines && !opts.keepFollow) state.olderPage = 0
    await withBusy(
      olderPage > 0
        ? `再读更早的一段…`
        : (usingTime ? '按时间段查阅…' : (opts.forceTail ? '拉取尾部日志…' : '合并查询中…')),
      async () => {
      const epoch = ++state.searchEpoch
      if (!opts.keepFollow && olderPage === 0) state.cursors = {}
      markHostsBusy()
      setLoading(false)
      if (!opts.forceTail && q.keyword) void rememberKeyword(q.keyword)
      const method = usingTime ? 'logs/search' : (opts.forceTail || olderPage > 0 ? 'logs/tail' : 'logs/search')
      const servers = enabledServersPayload()
      if (!keepLines && !opts.keepFollow) state.rawLines = []
      let done = 0
      let failed = 0
      let addedTotal = 0
      const useKeyword = olderPage > 0
        ? false
        : (usingTime || !(opts.forceTail && !state.followKeepKeyword))
      const pane = $('logPane')
      const anchorKey = olderPage > 0
        ? [...pane.querySelectorAll('.log-line')].find((el) => el.getBoundingClientRect().top >= pane.getBoundingClientRect().top - 2)?.dataset.key
        : ''
      setStatus(`0/${servers.length} 台已出结果`)
      await mapPool(servers, Math.min(4, servers.length || 1), async (srv) => {
        if (epoch !== state.searchEpoch) return
        const live = state.servers.find((s) => s.id === srv.id)
        if (live) {
          live.status = '读取中'
          live.statusKind = 'busy'
        }
        try {
          const res = await invoke(method, {
            servers: [srv],
            keyword: useKeyword ? q.keyword : '',
            matchMode: useKeyword ? q.matchMode : 'contains',
            ignoreCase: q.ignoreCase,
            exclude: q.exclude,
            keywordJoin: q.keywordJoin,
            level: 'ALL',
            maxLines,
            remoteGrep: usingTime || opts.forceTail || olderPage > 0 ? false : q.remoteGrep,
            files: state.fileFilter,
            ...(opts.keepFollow && state.cursors[srv.id] ? { cursors: { [srv.id]: state.cursors[srv.id] } } : {}),
            ...(olderPage > 0 ? { olderPage } : {}),
            ...(timeFrom ? { timeFrom } : {}),
            ...(timeTo ? { timeTo } : {}),
          })
          if (epoch !== state.searchEpoch) return
          await enqueueMerge(() => {
            if (epoch !== state.searchEpoch) return
            applyHostResults(res)
            addedTotal += mergeIncoming(res.lines || [], { prepend: olderPage > 0 })
            done += 1
            if ((res.errors || []).length) failed += 1
            paintLines({ lite: true, markNew: !!opts.keepFollow })
            setStatus(`${done}/${servers.length} 台已出结果${failed ? ` · ${failed} 台异常` : ''}`)
          })
        } catch (e) {
          if (epoch !== state.searchEpoch) return
          await enqueueMerge(() => {
            if (epoch !== state.searchEpoch) return
            failed += 1
            if (live) {
              live.status = e?.message || '读取失败'
              live.statusKind = 'err'
            }
            renderServers()
            renderHealth()
            setStatus(`${done}/${servers.length} 台已出结果 · ${failed} 台异常`)
          })
        }
      })
      if (epoch !== state.searchEpoch || state.searchCancelled) return
      if (olderPage > 0) state.olderPage = olderPage
      if (!keepLines && !opts.keepFollow && state.rawLines.length > maxLines) {
        state.rawLines = state.rawLines.slice(-maxLines)
      }
      state.stickBottom = olderPage > 0 ? false : state.stickBottom
      paintLines({ markNew: !!opts.keepFollow })
      if (olderPage > 0 && anchorKey) {
        const row = [...document.querySelectorAll('#logStream .log-line')].find((el) => el.dataset.key === anchorKey)
        if (row) {
          state.painting = true
          row.scrollIntoView({ block: 'start' })
          state.painting = false
        }
      }
      const shown = displayedSummary()
      const bits = [
        olderPage > 0
          ? `更早第 ${olderPage + 1} 页 · 新增 ${addedTotal} 行 · 共 ${state.rawLines.length} 行`
          : (usingTime ? `时间段 ${state.rawLines.length} 行` : (opts.forceTail ? `尾部 ${state.rawLines.length} 行` : `合并 ${state.rawLines.length} 行`)),
        shown.ctx ? `显示 ${shown.hits} + 前后文 ${shown.ctx}` : `显示 ${shown.hits}`,
        `${done} 台完成`,
        modeLabel(q.matchMode),
      ]
      if (q.keywordJoin === 'or') bits.push('任一包含')
      if (usingTime) bits.push(`${timeFrom.slice(5, 16)} → ${timeTo.slice(11, 16)}`)
      if (!q.ignoreCase) bits.push('区分大小写')
      if (q.exclude) bits.push('已排除')
      if (failed) bits.push(`${failed} 台异常`)
      if (!opts.keepFollow) setStatus(bits.join(' · '))
      void saveWorkspace()
      updateOlderBtn()
    })
  }

  async function loadOlder() {
    if (state.busy) return
    if (state.following) stopFollow('已暂停跟随，准备读更早的日志')
    const next = (state.olderPage || 0) + 1
    await runSearch({ forceTail: true, olderPage: next, keepLines: true })
  }

  function displayedSummary() {
    const events = viewEvents()
    const ctx = events.filter((ev) => ev.context).length
    return { events, hits: events.length - ctx, ctx }
  }

  function refreshLocalFilter() {
    paintLines()
    paintFiles()
    if (state.rawLines.length) {
      const shown = displayedSummary()
      const extra = shown.ctx ? ` + 前后文 ${shown.ctx}` : ''
      setStatus(`显示 ${shown.hits}${extra} / ${state.rawLines.length} 行 · ${modeLabel(state.matchMode)}`)
    }
  }

  function setMatchMode(mode) {
    state.matchMode = mode
    document.querySelectorAll('#matchModes .chip').forEach((chip) => {
      chip.classList.toggle('is-active', chip.dataset.mode === mode)
    })
    syncRegexHint()
    syncQueryOptsChip()
    refreshLocalFilter()
  }

  function syncRegexHint() {
    const hint = $('regexHint')
    if (!hint) return
    if (state.matchMode !== 'regex') {
      hint.textContent = ''
      hint.classList.add('hidden')
      return
    }
    const raw = String($('keyword')?.value || '').trim()
    if (!raw) {
      hint.textContent = '正则写在上方搜索框'
      hint.classList.remove('hidden')
      return
    }
    try {
      new RegExp(raw)
      hint.textContent = ''
      hint.classList.add('hidden')
    } catch (e) {
      hint.textContent = e?.message || '正则写得不对'
      hint.classList.remove('hidden')
    }
  }

  function resetQueryPop() {
    setMatchMode('contains')
    state.keywordJoin = 'and'
    syncJoinModes()
    if ($('ignoreCase')) $('ignoreCase').checked = true
    if ($('remoteGrep')) $('remoteGrep').checked = true
    if ($('exclude')) $('exclude').value = ''
    state.levels = state.levels.filter((lv) => lv === 'ERROR' || lv === 'WARN')
    state.levelMulti = false
    state.timeFocus = null
    state.timeWindow = null
    state.histoWindow = null
    if ($('timeFrom')) $('timeFrom').value = ''
    if ($('timeTo')) $('timeTo').value = ''
    document.querySelectorAll('.time-presets .chip').forEach((chip) => chip.classList.remove('is-active'))
    syncLevelChips()
    syncQueryOptsChip()
    refreshLocalFilter()
    setStatus('已清空匹配、排除和时间')
  }

  function runTodayRange() {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
    const from = toLocalInputValue(start.getTime())
    const to = toLocalInputValue(now.getTime())
    if ($('timeFrom')) $('timeFrom').value = from
    if ($('timeTo')) $('timeTo').value = to
    state.timeFocus = null
    state.timeWindow = { fromMs: start.getTime(), toMs: now.getTime() }
    closeQueryPop()
    void runSearch({ timeFrom: from, timeTo: to })
  }

  async function runListFiles(opts = {}) {
    try {
      await ensureSessionApplied()
    } catch (e) {
      setStatus(e?.message || String(e))
      return
    }
    if (!opts.stay) showTab('files')
    await withBusy('扫描日志目录…', async () => {
      const res = await invoke('logs/files', {
        servers: state.servers.map(serverPayload),
      })
      const files = []
      for (const host of res.hosts || []) {
        for (const f of host.files || []) {
          files.push({
            hostId: host.id,
            hostLabel: host.label,
            host: host.host,
            name: f.name,
            size: f.size,
            path: f.path,
            mtime: Number(f.mtime || 0),
          })
        }
        const srv = state.servers.find((s) => s.id === host.id)
        if (srv) {
          srv.status = `${(host.files || []).length} 个文件`
          srv.statusKind = 'ok'
        }
      }
      for (const err of res.errors || []) {
        const srv = state.servers.find((s) => s.id === err.id || s.label === err.label)
        if (srv) {
          srv.status = err.message
          srv.statusKind = 'err'
        }
      }
      state.files = files
      renderServers()
      paintFiles()
      setStatus(`${files.length} 个日志文件 · 可多选后拉取尾部`)
    })
  }

  function openSelectedFiles() {
    if (!state.fileFilter.length) return
    showTab('logs')
    runSearch({ forceTail: true })
  }

  function formatBytes(n) {
    const v = Number(n) || 0
    if (v < 1024) return `${v} B`
    if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`
    return `${(v / (1024 * 1024)).toFixed(1)} MB`
  }

  function syncKeywordClear() {
    $('btnClearKeyword').classList.toggle('hidden', !$('keyword').value)
  }

  function syncLevelChips() {
    const multi = $('btnLevelMulti')
    if (multi) {
      multi.classList.toggle('is-active', state.levelMulti)
      multi.setAttribute('aria-pressed', state.levelMulti ? 'true' : 'false')
    }
    document.querySelectorAll('#levelChips .chip[data-level], #levelExtra .chip[data-level]').forEach((chip) => {
      const on = chip.dataset.level === 'ALL' ? state.levels.length === 0 : state.levels.includes(chip.dataset.level)
      chip.classList.toggle('is-active', on)
      chip.setAttribute('aria-pressed', on ? 'true' : 'false')
    })
    syncQueryOptsChip()
  }

  function syncQueryOptsChip() {
    const btn = $('btnQueryOpts')
    if (!btn) return
    const q = (() => {
      try { return queryOptions() } catch (_) { return null }
    })()
    const bits = []
    if (state.matchMode && state.matchMode !== 'contains') bits.push(modeLabel(state.matchMode))
    if (state.keywordJoin === 'or') bits.push('任一')
    if (q && !q.ignoreCase) bits.push('区分大小写')
    if (q?.exclude) bits.push('排除')
    if (state.levels.some((lv) => lv === 'INFO' || lv === 'DEBUG')) bits.push('更多级别')
    if ($('timeFrom')?.value || $('timeTo')?.value) bits.push('时间')
    btn.textContent = bits.length ? `筛选 · ${bits.length}` : '筛选'
    btn.classList.toggle('is-active', bits.length > 0)
  }

  function closeQueryPop() {
    $('queryPop')?.classList.add('hidden')
    $('btnQueryOpts')?.setAttribute('aria-expanded', 'false')
  }

  function toggleQueryPop() {
    const pop = $('queryPop')
    if (!pop) return
    const open = pop.classList.contains('hidden')
    pop.classList.toggle('hidden', !open)
    $('btnQueryOpts')?.setAttribute('aria-expanded', open ? 'true' : 'false')
    if (open) {
      $('filePop')?.classList.add('hidden')
      $('morePanel')?.classList.add('hidden')
      $('btnMore')?.setAttribute('aria-expanded', 'false')
    }
  }

  function closeFilePop() {
    $('filePop')?.classList.add('hidden')
  }

  function collectFileChoices() {
    const names = new Set()
    for (const f of state.fileFilter || []) if (f) names.add(f)
    for (const f of state.files || []) if (f?.name) names.add(f.name)
    for (const line of state.rawLines || []) {
      const name = line.file || line.fileName
      if (name) names.add(String(name).split(/[/\\]/).pop())
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  }

  function openFilePop() {
    const pop = $('filePop')
    if (!pop) return
    const names = collectFileChoices()
    const active = new Set(state.fileFilter || [])
    const metaByName = new Map()
    for (const f of state.files || []) {
      if (!f?.name) continue
      const prev = metaByName.get(f.name)
      if (!prev || Number(f.size || 0) > Number(prev.size || 0)) metaByName.set(f.name, f)
    }
    const rows = [
      `<button type="button" class="file-pop__item${!active.size ? ' is-active' : ''}" data-file="">全部文件</button>`,
    ]
    if (!names.length) {
      rows.push('<div class="file-pop__empty">还没有文件列表，可先刷新</div>')
    } else {
      for (const name of names) {
        const meta = metaByName.get(name)
        const bits = []
        if (meta?.size != null) bits.push(formatBytes(meta.size))
        const when = formatFileMtime(meta?.mtime)
        if (when) bits.push(when)
        rows.push(
          `<button type="button" class="file-pop__item${active.has(name) ? ' is-active' : ''}" data-file="${escapeHtml(name)}" title="${escapeHtml(name)}">` +
          `<span>${escapeHtml(name)}</span>` +
          (bits.length ? `<em class="file-pop__meta">${escapeHtml(bits.join(' · '))}</em>` : '') +
          `</button>`
        )
      }
    }
    rows.push('<button type="button" class="file-pop__item file-pop__refresh" data-act="refresh">刷新列表</button>')
    pop.innerHTML = rows.join('')
    pop.querySelectorAll('[data-file]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.file || ''
        state.fileFilter = name ? [name] : []
        closeFilePop()
        renderCrumbs()
        paintFiles()
        updateSelectionBars()
        void runSearch({ forceTail: true })
      })
    })
    pop.querySelector('[data-act="refresh"]')?.addEventListener('click', async () => {
      closeFilePop()
      await runListFiles({ stay: true })
      openFilePop()
    })
    pop.classList.remove('hidden')
  }

  function syncFollowKeywordChip() {
    const btn = $('btnFollowKeyword')
    if (!btn) return
    btn.classList.toggle('is-active', state.followKeepKeyword)
    btn.setAttribute('aria-pressed', state.followKeepKeyword ? 'true' : 'false')
  }

  function runRecentMinutes(mins) {
    const end = Date.now()
    const start = end - Math.max(1, Number(mins) || 5) * 60 * 1000
    const from = toLocalInputValue(start)
    const to = toLocalInputValue(end)
    if ($('timeFrom')) $('timeFrom').value = from
    if ($('timeTo')) $('timeTo').value = to
    state.timeFocus = null
    state.timeWindow = { fromMs: start, toMs: end }
    closeQueryPop()
    void runSearch({ timeFrom: from, timeTo: to })
  }

  function setLevel(level) {
    if (level === 'ALL') {
      state.levels = []
    } else if (!state.levelMulti) {
      state.levels = state.levels.length === 1 && state.levels[0] === level ? [] : [level]
    } else {
      const index = state.levels.indexOf(level)
      if (index >= 0) state.levels.splice(index, 1)
      else state.levels.push(level)
    }
    syncLevelChips()
    paintLines()
  }

  async function copyText(text, okMessage) {
    try {
      if (window.datawisePlugin?.clipboard?.writeText) {
        await window.datawisePlugin.clipboard.writeText(text)
      } else {
        await navigator.clipboard.writeText(text)
      }
      setStatus(okMessage)
    } catch (e) {
      setStatus(e?.message || '复制失败')
    }
  }

  async function bootstrap() {
    const api = window.datawisePlugin
    await api.ready
    const ctx = api.context || (await api.getContext?.()) || {}
    state.connectionId = ctx.connectionId || ctx.connection?.id || ''

    try {
      const info = await api.getHostInfo?.()
      applyHostTheme(info)
      api.onHostInfo?.(applyHostTheme)
      api.onAppearanceChange?.(applyHostAppearance)
      document.addEventListener('datawise-plugin-env', (ev) => {
        applyHostTheme(ev.detail || {})
      })
    } catch (_) {}

    if (!state.connectionId) {
      setBadge('no-connection', 'err')
      setStatus('请从连接菜单打开')
      return
    }

    try {
      const res = await invoke('logs/group', {})
      state.group = res.group
      state.savedProfile = res.profile || null
    } catch (_) {
      try {
        if (api.reopenConnection) await api.reopenConnection(state.connectionId)
        const res = await invoke('logs/group', {})
        state.group = res.group
        state.savedProfile = res.profile || null
      } catch (e2) {
        setBadge('error', 'err')
        setStatus(e2?.message || String(e2))
        return
      }
    }

    if (state.group?.defaultTailLines) $('maxLines').value = state.group.defaultTailLines

    state.hydrating = true
    await loadSession()
    await loadServers()
    await loadScenes()
    state.hydrating = false
    await persistProfile()
    await loadMutes()
    await loadKeywordHistory()
    await loadBookmarks()
    await loadLastCompare()
    await loadWorkspace()
    syncFollowPaceChip()
    syncFollowKeywordChip()
    syncJoinModes()
    syncQueryOptsChip()
    await applyLegacyJumpIds()
    syncSessionChrome()
    renderServers()
    syncFollowButton()

    if (!sessionReady()) {
      setBadge('setup', 'busy')
      setStatus('先打开配置，填好目录和登录')
      openSessionDialog()
      return
    }

    try {
      await pushSessionConfig()
      syncSessionChrome()
    } catch (e) {
      setBadge('error', 'err')
      setStatus(e?.message || String(e))
      openSessionDialog()
      return
    }

    if (state.session.primaryHost) {
      const port = state.session.defaultPort || 22
      if (!state.servers.some((s) => s.host === state.session.primaryHost && Number(s.port) === port)) {
        state.servers.unshift(normalizeServer({
          host: state.session.primaryHost,
          port,
          label: state.session.primaryHost,
          enabled: true,
        }, port))
        await saveServers()
        renderServers()
      }
    }

    if (!state.servers.length) {
      setBadge('ready', 'ok')
      setStatus('配置已就绪，再添加实例即可查询')
      return
    }
    setBadge('ready', 'ok')
    setStatus(`已加载 ${state.servers.length} 台实例`)
    await runSearch({ forceTail: true })
  }

  function readHostScheme(info) {
    if (!info) return null
    const theme = info.theme
    if (theme?.appearance === 'light' || theme?.appearance === 'dark') return theme.appearance
    const appearance = info.appearance
    if (typeof appearance === 'string') return appearance === 'light' ? 'light' : 'dark'
    if (appearance?.colorScheme === 'light' || appearance?.colorScheme === 'dark') return appearance.colorScheme
    return null
  }

  function applyHostAppearance(next) {
    applyHostTheme({ appearance: next, theme: typeof next === 'object' ? next : undefined })
  }

  function applyHostTheme(info) {
    if (!info) return
    const root = document.documentElement
    const scheme = readHostScheme(info) || (root.getAttribute('data-theme') === 'light' ? 'light' : 'dark')
    root.setAttribute('data-theme', scheme)
    root.setAttribute('data-dw-theme', scheme)
    root.style.colorScheme = scheme

    const tokens = info.theme?.tokens
    if (tokens && typeof tokens === 'object') {
      Object.keys(tokens).forEach((key) => {
        if (typeof tokens[key] === 'string' && tokens[key]) root.style.setProperty(key, tokens[key])
      })
    }

    const colors = info.appearance?.colors || {}
    if (colors.background) root.style.setProperty('--color-background', colors.background)
    if (colors.foreground) root.style.setProperty('--color-foreground', colors.foreground)
    if (colors.primary) root.style.setProperty('--color-primary', colors.primary)
    if (colors.border) root.style.setProperty('--color-border', colors.border)
  }

  function wire() {
    $('btnAddServer').addEventListener('click', () => openServerDialog(null))
    $('btnCancelServer').addEventListener('click', () => $('serverDialog').close())
    $('btnSaveServer').addEventListener('click', () => { void commitServer() })
    $('btnTestServer').addEventListener('click', () => { void testServerFromDialog() })
    $('srvJumpBtn').addEventListener('click', (e) => {
      e.stopPropagation()
      toggleServerJumpMenu()
    })
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#srvJumpPicker')) closeServerJumpMenu()
      if (!e.target.closest('#scenePicker')) closeSceneMenu()
    })
    $('sceneBtn')?.addEventListener('click', (e) => {
      e.stopPropagation()
      toggleSceneMenu()
    })
    $('btnSaveScene')?.addEventListener('click', () => { void saveCurrentScene() })
    $('btnDelScene')?.addEventListener('click', () => { void deleteActiveScene() })
    $('btnTimeRange')?.addEventListener('click', () => {
      closeQueryPop()
      void runTimeRangeSearch()
    })
    for (const id of ['timeFrom', 'timeTo']) {
      $(id)?.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        closeQueryPop()
        void runTimeRangeSearch()
      })
    }
    $('btnUniqueOnly')?.addEventListener('click', (e) => {
      e.stopPropagation()
      state.uniqueOnly = !state.uniqueOnly
      const btn = $('btnUniqueOnly')
      btn.classList.toggle('is-active', state.uniqueOnly)
      btn.setAttribute('aria-pressed', state.uniqueOnly ? 'true' : 'false')
      refreshLocalFilter()
    })
    $('btnOpenSession').addEventListener('click', () => openSessionDialog())
    wireFoldToggles()
    $('btnCancelSearch')?.addEventListener('click', () => cancelSearch())
    $('btnReconnectBad')?.addEventListener('click', () => { void reconnectBadHosts() })
    $('btnCancelSession').addEventListener('click', () => $('sessionDialog').close())
    $('btnApplySession').addEventListener('click', () => { void applySessionFromDialog() })
    $('btnTestSession').addEventListener('click', () => { void testSessionFromDialog() })
    $('btnAddJump').addEventListener('click', () => openJumpDialog(null))
    $('btnCancelJump').addEventListener('click', () => $('jumpDialog').close())
    $('btnSaveJump').addEventListener('click', () => commitJump())
    $('btnTogglePassword').addEventListener('click', () => {
      const input = $('sessPassword')
      const show = input.type === 'password'
      input.type = show ? 'text' : 'password'
      $('btnTogglePassword').textContent = show ? '隐藏' : '显示'
      $('btnTogglePassword').title = show ? '隐藏密码' : '显示密码'
    })
    for (const id of ['sessService', 'sessLogDir', 'sessLogGlob', 'sessUser', 'sessPassword', 'sessPrivateKey']) {
      $(id).addEventListener('input', () => refreshSessionHint())
    }
    for (const id of ['jmpHost', 'jmpPort', 'jmpUser', 'jmpPassword', 'jmpLabel']) {
      $(id).addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        commitJump()
      })
    }
    for (const id of ['sessService', 'sessLogDir', 'sessLogGlob', 'sessUser', 'sessPassword']) {
      $(id).addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        void applySessionFromDialog()
      })
    }
    $('srvHost').addEventListener('input', syncServerPreview)
    $('srvLabel').addEventListener('input', syncServerPreview)
    for (const id of ['srvHost', 'srvPort', 'srvLabel']) {
      $(id).addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        void commitServer()
      })
    }
    $('btnHostMulti').addEventListener('click', () => {
      state.hostMulti = !state.hostMulti
      renderServers()
    })
    $('btnAllHosts').addEventListener('click', () => {
      state.hostFilter = []
      renderServers()
      paintLines()
      paintFiles()
      updateSelectionBars()
    })
    $('btnTailSelected').addEventListener('click', () => openSelectedFiles())
    $('btnClearFiles').addEventListener('click', () => {
      state.fileFilter = []
      paintFiles()
      paintLines()
      updateSelectionBars()
    })
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        showTab(tab.dataset.tab)
        if (tab.dataset.tab === 'files' && !state.files.length && state.servers.length) runListFiles()
      })
    })
    $('matchModes').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip')
      if (!chip) return
      setMatchMode(chip.dataset.mode)
    })
    $('joinModes')?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-join]')
      if (!chip) return
      state.keywordJoin = chip.dataset.join === 'or' ? 'or' : 'and'
      syncJoinModes()
      refreshLocalFilter()
      void saveWorkspace()
    })
    $('btnOlder')?.addEventListener('click', () => { void loadOlder() })
    $('btnPeerClose')?.addEventListener('click', () => closePeerPop())
    $('btnPeerSearch')?.addEventListener('click', () => searchPeerSignature())
    $('peerPop')?.addEventListener('click', (e) => e.stopPropagation())
    $('btnLevelMulti').addEventListener('click', () => {
      state.levelMulti = !state.levelMulti
      if (!state.levelMulti && state.levels.length > 1) state.levels = state.levels.slice(-1)
      syncLevelChips()
      paintLines()
    })
    $('levelChips').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip[data-level]')
      if (!chip) return
      setLevel(chip.dataset.level)
      refreshLocalFilter()
    })
    $('levelExtra')?.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip[data-level]')
      if (!chip) return
      setLevel(chip.dataset.level)
      refreshLocalFilter()
    })
    $('btnQueryOpts')?.addEventListener('click', (e) => {
      e.stopPropagation()
      toggleQueryPop()
    })
    $('queryPop')?.addEventListener('click', (e) => e.stopPropagation())
    $('queryPop')?.querySelector('.time-presets')?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-mins], [data-span]')
      if (!chip) return
      document.querySelectorAll('.time-presets .chip').forEach((el) => el.classList.toggle('is-active', el === chip))
      if (chip.dataset.span === 'today') runTodayRange()
      else runRecentMinutes(Number(chip.dataset.mins))
    })
    $('btnQueryReset')?.addEventListener('click', () => resetQueryPop())
    $('btnFilePick')?.addEventListener('click', (e) => {
      e.stopPropagation()
      const pop = $('filePop')
      if (pop && !pop.classList.contains('hidden')) closeFilePop()
      else openFilePop()
    })
    $('filePop')?.addEventListener('click', (e) => e.stopPropagation())
    $('ignoreCase').addEventListener('change', () => {
      syncQueryOptsChip()
      refreshLocalFilter()
    })
    $('exclude').addEventListener('input', () => {
      syncQueryOptsChip()
      refreshLocalFilter()
    })
    $('remoteGrep')?.addEventListener('change', syncQueryOptsChip)
    for (const id of ['timeFrom', 'timeTo']) {
      $(id)?.addEventListener('change', () => {
        document.querySelectorAll('.time-presets .chip').forEach((el) => el.classList.remove('is-active'))
        syncQueryOptsChip()
      })
    }
    $('exclude').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        state.fileFilter = []
        renderCrumbs()
        runSearch()
      }
    })

    $('btnFollowKeyword')?.addEventListener('click', (e) => {
      e.stopPropagation()
      state.followKeepKeyword = !state.followKeepKeyword
      syncFollowKeywordChip()
      renderFilterBar()
      setStatus(state.followKeepKeyword ? '跟随时也会带上关键字' : '跟随拉取全量尾部，关键字仅本地筛选')
    })
    $('btnSearch').addEventListener('click', () => {
      state.fileFilter = []
      renderCrumbs()
      runSearch()
    })
    $('btnTail').addEventListener('click', () => runSearch({ forceTail: true }))
    $('btnFollow').addEventListener('click', () => toggleFollow())
    $('btnJumpBottom').addEventListener('click', () => {
      state.stickBottom = true
      state.unreadCount = 0
      const pane = $('logPane')
      state.painting = true
      pane.scrollTop = pane.scrollHeight
      state.painting = false
      updateJumpBottom()
      if (state.following) {
        paintLines({ markNew: true, append: true, lite: true })
        setStatus('跟随中')
      }
    })
    $('logPane').addEventListener('scroll', () => {
      if (state.painting || Date.now() < state.ignoreScrollUntil) return
      const pane = $('logPane')
      const nearBottom = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 48
      const was = state.stickBottom
      if (nearBottom === was) {
        if (state.following) updateJumpBottom()
        return
      }
      state.stickBottom = nearBottom
      if (nearBottom) state.unreadCount = 0
      if (!state.following) return
      updateJumpBottom()
      if (was && !nearBottom) setStatus('跟随已暂停 · 底部有新日志会计数')
      else if (!was && nearBottom) setStatus('跟随中')
    })
    $('logPane').addEventListener('wheel', () => {
      if (!state.following || state.painting) return
      const pane = $('logPane')
      requestAnimationFrame(() => {
        if (state.painting || Date.now() < state.ignoreScrollUntil) return
        const nearBottom = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 48
        if (nearBottom || state.stickBottom === nearBottom) return
        state.stickBottom = nearBottom
        if (nearBottom) state.unreadCount = 0
        updateJumpBottom()
        if (!nearBottom) setStatus('跟随已暂停 · 底部有新日志会计数')
      })
    }, { passive: true })
    const closeMore = () => {
      $('morePanel')?.classList.add('hidden')
      $('btnMore')?.setAttribute('aria-expanded', 'false')
    }
    $('btnProbeAll')?.addEventListener('click', () => {
      stopFollow()
      closeMore()
      void runProbe()
    })
    $('btnListFiles').addEventListener('click', () => {
      stopFollow()
      closeMore()
      runListFiles()
    })
    $('keyword').addEventListener('input', () => {
      syncKeywordClear()
      syncRegexHint()
      renderKeywordHistory($('keyword').value)
      refreshLocalFilter()
    })
    $('keyword').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        $('kwHistory')?.classList.add('hidden')
        state.fileFilter = []
        renderCrumbs()
        runSearch()
      }
      if (e.key === 'Escape') {
        $('keyword').value = ''
        syncKeywordClear()
        $('kwHistory')?.classList.add('hidden')
        refreshLocalFilter()
      }
    })
    $('btnClearKeyword').addEventListener('click', () => {
      $('keyword').value = ''
      syncKeywordClear()
      $('kwHistory')?.classList.add('hidden')
      refreshLocalFilter()
      $('keyword').focus()
    })
    $('btnMore')?.addEventListener('click', (e) => {
      e.stopPropagation()
      $('compareBar')?.classList.add('hidden')
      const panel = $('morePanel')
      if (!panel) return
      const open = panel.classList.toggle('hidden') === false
      $('btnMore').setAttribute('aria-expanded', open ? 'true' : 'false')
    })
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#moreMenu')) closeMore()
      if (!e.target.closest('.query-launch')) closeQueryPop()
      if (!e.target.closest('#filePop') && !e.target.closest('#btnFilePick')) closeFilePop()
      if (!e.target.closest('#muteImportPop') && !e.target.closest('#btnImportMutes')) closeMuteImport()
      if (!e.target.closest('#peerPop') && !e.target.closest('[data-act="peers"]')) closePeerPop()
      if (!e.target.closest('#compareBar') && !e.target.closest('#btnCompare')) {
        if (!$('compareBar')?.classList.contains('hidden') && !state.compare) {
          $('compareBar')?.classList.add('hidden')
        }
      }
    })
    $('btnContext').addEventListener('click', (e) => {
      e.stopPropagation()
      cycleContext()
    })
    $('btnWrap').addEventListener('click', (e) => {
      e.stopPropagation()
      state.wrap = !state.wrap
      $('btnWrap').classList.toggle('is-active', state.wrap)
      $('btnWrap').setAttribute('aria-pressed', state.wrap ? 'true' : 'false')
      $('logStream')?.classList.toggle('no-wrap', !state.wrap)
    })
    $('btnClearFilters').addEventListener('click', () => {
      clearAllFilters()
      closeMore()
    })
    $('btnPrevError').addEventListener('click', () => {
      jumpError(-1)
      closeMore()
    })
    $('btnNextError').addEventListener('click', () => {
      jumpError(1)
      closeMore()
    })
    $('btnCopyVisible').addEventListener('click', () => {
      const events = viewEvents()
      const picked = state.selectedKeys.size
        ? events.filter((ev) => state.selectedKeys.has(lineKey(ev.first || ev.line)))
        : events
      const text = picked.map(formatEventLine).join('\n')
      copyText(text, `已复制 ${picked.length} 条`)
    })
    $('btnExport')?.addEventListener('click', () => {
      copyText(buildIncidentNote(), '已复制说明')
      closeMore()
    })
    $('btnDownload')?.addEventListener('click', () => {
      downloadVisibleLogs()
      closeMore()
    })
    $('btnExportMutes')?.addEventListener('click', () => {
      void exportMutes()
      closeMore()
    })
    $('btnImportMutes')?.addEventListener('click', (e) => {
      e.stopPropagation()
      closeMore()
      openMuteImport()
    })
    $('muteImportPop')?.addEventListener('click', (e) => e.stopPropagation())
    $('btnMuteImportClose')?.addEventListener('click', () => closeMuteImport())
    $('btnMuteImportApply')?.addEventListener('click', () => { void importMutesFromText() })
    $('btnFollowPace')?.addEventListener('click', (e) => {
      e.stopPropagation()
      cycleFollowPace()
    })
    $('btnCompare')?.addEventListener('click', (e) => {
      e.stopPropagation()
      closeMore()
      openCompare()
    })
    $('compareBar')?.addEventListener('click', (e) => e.stopPropagation())
    $('btnCompareApply')?.addEventListener('click', () => applyCompare())
    $('btnCompareClose')?.addEventListener('click', () => {
      if (state.compare) closeCompare()
      else $('compareBar')?.classList.add('hidden')
    })
    $('btnAddBookmark')?.addEventListener('click', () => addBookmarkHere())
    $('btnTraceErrors')?.addEventListener('click', () => {
      state.traceErrorsOnly = !state.traceErrorsOnly
      renderTrace()
    })
    $('btnCopyTrace')?.addEventListener('click', () => {
      if (!state.traceId) return
      const events = collectTraceEvents(state.traceId)
      const text = [`链路 ${state.traceId}`, ...events.map((ev) => {
        const first = ev.first || ev.line
        return `${formatClock(first)} [${first.hostLabel || first.host}] ${ev.level || ''} ${first.text}`
      })].join('\n')
      copyText(text, `已复制链路 ${events.length} 条`)
    })
    $('btnCloseTrace')?.addEventListener('click', () => closeTrace())
    $('keyword').addEventListener('blur', () => {
      setTimeout(() => $('kwHistory')?.classList.add('hidden'), 150)
    })
    $('btnCopyPath').addEventListener('click', () => {
      const dirs = activeLogDirs()
      const files = activeLogFiles()
      let text = dirs[0] || state.group?.logDir || ''
      if (dirs.length === 1 && files.length === 1) text = `${dirs[0]}/${files[0]}`
      else if (dirs.length > 1) text = dirs.join('\n')
      copyText(text, '已复制当前目录')
    })
    document.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA'
      if (e.key === '/' && document.activeElement !== $('keyword') && !e.metaKey && !e.ctrlKey) {
        if (typing) return
        e.preventDefault()
        $('keyword').focus()
        return
      }
      if (e.key === 'F8' && !typing) {
        e.preventDefault()
        jumpError(e.shiftKey ? -1 : 1)
        return
      }
      if (e.key === 'Escape' && state.traceId && !typing) {
        closeTrace()
        return
      }
      if (!typing && (e.key === 'ArrowDown' || e.key === 'j')) {
        e.preventDefault()
        moveCursor(1)
        return
      }
      if (!typing && (e.key === 'ArrowUp' || e.key === 'k')) {
        e.preventDefault()
        moveCursor(-1)
      }
    })
  }

  wire()
  bootstrap().catch((e) => {
    setBadge('error', 'err')
    setStatus(e?.message || String(e))
  })
})()
