/* Kafka Ops — views-guard.js */
(function () {
  const KO = (window.KO = window.KO || {});
  const state = KO.state;
  const $ = (...a) => KO.util.$(...a);
  const $$ = (...a) => KO.util.$$(...a);
  const VIEW_FRESH_MS = KO.consts.VIEW_FRESH_MS;
  const VIRT_MIN = KO.consts.VIRT_MIN;
  const TOPIC_ROW_H = KO.consts.TOPIC_ROW_H;
  const GROUP_ROW_H = KO.consts.GROUP_ROW_H;

  function syncDangerUi() {
    const on = state.allowDangerous
    const el = $('#dangerToggle')
    el.classList.toggle('on', on)
    el.textContent = on ? '危险模式 · 开' : '危险模式 · 关'
    const banner = $('#guardBanner')
    if (banner) {
      banner.textContent = on
        ? '危险模式已开启。删 Topic / Produce / 重置 Offset / 删组 / 非白名单配置可执行，仍须二次确认。'
        : '危险模式关闭。写操作被拦截——请用顶栏总闸开启（本页无第二开关）。'
    }
    const strip = $('#guardStrip')
    if (strip) strip.classList.toggle('on', on)
    const dangerStat = $('#guardStatDanger')
    if (dangerStat) {
      dangerStat.textContent = on ? '开' : '关'
      dangerStat.classList.toggle('on', on)
    }
    const title = $('#guardStripTitle')
    if (title) title.textContent = on ? '审计 · 危险模式开启' : '审计 · 策略'
    const prod = $('#btnProduce')
    if (prod) {
      prod.disabled = !on
      prod.title = on ? '向 Topic 写入消息' : '需开启危险模式'
    }
    KO.lag.syncLagActionButtons()
    if (state.selectedTopic && state.topicDetail) KO.lag.applyDangerToDetail()
  }

  async function setDanger(on, { confirmEnable = true } = {}) {
    if (on && !state.allowDangerous && confirmEnable) {
      const ok = await KO.util.askConfirm({
        title: '开启危险模式',
        body: '将允许删 Topic、Produce、重置 Offset、删消费组等写操作（仍有二次确认）。',
        danger: true,
        okLabel: '开启',
      })
      if (!ok) return
    }
    state.allowDangerous = !!on
    syncDangerUi()
    KO.bridge.storeSet('kafka.allowDangerous', state.allowDangerous ? '1' : '0')
  }

  function filteredLogs() {
    const filter = (KO.combos?.logFilter && KO.combos.logFilter.getValue()) || 'all'
    const q = ($('#logQuery')?.value || '').trim().toLowerCase()
    return state.logs.filter(l => {
      if (filter === 'ok' && !l.ok) return false
      if (filter === 'err' && l.ok) return false
      if (filter === 'write' && l.kind === 'read') return false
      if (q) {
        const hay = `${l.method} ${l.short || ''} ${l.detail || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }

  function renderLog() {
    const all = state.logs.length
    const okN = state.logs.filter(l => l.ok).length
    const errN = all - okN
    const totalEl = $('#guardStatTotal')
    const okEl = $('#guardStatOk')
    const errEl = $('#guardStatErr')
    if (totalEl) totalEl.textContent = String(all)
    if (okEl) okEl.textContent = String(okN)
    if (errEl) errEl.textContent = String(errN)
    KO.bridge.updateGuardLogBadge()
    const box = $('#callLog')
    if (!box) return
    const rows = filteredLogs()
    if (!all) {
      box.innerHTML = '<div class="log-empty">尚无调用记录 · 在其他页操作后会出现在这里<br/><span style="opacity:.7">最多保留 200 条 · 最新在上</span></div>'
      return
    }
    if (!rows.length) {
      box.innerHTML = '<div class="log-empty">无匹配记录 · 试试调整过滤条件</div>'
      return
    }
    box.innerHTML = rows.map(l => {
      const methClass = l.kind === 'danger' ? 'danger' : (l.kind === 'write' ? 'write' : '')
      return `<div class="log-item ${l.ok ? '' : 'err'}" title="${KO.util.esc(l.method)}${l.detail ? '\n' + KO.util.esc(l.detail) : ''}">
        <span class="t">${KO.util.esc(l.t)}</span>
        <span class="dot"></span>
        <span class="meth ${methClass}">${KO.util.esc(l.short || l.method)}</span>
        <span class="m">${KO.util.esc(l.detail || (l.ok ? 'ok' : 'failed'))}</span>
      </div>`
    }).join('')
  }

  KO.guard = Object.assign(KO.guard || {}, {
    syncDangerUi,
    setDanger,
    filteredLogs,
    renderLog,
  });
})();
