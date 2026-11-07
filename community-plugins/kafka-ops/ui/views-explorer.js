/* Kafka Ops — views-explorer.js */
(function () {
  const KO = (window.KO = window.KO || {});
  const state = KO.state;
  const $ = (...a) => KO.util.$(...a);
  const $$ = (...a) => KO.util.$$(...a);
  const VIEW_FRESH_MS = KO.consts.VIEW_FRESH_MS;
  const VIRT_MIN = KO.consts.VIRT_MIN;
  const TOPIC_ROW_H = KO.consts.TOPIC_ROW_H;
  const GROUP_ROW_H = KO.consts.GROUP_ROW_H;

  async function prepareExplorer(opts = {}) {
    if (opts.topic) state.exploreTopic = opts.topic
    if (opts.partition != null) state.explorePartition = opts.partition
    // Prefer client cache from Topics view to avoid another round-trip
    let names = (state.topicsRaw || []).filter(t => !t.internal).map(t => t.name)
    if (!names.length) {
      const res = await KO.bridge.invoke('kafka/topics', { includeInternal: false, light: true })
      names = (res.topics || []).map(t => t.name)
      if (!state.topicsRaw.length) state.topicsRaw = res.topics || []
    }
    const cur = state.exploreTopic || state.selectedTopic || names[0] || ''
    if (KO.combos?.exTopic) {
      KO.combos.exTopic.setItems(names)
      KO.combos.exTopic.setValue(cur, true)
    }
    state.exploreTopic = cur
    await onExTopicChange()
    if (opts.partition != null && KO.combos?.exPart) {
      KO.combos.exPart.setValue(String(opts.partition), true)
      state.explorePartition = opts.partition
    }
    updateExCrumb()
    KO.guard.syncDangerUi()
    if (opts.autoFetch && cur) fetchMessages().catch(e => KO.util.toast(e.message, true))
  }

  function updateExCrumb() {
    const t = (KO.combos?.exTopic && KO.combos.exTopic.getValue()) || state.exploreTopic || '—'
    const p = (KO.combos?.exPart && KO.combos.exPart.getValue())
    const part = p ?? state.explorePartition ?? '—'
    $('#exCrumb').textContent = t
    const seek = (KO.combos?.exSeek && KO.combos.exSeek.getValue()) || 'latest'
    const seekLab = ({ latest: '最新', earliest: '最早', offset: '指定 offset', timestamp: '时间戳' })[seek] || seek
    $('#exStripSub').textContent = `P${part} · Seek ${seekLab}`
    const hint = $('#exSeekHint')
    if (hint) hint.textContent = `seek=${seek}`
  }

  async function onExTopicChange() {
    const topic = (KO.combos?.exTopic && KO.combos.exTopic.getValue()) || state.exploreTopic
    state.exploreTopic = topic
    if (!topic) return
    try {
      const keep = state.explorePartition
      let list = []
      // Reuse topic detail partitions when already loaded — skip topic-meta RPC
      if (state.topicDetail?.name === topic && Array.isArray(state.topicDetail.partitionDetails) && state.topicDetail.partitionDetails.length) {
        list = state.topicDetail.partitionDetails
      } else {
        const d = await KO.bridge.invoke('kafka/topic-meta', { topic })
        list = d.partitionsList || []
      }
      const items = list.map(p => ({ value: String(p.partition), label: 'P' + p.partition }))
      if (KO.combos?.exPart) {
        KO.combos.exPart.setItems(items)
        const keepOk = items.some(i => i.value === String(keep))
        KO.combos.exPart.setValue(keepOk ? String(keep) : (items[0]?.value || '0'), true)
        state.explorePartition = Number(KO.combos.exPart.getValue() || 0)
      }
      updateExCrumb()
    } catch (e) {
      KO.util.toast(e.message || e, true)
    }
  }

  async function fetchMessages() {
    const topic = (KO.combos?.exTopic && KO.combos.exTopic.getValue()) || state.exploreTopic
    if (!topic) return KO.util.toast('请选择 Topic', true)
    const seek = (KO.combos?.exSeek && KO.combos.exSeek.getValue()) || 'latest'
    const params = {
      topic,
      partition: Number((KO.combos?.exPart && KO.combos.exPart.getValue()) || state.explorePartition || 0),
      seek,
      limit: Number($('#exLimit').value || 50),
    }
    if (seek === 'offset') params.offset = Number($('#exOffset').value || 0)
    if (seek === 'timestamp') params.timestamp = Number($('#exTs').value || 0)
    updateExCrumb()
    const res = await KO.bridge.invoke('kafka/messages', params)
    state.records = res.records || []
    KO.bridge.markRefresh('Explore')
    const readable = Math.max(0, (res.latest || 0) - (res.earliest || 0))
    $('#exEarliest').textContent = res.earliest ?? '—'
    $('#exLatest').textContent = res.latest ?? '—'
    $('#exReadable').textContent = readable
    $('#exCount').textContent = state.records.length ? `${state.records.length} 条` : ''
    const box = $('#exRecords')
    const copyBtn = $('#exCopyValue')
    if (copyBtn) copyBtn.style.display = 'none'
    state._exValueRaw = ''
    if (!state.records.length) {
      box.innerHTML = '<div class="empty">该范围内无记录</div>'
      $('#exDetail').innerHTML = '<div class="empty">无记录</div>'
      return
    }
    box.innerHTML = state.records.map((r, i) => {
      const hint = KO.util.recordHint(r.value)
      return `
      <div class="record" data-i="${i}">
        <div class="off">${KO.util.esc(r.offset)}</div>
        <div class="body">
          ${hint ? `<div class="hint-line">${KO.util.esc(hint)}</div>` : ''}
          <div class="preview">${KO.util.esc(KO.util.recordPreview(r.value || r.key || ''))}</div>
          <div class="meta">
            <span class="chip">${KO.util.esc(KO.util.fmtBytes(r.valueBytes))}</span>
            ${r.key ? `<span class="chip">key</span>` : ''}
          </div>
        </div>
        <div class="ts-col">${KO.util.esc(KO.util.fmtMsgTs(r.timestamp))}</div>
      </div>`
    }).join('')
    box.querySelectorAll('.record').forEach(el => {
      el.onclick = () => showRecord(Number(el.dataset.i))
    })
    showRecord(0)
  }

  function showRecord(i) {
    const r = state.records[i]
    state._exSelected = i
    $$('#exRecords .record').forEach((el, idx) => el.classList.toggle('active', idx === i))
    if (!r) return
    const disp = KO.util.formatValueDisplay(r.value)
    state._exValueRaw = r.value || ''
    const copyBtn = $('#exCopyValue')
    if (copyBtn) copyBtn.style.display = state._exValueRaw ? '' : 'none'
    const headers = r.headers || []
    const badges = [
      disp.isJson ? '<span class="chip">JSON</span>' : '',
      disp.unwrapped ? `<span class="chip">unwrapped · ${KO.util.esc(disp.wrapKey || 'payload')}</span>` : '',
    ].filter(Boolean).join(' ')
    const outerBlock = disp.unwrapped && disp.outerText
      ? `<div class="detail-block"><h4>Outer envelope</h4><pre>${KO.util.esc(disp.outerText)}</pre></div>`
      : ''
    $('#exDetail').innerHTML = `
      <div class="ex-meta-row">
        <div class="kv"><div class="k">Partition</div><div class="v copyable" data-copy="${KO.util.esc(r.partition)}" title="点击复制">${KO.util.esc(r.partition)}</div></div>
        <div class="kv"><div class="k">Offset</div><div class="v accent copyable" data-copy="${KO.util.esc(r.offset)}" title="点击复制">${KO.util.esc(r.offset)}</div></div>
        <div class="kv"><div class="k">Time</div><div class="v copyable" data-copy="${KO.util.esc(KO.util.fmtMsgTs(r.timestamp))}" title="点击复制">${KO.util.esc(KO.util.fmtMsgTs(r.timestamp))}</div></div>
        <div class="kv"><div class="k">Size</div><div class="v">${KO.util.esc(KO.util.fmtBytes(r.valueBytes))} / key ${KO.util.esc(KO.util.fmtBytes(r.keyBytes))}</div></div>
      </div>
      <div class="detail-block"><h4>Key <span class="hint" style="font-weight:500">点击复制</span></h4><pre class="copyable" data-copy="${KO.util.esc(r.key || '')}" title="点击复制">${KO.util.esc(r.key || '—')}</pre></div>
      <div class="detail-block">
        <h4>Value ${badges}</h4>
        <pre class="tall copyable" data-copy-value="1" title="点击复制 Value">${KO.util.esc(disp.text || '—')}</pre>
      </div>
      ${outerBlock}
      <div class="detail-block"><h4>Headers ${headers.length ? `(${headers.length})` : ''}</h4>
        <pre>${KO.util.esc(headers.length ? JSON.stringify(headers, null, 2) : '[]')}</pre>
      </div>`
    $('#exDetail').querySelectorAll('[data-copy]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation()
        KO.util.copyText(el.getAttribute('data-copy'), el.closest('.detail-block') ? 'Key' : '').catch(() => {})
      }
    })
    const valPre = $('#exDetail').querySelector('[data-copy-value]')
    if (valPre) {
      valPre.onclick = (e) => {
        e.stopPropagation()
        if (state._exValueRaw) KO.util.copyText(state._exValueRaw, 'Value').catch(() => {})
      }
    }
    const active = $(`#exRecords .record[data-i="${i}"]`)
    if (active) active.scrollIntoView({ block: 'nearest' })
  }

  function syncSeekFields(mode) {
    $('#exOffset').style.display = mode === 'offset' ? '' : 'none'
    $('#exTs').style.display = mode === 'timestamp' ? '' : 'none'
  }

  KO.explorer = Object.assign(KO.explorer || {}, {
    prepareExplorer,
    updateExCrumb,
    onExTopicChange,
    fetchMessages,
    showRecord,
    syncSeekFields,
  });
})();
