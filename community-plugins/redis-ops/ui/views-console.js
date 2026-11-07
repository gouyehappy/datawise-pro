/* Redis Ops — console */
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

  function consoleDangerInfo(command) {
    const parts = String(command || '').trim().split(/\s+/)
    const verb = (parts[0] || '').toUpperCase()
    const DANGER = {
      FLUSHALL: 1, FLUSHDB: 1, KEYS: 1, SHUTDOWN: 1, DEBUG: 1,
      SAVE: 1, BGSAVE: 1, REPLICAOF: 1, SLAVEOF: 1, CLUSTER: 1, ACL: 1,
      SCRIPT: 1, EVAL: 1, EVALSHA: 1, MIGRATE: 1, SWAPDB: 1
    }
    if (verb === 'CONFIG') {
      const sub = (parts[1] || '').toUpperCase()
      if (sub && sub !== 'GET') return { dangerous: true, verb: 'CONFIG ' + sub }
      return { dangerous: false, verb: 'CONFIG GET' }
    }
    return { dangerous: !!DANGER[verb], verb: verb || '?' }
  }

  const REDIS_CMD_HINTS = [
    { c: 'PING', h: 'Test connectivity' },
    { c: 'ECHO', h: 'ECHO message' },
    { c: 'AUTH', h: 'AUTH [username] password' },
    { c: 'SELECT', h: 'SELECT index' },
    { c: 'DBSIZE', h: 'Key count in current DB' },
    { c: 'INFO', h: 'INFO [section]' },
    { c: 'TIME', h: 'Server UNIX time' },
    { c: 'CLIENT LIST', h: 'List client connections' },
    { c: 'CLIENT KILL', h: 'CLIENT KILL ip:port' },
    { c: 'SLOWLOG GET', h: 'SLOWLOG GET [count]' },
    { c: 'SLOWLOG LEN', h: 'Slowlog length' },
    { c: 'SLOWLOG RESET', h: 'Clear slowlog' },
    { c: 'CONFIG GET', h: 'CONFIG GET pattern' },
    { c: 'CONFIG SET', h: 'CONFIG SET param value' },
    { c: 'CONFIG REWRITE', h: 'Persist CONFIG changes' },
    { c: 'MEMORY STATS', h: 'Memory subsystem stats' },
    { c: 'MEMORY USAGE', h: 'MEMORY USAGE key' },
    { c: 'MEMORY DOCTOR', h: 'Memory diagnostics' },
    { c: 'GET', h: 'GET key' },
    { c: 'MGET', h: 'MGET key [key …]' },
    { c: 'SET', h: 'SET key value [EX seconds]' },
    { c: 'SETNX', h: 'SETNX key value' },
    { c: 'SETEX', h: 'SETEX key seconds value' },
    { c: 'GETSET', h: 'GETSET key value' },
    { c: 'STRLEN', h: 'STRLEN key' },
    { c: 'APPEND', h: 'APPEND key value' },
    { c: 'INCR', h: 'INCR key' },
    { c: 'INCRBY', h: 'INCRBY key increment' },
    { c: 'DECR', h: 'DECR key' },
    { c: 'DECRBY', h: 'DECRBY key decrement' },
    { c: 'DEL', h: 'DEL key [key …]' },
    { c: 'UNLINK', h: 'UNLINK key [key …]' },
    { c: 'EXISTS', h: 'EXISTS key [key …]' },
    { c: 'TYPE', h: 'TYPE key' },
    { c: 'TTL', h: 'TTL key' },
    { c: 'PTTL', h: 'PTTL key' },
    { c: 'EXPIRE', h: 'EXPIRE key seconds' },
    { c: 'PEXPIRE', h: 'PEXPIRE key milliseconds' },
    { c: 'EXPIREAT', h: 'EXPIREAT key timestamp' },
    { c: 'PERSIST', h: 'Remove TTL' },
    { c: 'RENAME', h: 'RENAME key newkey' },
    { c: 'RENAMENX', h: 'RENAMENX key newkey' },
    { c: 'DUMP', h: 'DUMP key' },
    { c: 'RESTORE', h: 'RESTORE key ttl serialized' },
    { c: 'SCAN', h: 'SCAN cursor [MATCH pat] [COUNT n]' },
    { c: 'KEYS', h: 'KEYS pattern (blocked by default)' },
    { c: 'HGET', h: 'HGET key field' },
    { c: 'HGETALL', h: 'HGETALL key' },
    { c: 'HSET', h: 'HSET key field value' },
    { c: 'HMSET', h: 'HMSET key field value …' },
    { c: 'HMGET', h: 'HMGET key field [field …]' },
    { c: 'HDEL', h: 'HDEL key field [field …]' },
    { c: 'HEXISTS', h: 'HEXISTS key field' },
    { c: 'HKEYS', h: 'HKEYS key' },
    { c: 'HVALS', h: 'HVALS key' },
    { c: 'HLEN', h: 'HLEN key' },
    { c: 'HINCRBY', h: 'HINCRBY key field increment' },
    { c: 'HSCAN', h: 'HSCAN key cursor' },
    { c: 'LPUSH', h: 'LPUSH key element …' },
    { c: 'RPUSH', h: 'RPUSH key element …' },
    { c: 'LPOP', h: 'LPOP key' },
    { c: 'RPOP', h: 'RPOP key' },
    { c: 'LLEN', h: 'LLEN key' },
    { c: 'LRANGE', h: 'LRANGE key start stop' },
    { c: 'LINDEX', h: 'LINDEX key index' },
    { c: 'LSET', h: 'LSET key index element' },
    { c: 'LTRIM', h: 'LTRIM key start stop' },
    { c: 'LREM', h: 'LREM key count element' },
    { c: 'SADD', h: 'SADD key member …' },
    { c: 'SREM', h: 'SREM key member …' },
    { c: 'SMEMBERS', h: 'SMEMBERS key' },
    { c: 'SISMEMBER', h: 'SISMEMBER key member' },
    { c: 'SCARD', h: 'SCARD key' },
    { c: 'SPOP', h: 'SPOP key' },
    { c: 'SRANDMEMBER', h: 'SRANDMEMBER key [count]' },
    { c: 'SINTER', h: 'SINTER key [key …]' },
    { c: 'SUNION', h: 'SUNION key [key …]' },
    { c: 'SDIFF', h: 'SDIFF key [key …]' },
    { c: 'SSCAN', h: 'SSCAN key cursor' },
    { c: 'ZADD', h: 'ZADD key score member' },
    { c: 'ZREM', h: 'ZREM key member …' },
    { c: 'ZRANGE', h: 'ZRANGE key start stop [WITHSCORES]' },
    { c: 'ZREVRANGE', h: 'ZREVRANGE key start stop' },
    { c: 'ZRANGEBYSCORE', h: 'ZRANGEBYSCORE key min max' },
    { c: 'ZCARD', h: 'ZCARD key' },
    { c: 'ZSCORE', h: 'ZSCORE key member' },
    { c: 'ZRANK', h: 'ZRANK key member' },
    { c: 'ZINCRBY', h: 'ZINCRBY key increment member' },
    { c: 'ZSCAN', h: 'ZSCAN key cursor' },
    { c: 'XADD', h: 'XADD key * field value' },
    { c: 'XLEN', h: 'XLEN key' },
    { c: 'XRANGE', h: 'XRANGE key - + [COUNT n]' },
    { c: 'XREVRANGE', h: 'XREVRANGE key + - [COUNT n]' },
    { c: 'XREAD', h: 'XREAD COUNT n STREAMS key id' },
    { c: 'XTRIM', h: 'XTRIM key MAXLEN n' },
    { c: 'XGROUP', h: 'XGROUP CREATE key group id' },
    { c: 'PUBLISH', h: 'PUBLISH channel message' },
    { c: 'SUBSCRIBE', h: 'SUBSCRIBE channel' },
    { c: 'PSUBSCRIBE', h: 'PSUBSCRIBE pattern' },
    { c: 'PUBSUB CHANNELS', h: 'List active channels' },
    { c: 'ROLE', h: 'Replication role' },
    { c: 'REPLICAOF', h: 'REPLICAOF host port (blocked)' },
    { c: 'SLAVEOF', h: 'SLAVEOF host port (blocked)' },
    { c: 'FLUSHDB', h: 'Delete all keys in DB (blocked)' },
    { c: 'FLUSHALL', h: 'Delete all keys (blocked)' },
    { c: 'SAVE', h: 'Blocking RDB save (blocked)' },
    { c: 'BGSAVE', h: 'Background RDB save (blocked)' },
    { c: 'LASTSAVE', h: 'UNIX time of last save' },
    { c: 'MONITOR', h: 'Stream every command' },
    { c: 'OBJECT ENCODING', h: 'OBJECT ENCODING key' },
    { c: 'OBJECT IDLETIME', h: 'OBJECT IDLETIME key' },
    { c: 'RANDOMKEY', h: 'Random key name' },
    { c: 'MOVE', h: 'MOVE key db' },
    { c: 'SWAPDB', h: 'SWAPDB a b (blocked)' }
  ]

  function syncSafeBadge() {
    const b = document.getElementById('safeBadge')
    if (!b) return
    b.className = 'term-safe ' + (S.allowDangerous ? 'on' : 'off')
    b.textContent = S.allowDangerous ? 'Danger: On' : 'Danger: Off'
    b.title = S.allowDangerous
      ? 'Dangerous commands allowed (still confirms)'
      : 'Dangerous commands blocked — click to enable'
  }

  function loadConsole() {
    if (S.overview) RO.fleet.renderIdentity()
    else {
      const inst = S.instances.find(i => i.id === S.activeId)
      if (inst) RO.fleet.renderIdentity()
      else RO.fleet.paintInstIdentityHtml('')
    }
    const hostMeta = (() => {
      const inst = S.instances.find(i => i.id === S.activeId)
      if (S.overview && S.overview.host) return S.overview.host + ':' + (S.overview.port || '')
      if (inst) return (inst.host || '') + ':' + (inst.port || '')
      return S.activeId || '—'
    })()
    S.topActions.innerHTML =
      '<button type="button" class="btn btn-ghost" id="btnCopyLast">Copy last</button>'
      + '<button type="button" class="btn btn-ghost" id="btnClearTerm">Clear</button>'

    const chipGroup = (cmds) =>
      '<div class="term-chip-group">'
      + cmds.map(c => '<button type="button" class="chip-btn" data-c="' + esc(c) + '" title="Run · Shift+click to insert">' + esc(c) + '</button>').join('')
      + '</div>'

    S.body.innerHTML =
      '<div class="term">'
      + '<div class="term-bar">'
      + '<span class="term-title">redis-cli<span class="meta">' + esc(hostMeta) + ' · db' + esc(S.activeDb) + '</span></span>'
      + '<span class="term-safe ' + (S.allowDangerous ? 'on' : 'off') + '" id="safeBadge" role="button" tabindex="0"></span></div>'
      + '<div class="term-out" id="termOut"></div>'
      + '<div class="term-chips" id="termChips">'
      + chipGroup(['PING', 'DBSIZE', 'INFO', 'INFO memory', 'INFO replication'])
      + chipGroup(['CLIENT LIST', 'SLOWLOG GET 10', 'MEMORY STATS', 'CONFIG GET maxmemory*'])
      + '</div>'
      + '<div class="term-compose">'
      + '<div class="term-suggest" id="termSuggest" role="listbox"></div>'
      + '<div class="term-in"><span class="ps1">redis&gt;</span>'
      + '<input id="cmd" spellcheck="false" autocomplete="off" placeholder="Command · Tab completes cmds/keys · ↑↓ history" />'
      + '<button type="button" class="btn btn-primary" id="run">Run</button></div></div></div>'

    paintTerm()
    syncSafeBadge()
    let lastResult = ''
    let sugItems = []
    let sugIdx = -1

    document.getElementById('btnClearTerm').onclick = () => {
      S.termLines = []
      lastResult = ''
      paintTerm()
    }
    document.getElementById('btnCopyLast').onclick = async () => {
      if (!lastResult) { toast('No result'); return }
      if (await copyText(lastResult)) toast('Copied')
      else toast('Clipboard unavailable')
    }
    const setDanger = (on) => {
      S.allowDangerous = !!on
      remember('redis.allowDangerous', S.allowDangerous ? '1' : '0')
      syncSafeBadge()
      toast(S.allowDangerous ? 'Danger mode enabled' : 'Danger mode disabled')
    }
    const badge = document.getElementById('safeBadge')
    badge.onclick = () => setDanger(!S.allowDangerous)
    badge.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDanger(!S.allowDangerous) } }

    const suggestEl = document.getElementById('termSuggest')
    let sugPrefix = ''
    const hideSuggest = () => {
      sugItems = []
      sugIdx = -1
      sugPrefix = ''
      suggestEl.classList.remove('open')
      suggestEl.innerHTML = ''
    }
    const paintSuggest = () => {
      if (!sugItems.length) { hideSuggest(); return }
      suggestEl.innerHTML = sugItems.map((it, i) =>
        '<button type="button" class="term-sug' + (it.kind === 'key' ? ' key' : '') + (i === sugIdx ? ' active' : '') + '" data-i="' + i + '" role="option">'
        + '<span class="sc">' + esc(it.c) + '</span><span class="sh">' + esc(it.h) + '</span></button>'
      ).join('')
      suggestEl.classList.add('open')
      suggestEl.querySelectorAll('.term-sug').forEach(btn => {
        btn.onmousedown = (e) => e.preventDefault()
        btn.onclick = () => applySuggest(Number(btn.dataset.i))
      })
      const active = suggestEl.querySelector('.term-sug.active')
      if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' })
    }
    const matchCmdPrefix = (trimmedUp) => {
      const sorted = REDIS_CMD_HINTS.slice().sort((a, b) => b.c.length - a.c.length)
      for (let i = 0; i < sorted.length; i++) {
        const c = sorted[i].c
        if (trimmedUp === c || trimmedUp.indexOf(c + ' ') === 0) return c
      }
      const first = trimmedUp.split(/\s+/)[0] || ''
      return first
    }
    const refreshSuggest = (q) => {
      const raw = String(q || '')
      const leadWs = (raw.match(/^\s*/) || [''])[0]
      const trimmed = raw.trimStart()
      if (!trimmed) { hideSuggest(); return }
      const up = trimmed.toUpperCase()

      if (!/\s/.test(trimmed)) {
        const hits = REDIS_CMD_HINTS
          .filter(it => it.c.indexOf(up) === 0 || it.c.replace(/\s+/g, '').indexOf(up.replace(/\s+/g, '')) === 0)
          .slice(0, 12)
          .map(it => ({ c: it.c, h: it.h, kind: 'cmd' }))
        if (!hits.length) { hideSuggest(); return }
        sugPrefix = leadWs
        sugItems = hits
        sugIdx = 0
        paintSuggest()
        return
      }

      const cmdName = matchCmdPrefix(up)
      if (!cmdName) { hideSuggest(); return }
      const after = trimmed.slice(cmdName.length)
      // only complete the first argument (key)
      if (!/^\s/.test(after) || /^\s+\S+\s+/.test(after)) { hideSuggest(); return }
      const frag = after.trimStart()
      const fragLow = frag.toLowerCase()
      const rows = (S.keyRows || []).slice()
      if (S.selectedKey && !rows.some(r => r.key === S.selectedKey)) {
        rows.unshift({ key: S.selectedKey, type: '?' })
      }
      if (!rows.length) { hideSuggest(); return }
      const hits = rows
        .filter(r => !fragLow || String(r.key).toLowerCase().indexOf(fragLow) >= 0)
        .slice(0, 12)
        .map(r => ({
          c: r.key,
          h: (r.type ? String(r.type).toLowerCase() : 'key') + (r.key === S.selectedKey ? ' · selected' : ''),
          kind: 'key'
        }))
      if (!hits.length) { hideSuggest(); return }
      sugPrefix = leadWs + cmdName + ' '
      sugItems = hits
      sugIdx = 0
      paintSuggest()
    }
    const applySuggest = (i) => {
      if (i < 0 || i >= sugItems.length) return
      const pick = sugItems[i]
      const cmd = document.getElementById('cmd')
      if (pick.kind === 'key') {
        cmd.value = sugPrefix + pick.c + ' '
      } else {
        cmd.value = sugPrefix + pick.c + ' '
      }
      hideSuggest()
      cmd.focus()
      const n = cmd.value.length
      cmd.setSelectionRange(n, n)
    }

    let running = false
    const run = async (raw) => {
      if (running) return
      hideSuggest()
      const input = document.getElementById('cmd')
      const runBtn = document.getElementById('run')
      const command = (raw != null ? raw : input.value).trim()
      if (!command) return
      const info = consoleDangerInfo(command)
      if (info.dangerous) {
        if (!S.allowDangerous) {
          S.termLines.push({ cls: 'prompt', text: 'redis> ' + command })
          S.termLines.push({ cls: 'err', text: 'Blocked: ' + info.verb + ' · enable Danger mode in the toolbar' })
          paintTerm()
          input.value = ''
          input.focus()
          return
        }
        if (!confirm('Confirm dangerous command\n\n' + command)) {
          toast('Cancelled')
          return
        }
      }
      running = true
      if (runBtn) { runBtn.disabled = true; runBtn.textContent = '…' }
      if (!S.cmdHistory.length || S.cmdHistory[S.cmdHistory.length - 1] !== command) S.cmdHistory.push(command)
      S.cmdHistIdx = S.cmdHistory.length
      S.termLines.push({ cls: 'prompt', text: 'redis> ' + command })
      input.value = ''
      paintTerm()
      try {
        const res = await invoke('redis/command', { command, allowDangerous: S.allowDangerous })
        if (res.blocked) {
          lastResult = res.message || 'blocked'
          S.termLines.push({ cls: 'err', text: lastResult })
        } else {
          lastResult = String(res.result ?? '')
          S.termLines.push({ cls: 'ok', text: lastResult, keyAct: RO.keys.keyFromRedisCommand(command) })
        }
      } catch (e) {
        lastResult = String(e && e.message ? e.message : e)
        S.termLines.push({ cls: 'err', text: lastResult })
      }
      paintTerm()
      running = false
      if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Run' }
      input.focus()
    }
    document.getElementById('termChips').onclick = (e) => {
      const btn = e.target.closest('[data-c]')
      if (!btn) return
      const c = btn.dataset.c
      if (e.shiftKey) {
        document.getElementById('cmd').value = c
        document.getElementById('cmd').focus()
        hideSuggest()
        return
      }
      run(c).catch(showErr)
    }
    document.getElementById('run').onclick = () => run().catch(showErr)
    const cmd = document.getElementById('cmd')
    if (S.pendingConsoleCmd) {
      cmd.value = S.pendingConsoleCmd
      S.pendingConsoleCmd = null
      cmd.focus()
      cmd.select()
    } else {
      cmd.focus()
    }
    cmd.oninput = () => refreshSuggest(cmd.value)
    cmd.onblur = () => setTimeout(hideSuggest, 120)
    cmd.onkeydown = (e) => {
      const sugOpen = suggestEl.classList.contains('open') && sugItems.length
      if (sugOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault()
        if (e.key === 'ArrowDown') sugIdx = Math.min(sugItems.length - 1, sugIdx + 1)
        else sugIdx = Math.max(0, sugIdx - 1)
        paintSuggest()
        return
      }
      if (sugOpen && e.key === 'Tab') {
        e.preventDefault()
        applySuggest(sugIdx >= 0 ? sugIdx : 0)
        return
      }
      if (sugOpen && e.key === 'Escape') {
        e.preventDefault()
        hideSuggest()
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (sugOpen && sugIdx >= 0) {
          const item = sugItems[sugIdx]
          if (item.kind === 'key') {
            applySuggest(sugIdx)
            return
          }
          const cur = cmd.value.trim().toUpperCase()
          if (!/\s/.test(cmd.value.trim()) && cur === item.c.toUpperCase()) {
            hideSuggest()
            run().catch(showErr)
          } else if (!/\s/.test(cmd.value.trim())) {
            applySuggest(sugIdx)
          } else {
            run().catch(showErr)
          }
          return
        }
        run().catch(showErr)
        return
      }
      if (e.key === 'ArrowUp' && !sugOpen) {
        e.preventDefault()
        if (!S.cmdHistory.length) return
        S.cmdHistIdx = Math.max(0, S.cmdHistIdx - 1)
        cmd.value = S.cmdHistory[S.cmdHistIdx] || ''
        hideSuggest()
        return
      }
      if (e.key === 'ArrowDown' && !sugOpen) {
        e.preventDefault()
        S.cmdHistIdx = Math.min(S.cmdHistory.length, S.cmdHistIdx + 1)
        cmd.value = S.cmdHistory[S.cmdHistIdx] || ''
        hideSuggest()
      }
    }
  }

  function paintTerm() {
    const out = document.getElementById('termOut')
    if (!out) return
    out.innerHTML = S.termLines.map(l => {
      let html = '<div class="' + l.cls + '">' + esc(l.text)
      if (l.keyAct) {
        html += ' <button type="button" class="term-key-act" data-key="' + esc(l.keyAct) + '">Open in Keys</button>'
      }
      return html + '</div>'
    }).join('')
    out.querySelectorAll('.term-key-act').forEach(btn => {
      btn.onclick = () => RO.keys.openKeyInBrowser(btn.dataset.key).catch(showErr)
    })
    out.scrollTop = out.scrollHeight
  }



    RO.console = { consoleDangerInfo, syncSafeBadge, loadConsole, paintTerm, REDIS_CMD_HINTS };

  
})();
