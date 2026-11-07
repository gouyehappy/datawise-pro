/* Kafka Ops — views-pulse.js */
(function () {
  const KO = (window.KO = window.KO || {});
  const state = KO.state;
  const $ = (...a) => KO.util.$(...a);
  const $$ = (...a) => KO.util.$$(...a);
  const VIEW_FRESH_MS = KO.consts.VIEW_FRESH_MS;
  const VIRT_MIN = KO.consts.VIRT_MIN;
  const TOPIC_ROW_H = KO.consts.TOPIC_ROW_H;
  const GROUP_ROW_H = KO.consts.GROUP_ROW_H;

  function setPulseLoading(on, text) {
    const shell = $('#pulseShell')
    if (!shell) return
    shell.classList.toggle('is-loading', !!on)
    if (on && text) {
      const t = $('#pulseLoadingText')
      if (t) t.textContent = text
    }
  }

  async function loadPulse({ quiet = false } = {}) {
    if (state.pulseInFlight) return
    state.pulseInFlight = true
    const statusEl = $('#pulseStatus')
    const titleEl = $('#pulseStatusTitle')
    const dotEl = $('#pulseStatusDot')
    const gate = !quiet && !state.pulseReady
    if (gate) {
      setPulseLoading(true, '正在读取集群脉搏…')
      if (titleEl) {
        titleEl.className = 'sb-title'
        titleEl.textContent = '加载中…'
      }
      if (dotEl) dotEl.className = 'dot'
      $('#pulseStatusDesc').textContent = '正在连接集群'
      $('#pulseSub').textContent = ''
    }
    try {
      const p = await KO.bridge.invoke('kafka/pulse', {}, { quiet })
      state.health[state.activeId] = 'up'
      state._lastPulse = p
      KO.bridge.setStatus('已连接', 'ok')
      KO.bridge.markRefresh('Pulse')
      KO.nav.markViewFetched('pulse')

      const urp = p.underReplicated || 0
      const off = p.offlinePartitions || 0
      const brokers = p.brokerCount || 0
      let level = 'ok'
      let title = '集群正常'
      let desc = '副本齐全 · 分区均有 Leader'
      if (!brokers) {
        level = 'bad'
        title = '无可用 Broker'
        desc = '检查网络、鉴权或 bootstrap'
      } else if (off > 0) {
        level = 'bad'
        title = '有分区不可用'
        desc = `${off} 个 Offline · 优先处理`
      } else if (urp > 0) {
        level = 'warn'
        title = '副本未全部跟上'
        desc = `${urp} 个 URP · 容错变弱`
      }

      if (statusEl) statusEl.className = 'statusbar'
      if (titleEl) {
        titleEl.className = 'sb-title ' + level
        titleEl.textContent = title
      }
      if (dotEl) dotEl.className = 'dot ' + (level === 'ok' ? 'up' : level === 'bad' ? 'down' : '')
      $('#pulseStatusDesc').textContent = desc
      $('#pulseSub').textContent = [
        p.name || p.clusterId || 'cluster',
        p.bootstrapServers || '',
        p.kafkaClusterId ? `id ${p.kafkaClusterId}` : '',
        p.cached ? 'cache' : '',
      ].filter(Boolean).join(' · ')

      // Patch health / metrics in place (no full innerHTML)
      const urpCell = $('#pulseUrpCell')
      const offCell = $('#pulseOffCell')
      if (urpCell) urpCell.className = 'ph-cell ' + (urp ? 'bad' : 'ok')
      if (offCell) offCell.className = 'ph-cell ' + (off ? 'bad' : 'ok')
      const urpEl = $('#pulseUrp')
      const offEl = $('#pulseOff')
      if (urpEl) urpEl.textContent = String(urp)
      if (offEl) offEl.textContent = String(off)
      patchPulseMetric('mBrokers', brokers, brokers ? 'ok' : 'bad', `Controller #${p.controllerId ?? '—'}`)
      patchPulseMetric('mTopics', p.topicCount ?? 0, '', '主题数')
      patchPulseMetric('mParts', p.partitionCount ?? 0, '', '全集群')
      patchPulseMetric('mGroups', p.groupCount ?? 0, '', 'Consumer Groups')

      const probs = p.problemTopics || []
      state._lastProblems = probs
      const probKey = probs.map(t => `${t.name}:${t.underReplicated || 0}:${t.offline || 0}`).join('|')
      $('#pulseProbCount').textContent = probs.length ? `${probs.length}` : '0'
      const box = $('#pulseProblems')
      if (state._pulseProbKey !== probKey) {
        state._pulseProbKey = probKey
        if (!probs.length) {
          box.innerHTML = `<div class="empty">没有需要关注的 Topic</div>`
        } else {
          box.innerHTML = probs.map(t => {
            const u = t.underReplicated || 0
            const o = t.offline || 0
            const bits = []
            if (o) bits.push(`${o} Offline`)
            if (u) bits.push(`${u} URP`)
            return `<div class="prob-row" data-name="${KO.util.esc(t.name)}">
              <div>
                <div class="pn">${KO.util.esc(t.name)}</div>
                <div class="pd">${KO.util.esc(bits.join(' · ') || '异常')}</div>
              </div>
              <div class="pright">
                ${o ? `<span class="pill bad">Offline ${o}</span>` : ''}
                ${u ? `<span class="pill warn">URP ${u}</span>` : ''}
              </div>
            </div>`
          }).join('')
          box.querySelectorAll('.prob-row').forEach(el => {
            el.onclick = () => {
              state.selectedTopic = el.dataset.name
              KO.nav.switchView('topics')
            }
          })
        }
      }
      KO.fleet.renderClusterPicker()
      state.pulseReady = true
    } catch (e) {
      state.health[state.activeId] = 'down'
      KO.bridge.setStatus('断开', 'bad')
      if (statusEl) statusEl.className = 'statusbar'
      if (titleEl) {
        titleEl.className = 'sb-title bad'
        titleEl.textContent = '无法读取集群'
      }
      if (dotEl) dotEl.className = 'dot down'
      $('#pulseStatusDesc').textContent = String(e.message || e)
      $('#pulseSub').textContent = '检查连接或切换集群'
      const urpCell = $('#pulseUrpCell')
      const offCell = $('#pulseOffCell')
      if (urpCell) urpCell.className = 'ph-cell bad'
      if (offCell) offCell.className = 'ph-cell bad'
      if ($('#pulseUrp')) $('#pulseUrp').textContent = '—'
      if ($('#pulseOff')) $('#pulseOff').textContent = '—'
      patchPulseMetric('mBrokers', '—', 'bad', '')
      patchPulseMetric('mTopics', '—', '', '')
      patchPulseMetric('mParts', '—', '', '')
      patchPulseMetric('mGroups', '—', '', '')
      state._pulseProbKey = ''
      $('#pulseProblems').innerHTML = '<div class="empty">无数据</div>'
      $('#pulseProbCount').textContent = ''
      KO.fleet.renderClusterPicker()
      state.pulseReady = true
    } finally {
      state.pulseInFlight = false
      setPulseLoading(false)
    }
  }

  function patchPulseMetric(id, v, cls, h) {
    const el = $('#' + id)
    if (!el) return
    el.textContent = String(v)
    el.className = 'v' + (cls ? ' ' + cls : '')
    const hint = $('#' + id + 'H')
    if (hint && h != null) hint.textContent = h
  }

  async function diagnose() {
    const res = await KO.bridge.invoke('kafka/diagnose')
    state.lastDiagnose = res.markdown || ''
    await KO.bridge.clipboard(state.lastDiagnose)
    KO.util.toast('诊断报告已复制到剪贴板')
  }

  function armPulseTimer() {
    clearInterval(state.pulseTimer)
    const sec = Number((KO.combos?.pulseRefresh && KO.combos.pulseRefresh.getValue()) || 0)
    KO.bridge.storeSet('kafka.overviewRefreshSec', String(sec))
    if (sec > 0) {
      state.pulseTimer = setInterval(() => {
        if (state.view !== 'pulse') return
        loadPulse({ quiet: true }).catch(() => {})
      }, sec * 1000)
    }
  }

  KO.pulse = Object.assign(KO.pulse || {}, {
    setPulseLoading,
    loadPulse,
    patchPulseMetric,
    diagnose,
    armPulseTimer,
  });
})();
