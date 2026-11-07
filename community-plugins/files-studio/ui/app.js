/* Files Studio workbench — K8s-style dense ops UI */
;(function () {
  const state = {
    connectionId: null,
    mounts: [],
    activeMountId: null,
    prefix: '',
    listMode: '',
    listDebug: null,
    items: [],
    selectedPath: null,
    checked: new Set(),
    tab: 'browser',
    transferFilter: 'all',
    ready: false,
    pendingConfirm: null,
    dialogMode: null,
  }

  const $ = (id) => document.getElementById(id)
  const DRAG_MIME = 'application/x-datawise-files-studio'
  /** Keep under JSON-RPC ~8MB ceiling after base64 (~4/3). */
  const MAX_RPC_BYTES = 4 * 1024 * 1024
  const MAX_DRAG_BYTES = MAX_RPC_BYTES
  /** @type {Map<string, {file: File, url: string, type: string, name: string}>} */
  const dragCache = new Map()

  function toast(msg, isErr) {
    const el = $('toast')
    el.textContent = msg
    el.classList.toggle('is-err', !!isErr)
    el.classList.add('is-show')
    clearTimeout(toast._t)
    toast._t = setTimeout(() => el.classList.remove('is-show'), 4200)
  }

  function waitForHostApi() {
    return new Promise((resolve) => {
      const check = () => {
        if (window.datawisePlugin && typeof window.datawisePlugin.invoke === 'function') {
          resolve(window.datawisePlugin)
          return true
        }
        return false
      }
      if (check()) return
      window.addEventListener('message', (ev) => {
        if (ev.data && ev.data.type === 'datawise-plugin-env') check() && resolve(window.datawisePlugin)
      })
      const iv = setInterval(() => {
        if (check()) {
          clearInterval(iv)
          resolve(window.datawisePlugin)
        }
      }, 200)
    })
  }

  async function invoke(method, params = {}) {
    const api = window.datawisePlugin
    if (!api) throw new Error('Host bridge not ready')
    const payload = { ...params }
    if (!payload.mountId && !payload.connectionId && state.activeMountId) {
      payload.mountId = state.activeMountId
    }
    if (!payload.connectionId && state.connectionId) {
      payload.connectionId = state.connectionId
    }
    return api.invoke(method, payload)
  }

  function formatBytes(n) {
    if (n == null || n === 0) return '—'
    const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
    let v = Number(n)
    let i = 0
    while (v >= 1024 && i < u.length - 1) {
      v /= 1024
      i++
    }
    return i === 0 ? `${n} ${u[i]}` : `${v.toFixed(1)} ${u[i]}`
  }

  function formatRate(bps) {
    if (!bps) return '—'
    return `${formatBytes(bps)}/s`
  }

  function formatTime(raw) {
    if (!raw) return '—'
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) {
      return String(raw).replace('T', ' ').replace(/\.\d+Z$/, '').replace(/Z$/, '')
    }
    const now = Date.now()
    const diff = now - d.getTime()
    if (diff >= 0 && diff < 60 * 1000) return '刚刚'
    if (diff >= 0 && diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff >= 0 && diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    if (y === new Date().getFullYear()) return `${m}-${day} ${hh}:${mm}`
    return `${y}-${m}-${day} ${hh}:${mm}`
  }

  function fileKind(name) {
    const ext = String(name || '').split('.').pop()?.toLowerCase() || ''
    if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return { glyph: 'glyph--file glyph--sheet', tag: ext }
    if (['doc', 'docx', 'txt', 'md', 'pdf', 'rtf'].includes(ext)) return { glyph: 'glyph--file glyph--doc', tag: ext }
    if (['zip', 'rar', '7z', 'tar', 'gz', 'tgz'].includes(ext)) return { glyph: 'glyph--file glyph--archive', tag: ext }
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return { glyph: 'glyph--file glyph--image', tag: ext }
    if (ext && ext.length <= 5 && name.includes('.')) return { glyph: 'glyph--file', tag: ext }
    return { glyph: 'glyph--file', tag: '' }
  }

  /** Shared location root: chrome · crumb · copy path all use this. */
  function mountLocation(m) {
    if (!m) return '根目录'
    return m.scope || m.endpoint || m.scheme || '根目录'
  }

  /** S3 with no configured bucket, still on the bucket list page. */
  function isS3AccountRoot() {
    const m = activeMount()
    if (!m || m.scheme !== 's3') return false
    const loc = mountLocation(m).replace(/^s3:\/\//i, '')
    if (loc.includes('/')) return false
    return !(state.prefix || '').replace(/^\/+|\/+$/g, '')
  }

  function assertNotAccountRoot(action) {
    if (!isS3AccountRoot()) return true
    toast(`请先进入某个存储桶，再${action}`, true)
    return false
  }

  function currentPathLabel() {
    const root = mountLocation(activeMount())
    const rest = state.prefix.replace(/^\/+|\/+$/g, '')
    return rest ? `${root}/${rest}` : root
  }

  function activeMount() {
    return state.mounts.find((m) => m.id === state.activeMountId) || null
  }

  function setBrowserLoading(on) {
    $('browserDropZone')?.classList.toggle('is-loading', !!on)
  }

  function updateChrome() {
    const m = activeMount()
    if (!m) {
      $('endpointLabel').textContent = state.connectionId ? '正在连接…' : '请从左侧资源树打开一个连接'
      $('healthBadge').textContent = 'idle'
      $('healthBadge').className = 'badge'
      return
    }
    const loc = mountLocation(m)
    $('endpointLabel').textContent = m.name ? `${m.name} · ${loc}` : loc
    $('scopeLabel').textContent = loc
    $('healthBadge').textContent = m.scheme || 'ok'
    $('healthBadge').className = 'badge is-ok'
  }

  function renderCrumbs() {
    const el = $('crumbs')
    el.innerHTML = ''
    const parts = state.prefix.split('/').filter(Boolean)
    const root = document.createElement('button')
    root.type = 'button'
    root.className = 'crumb' + (parts.length ? '' : ' is-current')
    root.textContent = mountLocation(activeMount())
    root.title = root.textContent
    root.addEventListener('click', () => setPrefix(''))
    el.appendChild(root)
    const up = $('btnUp')
    if (up) up.disabled = parts.length === 0
    let acc = ''
    parts.forEach((p, idx) => {
      const sep = document.createElement('span')
      sep.className = 'crumb-sep'
      sep.textContent = '/'
      el.appendChild(sep)
      acc += (acc ? '/' : '') + p
      const prefix = acc + '/'
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'crumb'
      b.textContent = p
      b.title = prefix
      if (idx === parts.length - 1) b.classList.add('is-current')
      b.addEventListener('click', () => setPrefix(prefix))
      el.appendChild(b)
    })
  }

  function updateSelectionChrome() {
    const n = state.checked.size
    $('btnDownload').disabled = n === 0
    $('btnDelete').disabled = n === 0
    $('btnCopyTransfer').disabled = n === 0
    $('btnDownload').textContent = n ? `下载 (${n})` : '下载'
    $('btnDelete').textContent = n ? `删除 (${n})` : '删除'
    const bar = $('selectionBar')
    const hint = $('selectionHint')
    if (bar) bar.classList.toggle('hidden', n === 0)
    if (hint) hint.textContent = n ? `已选 ${n} 项` : ''
    const all = $('checkAll')
    if (all) {
      const visible = state.items.filter((it) => {
        const filter = ($('filterInput').value || '').toLowerCase()
        return !filter || (it.name || '').toLowerCase().includes(filter)
      })
      all.checked = visible.length > 0 && visible.every((i) => state.checked.has(i.path))
      all.indeterminate = !all.checked && visible.some((i) => state.checked.has(i.path))
    }
  }

  function renderPolicyChips(policy) {
    const el = $('guardPolicy')
    if (!el) return
    const g = policy?.guard || policy || {}
    const chips = [
      { on: !!g.readonly, warn: false, label: g.readonly ? '只读' : '可写' },
      { on: !g.denyDelete, warn: !!g.denyDelete, label: g.denyDelete ? '禁止删除' : '允许删除' },
      { on: !!g.requireConfirmDelete, warn: !!g.requireConfirmDelete, label: g.requireConfirmDelete ? '删除需确认' : '删除免确认' },
      { on: !!g.allowedPrefix, warn: false, label: g.allowedPrefix ? `前缀 ${g.allowedPrefix}` : '无前缀限制' },
    ]
    el.innerHTML = ''
    for (const c of chips) {
      const span = document.createElement('span')
      span.className = 'policy-chip' + (c.warn ? ' is-warn' : c.on ? ' is-on' : '')
      span.textContent = c.label
      el.appendChild(span)
    }
  }

  function setGuardBadge(count) {
    const badge = $('guardTabBadge')
    if (!badge) return
    badge.classList.toggle('hidden', !count)
    badge.textContent = String(count || 0)
    const pc = $('pendingCount')
    if (pc) pc.textContent = count ? `(${count})` : ''
  }

  function updateFilterChrome() {
    const has = !!($('filterInput').value || '').trim()
    $('btnClearFilter')?.classList.toggle('hidden', !has)
  }

  function renderBrowser() {
    const body = $('browserBody')
    const filter = ($('filterInput').value || '').toLowerCase()
    const rows = state.items.filter((it) => !filter || (it.name || '').toLowerCase().includes(filter))
    body.innerHTML = ''
    updateFilterChrome()
    $('browserEmpty').classList.toggle('hidden', rows.length > 0)
    if (!rows.length) {
      const title = $('browserEmptyTitle')
      const detail = $('browserEmptyDetail')
      const cta = $('btnEmptyUpload')
      if (filter) {
        if (title) title.textContent = '没有匹配项'
        if (detail) detail.textContent = `没有名称包含「${$('filterInput').value}」的内容。`
        cta?.classList.add('hidden')
      } else {
        const dbg = state.listDebug
        if (title) title.textContent = '这里是空的'
        if (detail) {
          detail.textContent = dbg && dbg.detail
            ? `${dbg.detail}。这一层没有对象。`
            : '可以上传文件，或把文件拖到这里。'
        }
        cta?.classList.remove('hidden')
      }
    }
    for (const it of rows) {
      const tr = document.createElement('tr')
      if (state.selectedPath === it.path) tr.classList.add('is-selected')
      if (state.checked.has(it.path)) tr.classList.add('is-checked')
      const isDir = it.type === 'DIR'
      const kind = isDir ? null : fileKind(it.name)
      const glyphClass = isDir ? 'glyph glyph--dir' : `glyph ${kind.glyph}`
      const tagHtml = !isDir && kind.tag ? `<span class="ext-tag">${kind.tag}</span>` : ''
      tr.innerHTML = `
        <td class="col-check"><input type="checkbox" data-path="${escapeAttr(it.path)}" ${state.checked.has(it.path) ? 'checked' : ''} /></td>
        <td><div class="name-cell"><span class="${glyphClass}"></span><span class="name-text"></span>${tagHtml}${isDir ? '<span class="row-hint">进入</span>' : '<span class="row-hint">详情</span>'}</div></td>
        <td class="col-size">${isDir ? '—' : formatBytes(it.size)}</td>
        <td class="col-time" title="${escapeAttr(it.modified || '')}">${formatTime(it.modified)}</td>`
      tr.querySelector('.name-text').textContent = it.name
      tr.addEventListener('click', (e) => {
        if (e.target.closest('input[type=checkbox]')) return
        if (isDir) {
          setPrefix(it.path.endsWith('/') ? it.path : it.path + '/')
        } else {
          state.selectedPath = it.path
          renderBrowser()
          showInspector(it)
        }
      })
      if (!isDir) wireFileDrag(tr, it)
      const cb = tr.querySelector('input[type=checkbox]')
      cb.addEventListener('change', () => {
        if (cb.checked) state.checked.add(it.path)
        else state.checked.delete(it.path)
        tr.classList.toggle('is-checked', cb.checked)
        updateSelectionChrome()
      })
      body.appendChild(tr)
    }
    const totalSize = rows.reduce((s, i) => s + (i.type === 'FILE' ? Number(i.size || 0) : 0), 0)
    const shown = filter && rows.length !== state.items.length ? `${rows.length} / ${state.items.length}` : String(rows.length)
    $('browserStatus').textContent = totalSize ? `${shown} 项 · ${formatBytes(totalSize)}` : `${shown} 项`
    updateSelectionChrome()
    if (!state.selectedPath) closeInspector()
  }

  function closeInspector() {
    const el = $('inspector')
    el.classList.remove('is-open')
    el.innerHTML = ''
  }

  function showInspector(it) {
    const el = $('inspector')
    el.classList.add('is-open')
    el.innerHTML = `
      <div class="inspector__title"></div>
      <div class="inspector__sub">${it.type === 'DIR' ? '文件夹' : '文件'}</div>
      <dl>
        <dt>路径</dt><dd></dd>
        <dt>大小</dt><dd></dd>
        <dt>修改时间</dt><dd></dd>
        <dt>ETag</dt><dd></dd>
        <dt>内容类型</dt><dd></dd>
      </dl>
      <div class="inspector__actions">
        <button type="button" class="dw-btn dw-btn--primary" id="btnInspectorDownload">下载</button>
        <button type="button" class="dw-btn" id="btnInspectorClose">关闭</button>
      </div>`
    el.querySelector('.inspector__title').textContent = it.name
    const dds = el.querySelectorAll('dd')
    const vals = [
      it.path,
      it.type === 'DIR' ? '—' : formatBytes(it.size),
      formatTime(it.modified),
      it.etag || '—',
      it.contentType || '—',
    ]
    dds.forEach((dd, i) => { dd.textContent = vals[i] })
    $('btnInspectorClose').addEventListener('click', () => {
      state.selectedPath = null
      closeInspector()
      renderBrowser()
    })
    $('btnInspectorDownload').addEventListener('click', () => {
      state.checked = new Set([it.path])
      updateSelectionChrome()
      $('btnDownload').click()
    })
  }

  function escapeAttr(s) {
    return String(s).replace(/"/g, '&quot;')
  }

  function clearDragCache() {
    for (const entry of dragCache.values()) {
      if (entry.url) URL.revokeObjectURL(entry.url)
    }
    dragCache.clear()
  }

  function base64ToUint8(b64) {
    const binary = atob(b64)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    return out
  }

  async function ensureDragPayload(it) {
    if (!it || it.type === 'DIR') return null
    const cached = dragCache.get(it.path)
    if (cached) return cached
    const size = Number(it.size || 0)
    if (size > MAX_DRAG_BYTES) {
      throw new Error(`${it.name} 超过 ${formatBytes(MAX_DRAG_BYTES)}，请用「下载」按钮`)
    }
    const res = await invoke('files/read', {
      mountId: state.activeMountId,
      path: it.path,
      maxBytes: MAX_DRAG_BYTES,
    })
    const type = res.contentType || 'application/octet-stream'
    const bytes = base64ToUint8(res.contentBase64)
    const blob = new Blob([bytes], { type })
    const file = new File([blob], it.name || 'download', { type })
    const url = URL.createObjectURL(blob)
    const entry = { file, url, type, name: it.name || 'download' }
    dragCache.set(it.path, entry)
    while (dragCache.size > 8) {
      const oldest = dragCache.keys().next().value
      const old = dragCache.get(oldest)
      if (old?.url) URL.revokeObjectURL(old.url)
      dragCache.delete(oldest)
    }
    return entry
  }

  function dragTargetsFor(it) {
    if (state.checked.has(it.path) && state.checked.size > 1) {
      return checkedItems().filter((row) => row.type === 'FILE')
    }
    return [it]
  }

  function isInternalDrag(dt) {
    if (!dt || !dt.types) return false
    return [...dt.types].includes(DRAG_MIME)
  }

  function wireFileDrag(tr, it) {
    tr.draggable = true
    tr.classList.add('is-draggable')
    tr.title = (tr.title ? `${tr.title} · ` : '') + '拖到桌面或文件夹即可下载'
    tr.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || e.target.closest('input[type=checkbox]')) return
      ensureDragPayload(it).catch(() => {})
    })
    tr.addEventListener('dragstart', (e) => {
      if (e.target.closest('input[type=checkbox]')) {
        e.preventDefault()
        return
      }
      const targets = dragTargetsFor(it)
      if (!targets.length) {
        e.preventDefault()
        return
      }
      const ready = targets.map((row) => dragCache.get(row.path)).filter(Boolean)
      if (ready.length !== targets.length) {
        e.preventDefault()
        toast(targets.length > 1 ? '正在准备多个文件…' : `正在准备 ${it.name}…`)
        Promise.all(targets.map((row) => ensureDragPayload(row)))
          .then(() => toast('准备好了，再拖一次到桌面或文件夹'))
          .catch((err) => toast(err.message || String(err), true))
        return
      }
      e.dataTransfer.effectAllowed = 'copy'
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(targets.map((row) => row.path)))
      e.dataTransfer.setData('text/plain', ready.map((r) => r.name).join('\n'))
      try {
        for (const entry of ready) e.dataTransfer.items.add(entry.file)
      } catch (_) {
        /* some hosts reject DataTransferItemList.add */
      }
      if (ready.length === 1) {
        e.dataTransfer.setData(
          'DownloadURL',
          `${ready[0].type}:${ready[0].name}:${ready[0].url}`,
        )
      }
      tr.classList.add('is-dragging')
    })
    tr.addEventListener('dragend', () => tr.classList.remove('is-dragging'))
  }

  async function selectMount(id) {
    state.activeMountId = id
    state.checked.clear()
    state.selectedPath = null
    clearDragCache()
    const m = activeMount()
    state.prefix = m && m.defaultPrefix ? (m.defaultPrefix.endsWith('/') ? m.defaultPrefix : m.defaultPrefix + '/') : ''
    updateChrome()
    renderCrumbs()
    await refreshBrowser()
    await refreshGuard()
  }

  async function setPrefix(prefix) {
    state.prefix = prefix
    state.checked.clear()
    state.selectedPath = null
    clearDragCache()
    closeInspector()
    renderCrumbs()
    await refreshBrowser()
  }

  async function ensureConnected() {
    if (!state.connectionId) return
    try {
      await invoke('connection/connect', {
        connection: { id: state.connectionId },
      })
    } catch (_) {
      /* host may already have connected; mounts list is source of truth */
    }
  }

  async function refreshMounts() {
    const res = await invoke('files/mounts', {})
    state.mounts = res.mounts || []
    // Host navigator owns connection switching; this workbench follows connectionId.
    if (state.connectionId && state.mounts.find((m) => m.id === state.connectionId)) {
      state.activeMountId = state.connectionId
    } else if (!state.activeMountId || !state.mounts.find((m) => m.id === state.activeMountId)) {
      state.activeMountId = state.mounts[0]?.id || null
    }
    fillTransferMountSelects()
    updateChrome()
    if (state.activeMountId) await selectMount(state.activeMountId)
  }

  async function refreshBrowser() {
    if (!state.activeMountId) return
    setBrowserLoading(true)
    try {
      const res = await invoke('files/list', { mountId: state.activeMountId, prefix: state.prefix })
      state.items = res.items || []
      state.listMode = res.listMode || ''
      state.listDebug = res.debug || null
      state.prefix = res.prefix != null ? res.prefix : state.prefix
      renderCrumbs()
      renderBrowser()
      $('healthBadge').className = 'badge is-ok'
      $('healthBadge').textContent = '就绪'
    } catch (e) {
      state.items = []
      state.listDebug = null
      renderBrowser()
      $('healthBadge').className = 'badge is-err'
      $('healthBadge').textContent = '错误'
      toast(e.message || String(e), true)
    } finally {
      setBrowserLoading(false)
    }
  }

  async function uploadFiles(files) {
    const list = [...(files || [])]
    if (!list.length) return
    if (!assertNotAccountRoot('上传')) return
    const oversized = list.filter((f) => Number(f.size || 0) > MAX_RPC_BYTES)
    const small = list.filter((f) => Number(f.size || 0) <= MAX_RPC_BYTES)
    if (oversized.length) {
      toast(
        `${oversized[0].name} 超过 ${formatBytes(MAX_RPC_BYTES)}，请在传输里选择本地路径上传`,
        true,
      )
      openTransferDrawer({
        kind: 'upload',
        destMountId: state.activeMountId,
        destPath: state.prefix || '',
        sourcePath: '',
      })
    }
    if (!small.length) return
    setBrowserLoading(true)
    let ok = 0
    for (const file of small) {
      try {
        const buf = await file.arrayBuffer()
        const b64 = arrayBufferToBase64(buf)
        const path = (state.prefix || '') + file.name
        await invoke('files/put', {
          mountId: state.activeMountId,
          path,
          contentBase64: b64,
        })
        ok += 1
      } catch (err) {
        toast(err.message || String(err), true)
      }
    }
    setBrowserLoading(false)
    if (ok) toast(ok === 1 ? `已上传 ${small[0].name}` : `已上传 ${ok} 个文件`)
    await refreshBrowser()
  }

  async function refreshTransfers() {
    try {
      const res = await invoke('files/transfer/list', { state: state.transferFilter })
      const tasks = res.tasks || []
      const body = $('transferBody')
      body.innerHTML = ''
      $('transferEmpty').classList.toggle('hidden', tasks.length > 0)
      $('transferStatus').textContent = `${tasks.length} 个任务`
      for (const t of tasks) {
        const tr = document.createElement('tr')
        const prog = t.bytesTotal
          ? `${Math.min(100, Math.round(t.progress || 0))}% (${formatBytes(t.bytesDone)}/${formatBytes(t.bytesTotal)})`
          : formatBytes(t.bytesDone)
        const pct = t.bytesTotal ? Math.min(100, Math.round(t.progress || 0)) : 0
        tr.innerHTML = `
          <td style="font-family:ui-monospace,monospace;font-size:11px">${(t.id || '').slice(0, 8)}</td>
          <td>${t.kind}</td>
          <td style="max-width:18rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeAttr(t.sourcePath + ' → ' + t.destPath)}">${t.sourceMountId?.slice(0, 6)}:${t.sourcePath} → ${t.destMountId?.slice(0, 6)}:${t.destPath}</td>
          <td><div class="progress"><div class="progress__track"><div class="progress__bar" style="width:${pct}%"></div></div><span class="progress__label">${prog}</span></div></td>
          <td>${formatRate(t.rateBps)}</td>
          <td><span class="state-dot is-${t.state}">${t.state}</span></td>
          <td class="row-actions"></td>`
        if (t.state === 'running' || t.state === 'pending') {
          const cancel = document.createElement('button')
          cancel.type = 'button'
          cancel.className = 'dw-text-btn'
          cancel.textContent = '取消'
          cancel.addEventListener('click', async () => {
            await invoke('files/transfer/cancel', { id: t.id })
            await refreshTransfers()
          })
          tr.querySelector('.row-actions').appendChild(cancel)
        }
        body.appendChild(tr)
      }
    } catch (e) {
      toast(e.message || String(e), true)
    }
  }

  async function refreshArchives() {
    try {
      const res = await invoke('files/archive/list', {})
      const tasks = res.tasks || []
      const body = $('archiveBody')
      body.innerHTML = ''
      $('archiveEmpty').classList.toggle('hidden', tasks.length > 0)
      $('archiveStatus').textContent = `${tasks.length} 个任务`
      for (const t of tasks) {
        const tr = document.createElement('tr')
        tr.innerHTML = `
          <td style="font-family:ui-monospace,monospace;font-size:11px">${(t.id || '').slice(0, 8)}</td>
          <td>${archiveKindLabel(t.kind)}</td>
          <td>${t.sourcePath}</td>
          <td>${t.destPath}</td>
          <td><span class="state-dot is-${t.state}">${t.state}</span></td>
          <td>${formatBytes(t.bytesDone)}</td>
          <td class="row-actions"></td>`
        if (t.state === 'running' || t.state === 'pending') {
          const cancel = document.createElement('button')
          cancel.type = 'button'
          cancel.className = 'dw-text-btn'
          cancel.textContent = '取消'
          cancel.addEventListener('click', async () => {
            await invoke('files/archive/cancel', { id: t.id })
            await refreshArchives()
          })
          tr.querySelector('.row-actions').appendChild(cancel)
        }
        body.appendChild(tr)
      }
    } catch (e) {
      toast(e.message || String(e), true)
    }
  }

  function closeDialog() {
    $('confirmDrawer')?.classList.remove('is-open')
    $('confirmBackdrop')?.classList.remove('is-open')
    state.pendingConfirm = null
    state.dialogMode = null
    $('confirmInputWrap')?.classList.add('hidden')
    if ($('confirmInput')) $('confirmInput').value = ''
  }

  function openGuardConfirm(pending) {
    state.dialogMode = 'guard'
    state.pendingConfirm = pending
    $('confirmInputWrap').classList.add('hidden')
    $('confirmTitle').textContent = pending.kind === 'delete' ? '确认删除' : '确认操作'
    $('confirmBody').textContent =
      pending.kind === 'delete'
        ? `将永久删除：\n${pending.path}\n\n此操作不可恢复。`
        : `${pending.kind}：${pending.path}`
    $('confirmOk').textContent = '确认删除'
    $('confirmOk').className = 'dw-btn dw-btn--danger'
    $('confirmDrawer').classList.add('is-open')
    $('confirmBackdrop').classList.add('is-open')
  }

  function openNewFolderDialog() {
    state.dialogMode = 'mkdir'
    state.pendingConfirm = null
    $('confirmTitle').textContent = '新建文件夹'
    $('confirmBody').textContent = `将在当前路径创建文件夹：\n${currentPathLabel()}/`
    $('confirmInputWrap').classList.remove('hidden')
    $('confirmOk').textContent = '创建'
    $('confirmOk').className = 'dw-btn dw-btn--primary'
    $('confirmDrawer').classList.add('is-open')
    $('confirmBackdrop').classList.add('is-open')
    setTimeout(() => $('confirmInput')?.focus(), 30)
  }

  async function runDialogOk() {
    if (state.dialogMode === 'mkdir') {
      const name = ($('confirmInput').value || '').trim().replace(/\/+$/, '')
      if (!name) {
        toast('请输入文件夹名称', true)
        return
      }
      try {
        await invoke('files/mkdir', {
          mountId: state.activeMountId,
          path: (state.prefix || '') + name + '/',
        })
        closeDialog()
        toast(`已创建 ${name}`)
        await refreshBrowser()
      } catch (e) {
        toast(e.message || String(e), true)
      }
      return
    }
    const pending = state.pendingConfirm
    if (!pending) return
    try {
      await invoke('files/guard/confirm', { pendingId: pending.id })
      closeDialog()
      toast(pending.kind === 'delete' ? '已删除' : '已确认')
      await refreshGuard()
      await refreshBrowser()
    } catch (e) {
      toast(e.message || String(e), true)
    }
  }

  async function refreshGuard() {
    if (!state.activeMountId) return
    try {
      const policy = await invoke('files/guard', { mountId: state.activeMountId })
      renderPolicyChips(policy)
      const pending = await invoke('files/guard/pending', { mountId: state.activeMountId })
      const list = pending.pending || []
      setGuardBadge(list.length)
      const pb = $('guardPendingBody')
      pb.innerHTML = ''
      $('pendingEmpty')?.classList.toggle('hidden', list.length > 0)
      for (const p of list) {
        const tr = document.createElement('tr')
        tr.innerHTML = `<td>${p.kind}</td><td>${p.path}</td><td>${formatTime(p.created_at || p.createdAt || '')}</td><td></td>`
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'dw-btn dw-btn--danger'
        btn.textContent = '确认'
        btn.addEventListener('click', () => openGuardConfirm(p))
        tr.lastElementChild.appendChild(btn)
        pb.appendChild(tr)
      }
      const audit = await invoke('files/guard/audit', { mountId: state.activeMountId, limit: 50 })
      const ab = $('guardAuditBody')
      ab.innerHTML = ''
      for (const e of audit.entries || []) {
        const tr = document.createElement('tr')
        tr.innerHTML = `<td>${formatTime(e.at)}</td><td>${e.action}</td><td>${e.path}</td><td>${e.ok ? '成功' : '失败'}</td><td>${e.detail || ''}</td>`
        ab.appendChild(tr)
      }
    } catch (e) {
      toast(e.message || String(e), true)
    }
  }

  function fillTransferMountSelects() {
    for (const id of ['tfSrcMount', 'tfDestMount']) {
      const sel = $(id)
      sel.innerHTML = ''
      for (const m of state.mounts) {
        const opt = document.createElement('option')
        opt.value = m.id
        opt.textContent = `${m.name} (${m.scheme})`
        sel.appendChild(opt)
      }
      if (state.activeMountId) sel.value = state.activeMountId
    }
  }

  function syncTransferFields() {
    const kind = $('tfKind')?.value || 'copy'
    const upload = kind === 'upload'
    const download = kind === 'download'
    $('tfSrcMountWrap')?.classList.toggle('hidden', upload)
    $('tfDestMountWrap')?.classList.toggle('hidden', download)
    $('tfPickSrcFile')?.classList.toggle('hidden', !upload)
    $('tfPickSrcDir')?.classList.toggle('hidden', !upload)
    $('tfPickDestFile')?.classList.toggle('hidden', !download)
    $('tfPickDestDir')?.classList.toggle('hidden', !download)
    if ($('tfSrcPathLabel')) {
      $('tfSrcPathLabel').textContent = upload ? '本地文件 / 文件夹路径' : '来源路径'
    }
    if ($('tfDestPathLabel')) {
      $('tfDestPathLabel').textContent = download ? '本地保存路径 / 文件夹' : '目标路径'
    }
  }

  async function hostPick(method, params = {}) {
    const api = window.datawisePlugin
    if (!api || typeof api.invoke !== 'function') {
      toast('宿主桥接不可用，请重启 DataWise', true)
      return null
    }
    const picked = await api.invoke(method, params)
    if (picked?.cancelled) return null
    if (picked?.unsupported) {
      toast('当前宿主还不支持该选择器，请升级或重启 DataWise', true)
      return null
    }
    return picked
  }

  function openTransferDrawer(prefill) {
    fillTransferMountSelects()
    if (prefill) {
      if (prefill.kind) $('tfKind').value = prefill.kind
      if (prefill.sourcePath) $('tfSrcPath').value = prefill.sourcePath
      if (prefill.destPath) $('tfDestPath').value = prefill.destPath
      if (prefill.sourceMountId) $('tfSrcMount').value = prefill.sourceMountId
      if (prefill.destMountId) $('tfDestMount').value = prefill.destMountId
    }
    syncTransferFields()
    $('drawerBackdrop').classList.add('is-open')
    $('transferDrawer').classList.add('is-open')
  }

  function archiveKindLabel(kind) {
    if (kind === 'pack') return '打包'
    if (kind === 'unpack') return '解包'
    if (kind === 'lifecycle') return '存储类'
    return kind || ''
  }

  function syncArchiveFields() {
    const kind = $('arKind').value
    $('arDestWrap').classList.toggle('hidden', kind === 'lifecycle')
    $('arFormatWrap').classList.toggle('hidden', kind !== 'pack')
    $('arClassWrap').classList.toggle('hidden', kind !== 'lifecycle')
  }

  function openArchiveDrawer() {
    if (!assertNotAccountRoot('打包')) return
    const selected = checkedItems()[0]
    $('arKind').value = 'pack'
    $('arSource').value = selected ? selected.path : (state.prefix || '')
    const base = state.prefix || ''
    $('arDest').value = base + 'archive.tar.gz'
    syncArchiveFields()
    $('drawerBackdrop').classList.add('is-open')
    $('archiveDrawer').classList.add('is-open')
  }

  function closeArchiveDrawer() {
    $('archiveDrawer')?.classList.remove('is-open')
    if (!$('transferDrawer')?.classList.contains('is-open')) {
      $('drawerBackdrop').classList.remove('is-open')
    }
  }

  async function createArchive() {
    const kind = $('arKind').value
    const sourcePath = ($('arSource').value || '').trim()
    if (!sourcePath && kind !== 'pack') {
      toast('请填写来源路径', true)
      return
    }
    let destPath = ($('arDest').value || '').trim()
    if (kind === 'lifecycle') destPath = sourcePath
    if (kind !== 'lifecycle' && !destPath) {
      toast('请填写目标路径', true)
      return
    }
    try {
      await invoke('files/archive/create', {
        kind,
        mountId: state.activeMountId,
        sourcePath,
        destPath,
        format: $('arFormat').value,
        storageClass: $('arClass').value,
      })
      closeArchiveDrawer()
      setTab('archives')
      toast('归档任务已创建')
      await refreshArchives()
    } catch (e) {
      toast(e.message || String(e), true)
    }
  }

  function closeTransferDrawer() {
    $('transferDrawer')?.classList.remove('is-open')
    if (!$('archiveDrawer')?.classList.contains('is-open')) {
      $('drawerBackdrop').classList.remove('is-open')
    }
  }

  function setTab(tab) {
    state.tab = tab
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === tab))
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('is-active', p.id === `panel-${tab}`))
    if (tab === 'transfers') refreshTransfers()
    if (tab === 'archives') refreshArchives()
    if (tab === 'guard') refreshGuard()
  }

  function checkedItems() {
    return state.items.filter((i) => state.checked.has(i.path))
  }

  function wireEvents() {
    $('resourceTabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.tab')
      if (tab) setTab(tab.dataset.tab)
    })
    $('btnRefreshAll').addEventListener('click', async () => {
      await refreshMounts()
      if (state.tab === 'transfers') await refreshTransfers()
      if (state.tab === 'archives') await refreshArchives()
      if (state.tab === 'guard') await refreshGuard()
    })
    $('btnRefreshBrowser').addEventListener('click', () => refreshBrowser())
    $('btnUp').addEventListener('click', () => {
      const parts = state.prefix.split('/').filter(Boolean)
      parts.pop()
      setPrefix(parts.length ? `${parts.join('/')}/` : '')
    })
    $('btnCopyPath').addEventListener('click', async () => {
      const text = currentPathLabel()
      try {
        await navigator.clipboard.writeText(text)
        toast(`已复制：${text}`)
      } catch (_) {
        toast(text)
      }
    })
    $('filterInput').addEventListener('input', () => renderBrowser())
    $('btnClearFilter').addEventListener('click', () => {
      $('filterInput').value = ''
      renderBrowser()
      $('filterInput').focus()
    })
    $('checkAll').addEventListener('change', (e) => {
      const filter = ($('filterInput').value || '').toLowerCase()
      const visible = state.items.filter((i) => !filter || (i.name || '').toLowerCase().includes(filter))
      if (e.target.checked) visible.forEach((i) => state.checked.add(i.path))
      else visible.forEach((i) => state.checked.delete(i.path))
      renderBrowser()
    })
    $('btnUpload').addEventListener('click', () => {
      if (!assertNotAccountRoot('上传')) return
      $('fileInput').click()
    })
    $('fileInput').addEventListener('change', async (e) => {
      const files = [...(e.target.files || [])]
      e.target.value = ''
      await uploadFiles(files)
    })
    const dropZone = $('browserDropZone')
    ;['dragenter', 'dragover'].forEach((ev) => {
      dropZone.addEventListener(ev, (e) => {
        if (isInternalDrag(e.dataTransfer)) return
        e.preventDefault()
        dropZone.classList.add('is-dragover')
      })
    })
    ;['dragleave', 'drop'].forEach((ev) => {
      dropZone.addEventListener(ev, (e) => {
        if (isInternalDrag(e.dataTransfer)) {
          dropZone.classList.remove('is-dragover')
          return
        }
        e.preventDefault()
        if (ev === 'dragleave' && dropZone.contains(e.relatedTarget)) return
        dropZone.classList.remove('is-dragover')
      })
    })
    dropZone.addEventListener('drop', async (e) => {
      if (isInternalDrag(e.dataTransfer)) return
      const files = [...(e.dataTransfer?.files || [])]
      if (files.length) await uploadFiles(files)
    })
    document.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) || ''
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (e.key === 'Escape') {
        if ($('confirmDrawer')?.classList.contains('is-open')) {
          closeDialog()
          return
        }
        if ($('transferDrawer')?.classList.contains('is-open')) {
          closeTransferDrawer()
          return
        }
        if (state.checked.size) {
          state.checked.clear()
          renderBrowser()
          return
        }
        if (state.selectedPath) {
          state.selectedPath = null
          closeInspector()
          renderBrowser()
        }
        return
      }
      if (typing || state.tab !== 'browser') return
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        $('filterInput')?.focus()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        state.items.forEach((i) => state.checked.add(i.path))
        renderBrowser()
        return
      }
      if (e.key === 'Backspace') {
        e.preventDefault()
        $('btnUp').click()
      }
    })
    $('btnNewFolder').addEventListener('click', () => {
      if (!assertNotAccountRoot('新建文件夹')) return
      openNewFolderDialog()
    })
    $('btnEmptyUpload')?.addEventListener('click', () => $('fileInput').click())
    $('btnBarDownload')?.addEventListener('click', () => $('btnDownload').click())
    $('btnBarTransfer')?.addEventListener('click', () => $('btnCopyTransfer').click())
    $('btnBarDelete')?.addEventListener('click', () => $('btnDelete').click())
    $('btnBarClear')?.addEventListener('click', () => {
      state.checked.clear()
      renderBrowser()
    })
    $('btnDelete').addEventListener('click', async () => {
      const items = checkedItems()
      if (!items.length) {
        toast('请先勾选要删除的项', true)
        return
      }
      for (const it of items) {
        try {
          const res = await invoke('files/delete', {
            mountId: state.activeMountId,
            path: it.path,
            recursive: true,
            confirmed: false,
          })
          if (res.needsConfirm) {
            toast(`${it.name} 需要在「防护」里确认后才能删除`)
            setTab('guard')
            await refreshGuard()
          }
        } catch (e) {
          toast(e.message || String(e), true)
        }
      }
      await refreshBrowser()
    })
    $('btnDownload').addEventListener('click', async () => {
      const selected = checkedItems()
      const files = selected.filter((i) => i.type === 'FILE')
      const dirs = selected.filter((i) => i.type === 'DIR')
      if (!files.length && !dirs.length) {
        toast('请先勾选要下载的文件或文件夹', true)
        return
      }
      for (const it of files) {
        try {
          await saveRemoteFile(it)
        } catch (e) {
          if (e && e.name === 'AbortError') return
          toast(e.message || String(e), true)
        }
      }
      if (dirs.length) {
        const dir = dirs[0]
        const picked = await hostPick('host.pickDirectory', {})
        if (!picked?.path) {
          if (dirs.length && !files.length) toast('已取消文件夹下载', true)
          return
        }
        try {
          await invoke('files/transfer/create', {
            kind: 'download',
            sourceMountId: state.activeMountId,
            sourcePath: dir.path,
            destMountId: state.activeMountId,
            destPath: picked.path,
            overwrite: true,
          })
          setTab('transfers')
          toast(`已创建文件夹下载：${dir.name}`)
          await refreshTransfers()
        } catch (e) {
          toast(e.message || String(e), true)
        }
      }
    })
    $('btnCopyTransfer').addEventListener('click', () => {
      const items = checkedItems()
      const first = items[0] || (state.selectedPath ? { path: state.selectedPath } : null)
      openTransferDrawer({
        kind: 'copy',
        sourceMountId: state.activeMountId,
        destMountId: state.activeMountId,
        sourcePath: first ? first.path : state.prefix,
        destPath: first ? first.path : state.prefix,
      })
    })
    $('btnNewTransfer').addEventListener('click', () => openTransferDrawer({ kind: 'copy' }))
    $('btnRefreshTransfers').addEventListener('click', () => refreshTransfers())
    $('transferFilters').addEventListener('click', (e) => {
      const pill = e.target.closest('.pill')
      if (!pill) return
      state.transferFilter = pill.dataset.state
      document.querySelectorAll('#transferFilters .pill').forEach((p) => p.classList.toggle('is-active', p === pill))
      refreshTransfers()
    })
    $('tfCancel').addEventListener('click', closeTransferDrawer)
    $('tfKind')?.addEventListener('change', syncTransferFields)
    $('tfPickSrcFile')?.addEventListener('click', async () => {
      try {
        const picked = await hostPick('host.pickOpenFile', {})
        if (!picked?.path) return
        $('tfSrcPath').value = picked.path
        if (!$('tfDestPath').value.trim() && picked.name) {
          $('tfDestPath').value = (state.prefix || '') + picked.name
        }
      } catch (e) {
        toast(e.message || String(e), true)
      }
    })
    $('tfPickSrcDir')?.addEventListener('click', async () => {
      try {
        const picked = await hostPick('host.pickDirectory', {})
        if (!picked?.path) return
        $('tfSrcPath').value = picked.path
        if (!$('tfDestPath').value.trim()) {
          const folder = picked.name || picked.path.split(/[/\\]/).pop() || 'upload'
          $('tfDestPath').value = (state.prefix || '') + folder + '/'
        }
      } catch (e) {
        toast(e.message || String(e), true)
      }
    })
    $('tfPickDestFile')?.addEventListener('click', async () => {
      try {
        const suggested = ($('tfSrcPath').value || 'download').split(/[/\\]/).pop()
        const picked = await hostPick('host.pickSaveFile', {
          suggestedName: suggested || 'download',
        })
        if (picked?.path) $('tfDestPath').value = picked.path
      } catch (e) {
        toast(e.message || String(e), true)
      }
    })
    $('tfPickDestDir')?.addEventListener('click', async () => {
      try {
        const picked = await hostPick('host.pickDirectory', {})
        if (picked?.path) $('tfDestPath').value = picked.path
      } catch (e) {
        toast(e.message || String(e), true)
      }
    })
    $('drawerBackdrop').addEventListener('click', () => {
      closeTransferDrawer()
      closeArchiveDrawer()
    })
    $('tfCreate').addEventListener('click', async () => {
      try {
        const kind = $('tfKind').value
        const sourcePath = ($('tfSrcPath').value || '').trim()
        const destPath = ($('tfDestPath').value || '').trim()
        if (!sourcePath || !destPath) {
          toast('请填写来源和目标路径', true)
          return
        }
        await invoke('files/transfer/create', {
          kind,
          sourceMountId: kind === 'upload' ? state.activeMountId : $('tfSrcMount').value,
          sourcePath,
          destMountId: kind === 'download' ? state.activeMountId : $('tfDestMount').value,
          destPath,
          overwrite: $('tfOverwrite').checked,
        })
        closeTransferDrawer()
        setTab('transfers')
        toast('传输任务已创建')
        await refreshTransfers()
      } catch (e) {
        toast(e.message || String(e), true)
      }
    })
    $('btnNewArchive').addEventListener('click', () => openArchiveDrawer())
    $('arKind')?.addEventListener('change', syncArchiveFields)
    $('arCancel')?.addEventListener('click', closeArchiveDrawer)
    $('arCreate')?.addEventListener('click', () => createArchive())
    $('btnRefreshArchives').addEventListener('click', () => refreshArchives())
    $('btnRefreshGuard').addEventListener('click', () => refreshGuard())
    $('confirmCancel').addEventListener('click', closeDialog)
    $('confirmBackdrop').addEventListener('click', closeDialog)
    $('confirmOk').addEventListener('click', () => runDialogOk())
    $('confirmInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runDialogOk()
    })
  }

  function arrayBufferToBase64(buffer) {
    let binary = ''
    const bytes = new Uint8Array(buffer)
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
    }
    return btoa(binary)
  }

  async function saveRemoteFile(it) {
    const api = window.datawisePlugin
    const ext = String(it.name || '').includes('.') ? String(it.name).split('.').pop() : ''
    const size = Number(it.size || 0)
    const picked = await api.invoke('host.pickSaveFile', {
      suggestedName: it.name || 'download',
      extension: ext || '',
    })
    if (picked && picked.cancelled) return
    if (!picked || (!picked.path && !picked.id)) {
      toast('请先重启 DataWise，才能弹出选择保存位置的窗口。', true)
      return
    }
    // Prefer transfer → local path so large files bypass the 8MB JSON ceiling.
    if (picked.path && (size > MAX_RPC_BYTES || size === 0 || !picked.id)) {
      await invoke('files/transfer/create', {
        kind: 'download',
        sourceMountId: state.activeMountId,
        sourcePath: it.path,
        destMountId: state.activeMountId,
        destPath: picked.path,
        overwrite: true,
      })
      setTab('transfers')
      toast(`已创建下载任务：${it.name}`)
      await refreshTransfers()
      return
    }
    toast(`正在下载 ${it.name}…`)
    const res = await invoke('files/read', {
      mountId: state.activeMountId,
      path: it.path,
      maxBytes: MAX_RPC_BYTES,
    })
    const written = await api.invoke('host.writeSaveFile', {
      id: picked.id,
      contentBase64: res.contentBase64,
    })
    toast(`已保存到 ${written?.path || picked.path}`)
  }

  function subscribeEvents(api) {
    const handler = (method) => {
      if (method === 'files-studio/transfer/progress' && state.tab === 'transfers') refreshTransfers()
      if (method === 'files-studio/archive/progress' && state.tab === 'archives') refreshArchives()
    }
    let wired = false
    if (typeof api.onEvent === 'function') {
      api.onEvent(handler)
      wired = true
    }
    if (typeof api.subscribe === 'function') {
      try {
        api.subscribe(handler)
        wired = true
      } catch (_) {
        /* older hosts may throw */
      }
    }
    // Always poll lightly so progress stays visible even without events.
    setInterval(() => {
      if (state.tab === 'transfers') refreshTransfers()
      if (state.tab === 'archives') refreshArchives()
    }, wired ? 4000 : 2000)
  }

  function applyHostTheme(info) {
    if (!info) return
    const root = document.documentElement
    const theme = info.theme
    const appearance = info.appearance
    let scheme = theme?.appearance
    if (!scheme && typeof appearance === 'string') scheme = appearance === 'light' ? 'light' : 'dark'
    if (!scheme && appearance?.colorScheme) scheme = appearance.colorScheme
    if (scheme !== 'light' && scheme !== 'dark') {
      scheme = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
    }
    root.setAttribute('data-theme', scheme)
    root.setAttribute('data-dw-theme', scheme)
    root.style.colorScheme = scheme
    const tokens = theme?.tokens
    if (tokens && typeof tokens === 'object') {
      Object.keys(tokens).forEach((key) => {
        if (typeof tokens[key] === 'string' && tokens[key]) root.style.setProperty(key, tokens[key])
      })
    }
  }

  async function boot() {
    wireEvents()
    const api = await waitForHostApi()
    state.ready = true
    try {
      const info = await api.getHostInfo?.()
      applyHostTheme(info)
      api.onHostInfo?.(applyHostTheme)
      api.onAppearanceChange?.((next) => applyHostTheme({ appearance: next, theme: typeof next === 'object' ? next : undefined }))
      document.addEventListener('datawise-plugin-env', (ev) => applyHostTheme(ev.detail || {}))
    } catch (_) {}
    const ctx = api.context || {}
    state.connectionId = ctx.connectionId || ctx.connection_id || null
    $('endpointLabel').textContent = state.connectionId
      ? `connection ${state.connectionId}`
      : 'Host bridge ready'
    subscribeEvents(api)

    // Host context does not include secrets. Re-open through the host so the
    // saved Access Key is loaded from the connection store, not from this iframe.
    if (state.connectionId && typeof api.reopenConnection === 'function') {
      try {
        await api.reopenConnection(state.connectionId)
      } catch (e) {
        toast(e.message || String(e), true)
      }
    }

    await refreshMounts()
  }

  boot().catch((e) => {
    $('endpointLabel').textContent = '启动失败'
    toast(e.message || String(e), true)
  })
})()
