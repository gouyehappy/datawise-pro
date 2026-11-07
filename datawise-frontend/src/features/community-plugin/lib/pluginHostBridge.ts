/**
 * Host-side bridge for community plugin workbench iframes.
 * Injects / refreshes window.datawisePlugin (DataWise Host API shape for workbench plugins).
 * Binary/events use /ws/community-plugin-stream when the plugin declares host.binary.
 *
 * HTML served by the backend already embeds a bootstrap that creates datawisePlugin
 * before the plugin Vue module runs; injectEnv pushes context + theme via postMessage.
 */
import {API_PATHS} from '@/shared/api/http/paths'
import {readApiBaseUrl} from '@/shared/api/mode'
import {backendDevBaseUrl} from '@/shared/config/runtime-ports'
import {openAuthedWebSocket} from '@/shared/api/http/open-authed-websocket'
import {resolveScaledTerminalFontSize} from '@/shared/config/terminal-font-size'

export type PluginBridgeRequest = {
  type: 'datawise-plugin-request'
  id: string
  method: string
  params?: unknown
}

export type PluginBridgeResponse = {
  type: 'datawise-plugin-response'
  id: string
  result?: unknown
  error?: string
}

export type PluginHostTheme = {
  appearance: 'light' | 'dark'
  tokens: Record<string, string>
}

export type PluginHostAppearance = {
  colorScheme: 'light' | 'dark'
  colors: Record<string, string | undefined>
  terminal: {fontFamily: string | undefined; fontSize?: number | undefined}
  ui: {
    fontFamily: string | undefined
    /** Host shell font-size CSS value (follows uiTextScale). */
    fontSize?: string | undefined
    /** Host scale factor vs md body (e.g. "0.889" | "1" | "1.111", or custom px/13.5). */
    textScale?: string | undefined
    /** Host shell density id (sm / md / lg) — mirrors data-ui-density. */
    density?: string | undefined
  }
}

/** Stable host → plugin environment snapshot (hostApi HostInfo). */
export type PluginHostInfo = {
  protocolVersion: 1
  locale: string
  appearance: PluginHostAppearance
  theme: PluginHostTheme
  pluginId: string
  context: Record<string, unknown>
}

/**
 * Fallback plugin chrome when host `--dw-*` tokens are unavailable.
 * Dark defaults match host cool navy (`variables.css` dark) so iframe seams
 * don't flash warm grey before `collectPluginHostTheme` runs.
 */
const PLUGIN_WORKBENCH_PALETTE: Record<'light' | 'dark', Record<string, string>> = {
  light: {
    '--color-background': '#f8fafc',
    '--color-foreground': '#0f172a',
    '--color-muted': '#f1f5f9',
    '--color-muted-foreground': '#64748b',
    '--color-accent': '#e8eef5',
    '--color-accent-foreground': '#0f172a',
    '--color-border': 'rgba(15, 23, 42, 0.08)',
    '--color-destructive': '#e11d48',
    '--color-primary': '#2563eb',
    '--color-primary-foreground': '#fff',
    '--color-popover': '#f4f7fb',
    '--color-success': '#16a34a',
    '--color-warning': '#d97706',
    '--radius-md': '6px',
  },
  dark: {
    '--color-background': '#0c1015',
    '--color-foreground': '#f0f0f3',
    '--color-muted': '#121820',
    '--color-muted-foreground': '#c4c7cc',
    '--color-accent': '#1f2936',
    '--color-accent-foreground': '#f4f4f7',
    '--color-border': 'rgba(255, 255, 255, 0.12)',
    '--color-destructive': '#f87171',
    '--color-primary': '#3b82f6',
    '--color-primary-foreground': '#fff',
    '--color-popover': '#171e27',
    '--color-success': '#4ade80',
    '--color-warning': '#fbbf24',
    '--radius-md': '6px',
  },
}

function readCssVar(styles: CSSStyleDeclaration, name: string): string {
  return styles.getPropertyValue(name).trim()
}

/** Host light/dark + surfaces/primary/fonts so plugin chrome matches the shell. */
export function collectPluginHostTheme(): PluginHostTheme {
  if (typeof document === 'undefined') {
    return {appearance: 'dark', tokens: {...PLUGIN_WORKBENCH_PALETTE.dark}}
  }
  const root = document.documentElement
  const appearance = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
  const styles = getComputedStyle(root)
  const tokens: Record<string, string> = {...PLUGIN_WORKBENCH_PALETTE[appearance]}
  const map: Array<[string, string]> = [
    ['--color-background', '--dw-bg'],
    ['--color-muted', '--dw-bg-muted'],
    ['--color-popover', '--dw-bg-panel'],
    ['--color-accent', '--dw-bg-hover'],
    ['--color-foreground', '--dw-text'],
    ['--color-muted-foreground', '--dw-text-muted'],
    ['--color-border', '--dw-panel-border'],
    ['--color-primary', '--dw-primary'],
  ]
  for (const [pluginKey, hostKey] of map) {
    const value = readCssVar(styles, hostKey)
    if (value) tokens[pluginKey] = value
  }
  if (!tokens['--color-border']) {
    const border = readCssVar(styles, '--dw-border')
    if (border) tokens['--color-border'] = border
  }
  // Typography contract: host config wins; iframe-safe defaults only when absent.
  // (Host @font-face like Noto Variable is not visible in sandboxed iframes —
  //  shell stacks already include system fallbacks after the preferred family.)
  const PLUGIN_FONT_SANS =
    '"Segoe UI Variable", "Segoe UI", "PingFang SC", "Hiragino Sans GB", ' +
    '"Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif'
  const PLUGIN_FONT_MONO =
    'ui-monospace, "Cascadia Mono", "Sarasa Mono SC", "JetBrains Mono", ' +
    'SFMono-Regular, Menlo, Monaco, Consolas, monospace'
  tokens['--plugin-font-sans'] = PLUGIN_FONT_SANS
  tokens['--plugin-font-mono'] = PLUGIN_FONT_MONO
  const fontSans =
    readCssVar(styles, '--dw-font')
    || readCssVar(styles, '--font-sans')
    || styles.fontFamily
    || ''
  if (fontSans) {
    tokens['--dw-font'] = fontSans
    tokens['--font-sans'] = fontSans
  } else {
    tokens['--dw-font'] = PLUGIN_FONT_SANS
    tokens['--font-sans'] = PLUGIN_FONT_SANS
  }
  const fontMono =
    readCssVar(styles, '--dw-font-mono')
    || readCssVar(styles, '--font-mono')
    || ''
  if (fontMono) {
    tokens['--font-mono'] = fontMono
    tokens['--dw-font-mono'] = fontMono
  } else {
    tokens['--font-mono'] = PLUGIN_FONT_MONO
    tokens['--dw-font-mono'] = PLUGIN_FONT_MONO
  }
  // Text scale + body size for plugins. Bootstrap rem root =
  // calc(var(--dw-font-size) / 0.875) so Tailwind text-sm ≈ shell body.
  const textScale = readCssVar(styles, '--dw-ui-text-scale') || '1'
  tokens['--dw-ui-text-scale'] = textScale
  // Prefer --dw-font-size; --font-size kept one release as compat alias for older plugins.
  const fontSize = readCssVar(styles, '--dw-font-size')
  if (fontSize) {
    tokens['--dw-font-size'] = fontSize
    tokens['--font-size'] = fontSize
  }
  for (const key of [
    '--dw-text-2xs',
    '--dw-text-xs',
    '--dw-text-sm',
    '--dw-text-md',
    '--dw-text-lg',
    '--dw-text-xl',
  ] as const) {
    const value = readCssVar(styles, key)
    if (value) tokens[key] = value
  }
  // Density ladder — bootstrap writes these as inline vars; plugins size chrome with them.
  for (const key of [
    '--dw-density-xs',
    '--dw-density-sm',
    '--dw-density-md',
    '--dw-density-lg',
    '--dw-density-xl',
  ] as const) {
    const value = readCssVar(styles, key)
    if (value) tokens[key] = value
  }
  const densityAttr = root.getAttribute('data-ui-density')
  if (densityAttr === 'sm' || densityAttr === 'md' || densityAttr === 'lg') {
    tokens['--dw-ui-density'] = densityAttr
  }
  return {appearance, tokens}
}

function resolvePluginStreamUrl(pluginId: string): string {
  const params = new URLSearchParams()
  params.set('pluginId', pluginId)
  const query = `?${params.toString()}`
  const path = '/ws/community-plugin-stream'
  const configured = readApiBaseUrl()
  if (configured) {
    const protocol = configured.startsWith('https://') ? 'wss://' : 'ws://'
    const host = configured.replace(/^https?:\/\//, '')
    return `${protocol}${host}${path}${query}`
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}${path}${query}`
  }
  return `${backendDevBaseUrl('127.0.0.1').replace(/^http/, 'ws')}${path}${query}`
}

function openAuthedSocket(url: string): WebSocket {
  return openAuthedWebSocket(url)
}

function encodeBinaryPayload(channel: string, data: Uint8Array): ArrayBuffer {
  const channelBytes = new TextEncoder().encode(channel)
  const out = new Uint8Array(2 + channelBytes.length + data.length)
  out[0] = (channelBytes.length >> 8) & 0xff
  out[1] = channelBytes.length & 0xff
  out.set(channelBytes, 2)
  out.set(data, 2 + channelBytes.length)
  return out.buffer
}

function decodeBinaryPayload(buffer: ArrayBuffer): {channel: string; data: Uint8Array} {
  const bytes = new Uint8Array(buffer)
  if (bytes.length < 2) throw new Error('Invalid binary payload')
  const channelLen = (bytes[0] << 8) | bytes[1]
  if (channelLen <= 0 || bytes.length < 2 + channelLen) throw new Error('Invalid binary channel')
  const channel = new TextDecoder().decode(bytes.subarray(2, 2 + channelLen))
  const data = bytes.subarray(2 + channelLen)
  return {channel, data}
}

/**
 * High-rate streams that must keep flowing while a KeepAlive workbench is
 * paused. Dropping these creates sequence holes (terminal) or frozen screens
 * (VNC/RDP); the inactive iframe can still accept postMessage cheaply.
 */
function isRealtimeBinaryChannel(channel: string): boolean {
  return (
    channel.includes('/terminal/out/') ||
    channel.startsWith('vnc/frame/') ||
    channel.startsWith('rdp/frame/')
  )
}

function postPluginBinary(target: Window, channel: string, data: Uint8Array) {
  // One owned copy at most: WS views share the socket buffer and cannot be
  // transferred; a standalone buffer can be transferred without an extra slice.
  const owned =
    data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
      ? data
      : data.slice()
  try {
    target.postMessage(
      {
        type: 'datawise-plugin-binary',
        channel,
        data: owned,
      },
      '*',
      [owned.buffer],
    )
  } catch {
    // Transfer unsupported (rare CEF builds): structured-clone the same owned
    // bytes — do not slice a second time.
    target.postMessage(
      {
        type: 'datawise-plugin-binary',
        channel,
        data: owned,
      },
      '*',
    )
  }
}

function appearanceFromTheme(theme: PluginHostTheme): PluginHostAppearance {
  return {
    colorScheme: theme.appearance,
    colors: {
      background: theme.tokens['--color-background'],
      foreground: theme.tokens['--color-foreground'],
      muted: theme.tokens['--color-muted'],
      mutedForeground: theme.tokens['--color-muted-foreground'],
      accent: theme.tokens['--color-accent'],
      accentForeground: theme.tokens['--color-accent-foreground'],
      border: theme.tokens['--color-border'],
      destructive: theme.tokens['--color-destructive'],
    },
    terminal: {
      fontFamily: theme.tokens['--font-mono'],
      fontSize: resolveScaledTerminalFontSize(),
    },
    ui: {
      fontFamily: theme.tokens['--font-sans'],
      fontSize: theme.tokens['--dw-font-size'] || theme.tokens['--font-size'],
      textScale: theme.tokens['--dw-ui-text-scale'] || '1',
      density: theme.tokens['--dw-ui-density'] || 'md',
    },
  }
}

export function createPluginHostBridge(options: {
  pluginId: string
  /** Static locale or live getter — Prefer a getter so SPA language switches push fresh env. */
  locale?: string | (() => string)
  /** Initial host context for workbench (`connectionId` / `workbenchId` / `connection`). */
  context?: Record<string, unknown>
  /** Bound iframe window — multi KeepAlive hosts must ignore other frames' messages. */
  getIframeWindow?: () => Window | null
  /**
   * Open `/ws/community-plugin-stream`. Requires manifest `host.binary` +
   * stdio-framed transport. Leave false/unset for jsonl-only plugins.
   * May be a getter so the host can resolve permissions after mount.
   */
  enableBinaryStream?: boolean | (() => boolean)
  /** Manifest declares `host.sql`. Gates list / execute / open-console. */
  enableSql?: boolean | (() => boolean)
  /** Manifest declares `host.ai`. Gates status / chat (host default LLM; no API keys to plugin). */
  enableAi?: boolean | (() => boolean)
  invoke: (method: string, params?: unknown) => Promise<unknown>
  notify?: (method: string, params?: unknown) => Promise<void>
  onReady?: () => void
  /** Open another workbench tab (plugin "New session"). */
  openWorkbench?: (
    contributionId: string,
    context?: Record<string, unknown>,
    openOptions?: {forceNew?: boolean},
  ) => Promise<void>
  /** Re-push connection credentials into the sidecar after host restart / edit. */
  reopenConnection?: (connectionId: string) => Promise<unknown>
  /** Open community-workbench instance ids for this plugin (batch-send inventory). */
  listOpenWorkbenches?: () => Promise<{workbenchIds: string[]}> | {workbenchIds: string[]}
  /**
   * Persist ConnectionConfig drafts into the explorer connection list
   * (`host.importConnections` / `host.createConnections`). Generic — any
   * community plugin may pass fully-formed configs (typically dbType=plugin).
   */
  importConnections?: (connections: unknown[]) => Promise<{count: number}>
  /**
   * hostApi 1.2 UI storage backing `datawisePlugin.storage` — opaque-origin
   * frames have no localStorage, so UI persistence runs through the host.
   */
  storage?: {
    getAll: () => Promise<Record<string, string>>
    setEntries: (entries: Record<string, string | null>) => Promise<void>
  }
}) {
  let stream: WebSocket | null = null
  let iframeWindow: Window | null = null
  let listening = false
  let paused = false
  let currentContext: Record<string, unknown> = {
    pluginId: options.pluginId,
    ...(options.context || {}),
  }
  let currentTheme: PluginHostTheme = collectPluginHostTheme()
  let currentLocale =
    typeof options.locale === 'function' ? options.locale() || 'en' : options.locale || 'en'
  const savePaths = new Map<string, string>()
  /** Active host.ai chat streams keyed by requestId (for cancel). */
  const aiChatAborts = new Map<string, AbortController>()

  function resolveLocale(): string {
    if (typeof options.locale === 'function') {
      const live = options.locale()
      if (live && live.trim()) currentLocale = live.trim()
    }
    return currentLocale || 'en'
  }

  function buildHostInfo(): PluginHostInfo {
    return {
      protocolVersion: 1,
      locale: resolveLocale(),
      appearance: appearanceFromTheme(currentTheme),
      theme: currentTheme,
      pluginId: options.pluginId,
      context: currentContext,
    }
  }

  function boundWindow(): Window | null {
    return options.getIframeWindow?.() ?? iframeWindow
  }

  function reply(frame: Window | null, id: string, result?: unknown, error?: string) {
    frame?.postMessage(
      {
        type: 'datawise-plugin-response',
        id,
        ...(error ? {error} : {result}),
      } satisfies PluginBridgeResponse,
      '*',
    )
  }

  function binaryStreamEnabled(): boolean {
    const flag = options.enableBinaryStream
    return typeof flag === 'function' ? flag() : Boolean(flag)
  }

  function sqlEnabled(): boolean {
    const flag = options.enableSql
    return typeof flag === 'function' ? flag() : Boolean(flag)
  }

  function aiEnabled(): boolean {
    const flag = options.enableAi
    return typeof flag === 'function' ? flag() : Boolean(flag)
  }

  function emitPluginEvent(method: string, params: Record<string, unknown>) {
    const target = boundWindow()
    if (!target) return
    target.postMessage({type: 'datawise-plugin-event', method, params}, '*')
  }

  function ensureStream(): WebSocket | null {
    if (!binaryStreamEnabled()) {
      return null
    }
    if (stream && (stream.readyState === WebSocket.OPEN || stream.readyState === WebSocket.CONNECTING)) {
      return stream
    }
    const ws = openAuthedSocket(resolvePluginStreamUrl(options.pluginId))
    stream = ws
    ws.binaryType = 'arraybuffer'
    ws.onmessage = (event) => {
      const target = boundWindow()
      if (!target) return
      if (typeof event.data === 'string') {
        // JSON-RPC events stay paused with the tab (not sequence-critical).
        if (paused) return
        try {
          const msg = JSON.parse(event.data) as {type?: string; method?: string; params?: unknown}
          if (msg.type === 'event' && msg.method) {
            target.postMessage(
              {type: 'datawise-plugin-event', method: msg.method, params: msg.params ?? {}},
              '*',
            )
          }
        } catch {
          // ignore
        }
        return
      }
      if (event.data instanceof ArrayBuffer) {
        try {
          const decoded = decodeBinaryPayload(event.data)
          // Terminal / remote-desktop frames must not be dropped while paused:
          // ordered terminal drain freezes on any sequence hole until replay.
          if (paused && !isRealtimeBinaryChannel(decoded.channel)) return
          postPluginBinary(target, decoded.channel, decoded.data)
        } catch {
          // ignore
        }
      }
    }
    return ws
  }

  function sendBinary(channel: string, data: Uint8Array | ArrayBuffer | string) {
    const ws = ensureStream()
    if (!ws) {
      return Promise.reject(new Error('Plugin binary stream is not enabled (host.binary required)'))
    }
    const bytes =
      typeof data === 'string'
        ? new TextEncoder().encode(data)
        : data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : data
    const payload = encodeBinaryPayload(channel, bytes)
    const send = () => ws.send(payload)
    if (ws.readyState === WebSocket.OPEN) {
      send()
      return Promise.resolve()
    }
    return new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        ws.removeEventListener('open', onOpen)
        try {
          send()
          resolve()
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)))
        }
      }
      ws.addEventListener('open', onOpen)
      ws.addEventListener('error', () => reject(new Error('Plugin stream WebSocket failed')), {once: true})
    })
  }

  function postEnv(win: Window) {
    const info = buildHostInfo()
    win.postMessage(
      {
        type: 'datawise-plugin-env',
        protocolVersion: info.protocolVersion,
        pluginId: info.pluginId,
        locale: info.locale,
        context: info.context,
        theme: info.theme,
        appearance: info.appearance,
      },
      '*',
    )
  }

  /** Tell the iframe whether this KeepAlive host is the focused workbench. */
  function postActive(active: boolean) {
    const win = boundWindow()
    if (!win) return
    try {
      win.postMessage({type: 'datawise-plugin-active', active}, '*')
    } catch {
      // ignore
    }
  }

  function onMessage(event: MessageEvent) {
    // KeepAlive caches multiple hosts; each must only accept its own iframe.
    const expected = boundWindow()
    if (!expected || event.source !== expected) return

    const data = event.data as
      | PluginBridgeRequest
      | {type: 'datawise-plugin-binary-out'; channel: string; dataBase64: string}
      | {type: 'datawise-plugin-notify'; method: string; params?: unknown}
      | {type: 'datawise-plugin-bridge-hello'}
      | undefined
    if (!data || typeof data !== 'object') return

    // Hello must run even while paused (e.g. CEF first-paint warming): otherwise
    // the iframe never gets env and plugin boot hangs on datawisePlugin.ready /
    // unanswered invokes. Only RPC traffic is deferred until resume().
    if (data.type === 'datawise-plugin-bridge-hello') {
      const frame = event.source as Window | null
      if (frame) {
        iframeWindow = frame
        ensureStream()
        postEnv(frame)
        options.onReady?.()
      }
      return
    }

    if (paused) return

    if (data.type === 'datawise-plugin-binary-out' && 'channel' in data) {
      try {
        const msg = data as {
          channel: string
          data?: Uint8Array | ArrayBuffer
          dataBase64?: string
        }
        let bytes: Uint8Array
        if (msg.data instanceof Uint8Array) {
          bytes = msg.data
        } else if (msg.data instanceof ArrayBuffer) {
          bytes = new Uint8Array(msg.data)
        } else if (typeof msg.dataBase64 === 'string' && msg.dataBase64) {
          const raw = atob(msg.dataBase64)
          bytes = new Uint8Array(raw.length)
          for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
        } else {
          return
        }
        void sendBinary(msg.channel, bytes)
      } catch {
        // ignore
      }
      return
    }

    if (data.type === 'datawise-plugin-notify' && 'method' in data) {
      const notify = options.notify ?? ((method, params) => options.invoke(method, params).then(() => undefined))
      void notify(data.method, data.params).catch(() => undefined)
      return
    }

    if (data.type !== 'datawise-plugin-request' || !('id' in data) || !data.id) return
    const frame = event.source as Window | null
    if (data.method === 'host.getContext') {
      reply(frame, data.id, currentContext)
      return
    }
    if (data.method === 'host.getHostInfo') {
      currentTheme = collectPluginHostTheme()
      const info = buildHostInfo()
      if (frame) postEnv(frame)
      reply(frame, data.id, info)
      return
    }
    if (data.method === 'host.openWorkbench') {
      const params = (data.params && typeof data.params === 'object' ? data.params : {}) as {
        contributionId?: string
        context?: Record<string, unknown>
        options?: {forceNew?: boolean}
      }
      const contributionId = typeof params.contributionId === 'string' ? params.contributionId : ''
      if (!contributionId || !options.openWorkbench) {
        reply(frame, data.id, undefined, 'host.openWorkbench is not available')
        return
      }
      void options
        .openWorkbench(contributionId, params.context, params.options)
        .then(() => reply(frame, data.id, {ok: true}))
        .catch((err: unknown) =>
          reply(frame, data.id, undefined, err instanceof Error ? err.message : String(err)),
        )
      return
    }
    if (data.method === 'host.reopenConnection') {
      const params = (data.params && typeof data.params === 'object' ? data.params : {}) as {
        connectionId?: string
      }
      const connectionId = typeof params.connectionId === 'string' ? params.connectionId.trim() : ''
      if (!connectionId || !options.reopenConnection) {
        reply(frame, data.id, undefined, 'host.reopenConnection is not available')
        return
      }
      void options
        .reopenConnection(connectionId)
        .then((result) => reply(frame, data.id, result ?? {ok: true}))
        .catch((err: unknown) =>
          reply(frame, data.id, undefined, err instanceof Error ? err.message : String(err)),
        )
      return
    }
    if (data.method === 'host.listOpenWorkbenches') {
      if (!options.listOpenWorkbenches) {
        reply(frame, data.id, {workbenchIds: []})
        return
      }
      void Promise.resolve(options.listOpenWorkbenches())
        .then((result) => {
          const ids = Array.isArray(result?.workbenchIds)
            ? result.workbenchIds.filter((id): id is string => typeof id === 'string' && !!id.trim())
            : []
          reply(frame, data.id, {workbenchIds: ids})
        })
        .catch((err: unknown) =>
          reply(frame, data.id, undefined, err instanceof Error ? err.message : String(err)),
        )
      return
    }
    if (data.method === 'host.importConnections' || data.method === 'host.createConnections') {
      if (!options.importConnections) {
        reply(frame, data.id, undefined, 'host.importConnections is not available')
        return
      }
      const params = (data.params && typeof data.params === 'object' ? data.params : {}) as {
        connections?: unknown
      }
      const connections = Array.isArray(params.connections) ? params.connections : []
      void options
        .importConnections(connections)
        .then((result) => reply(frame, data.id, {count: Math.max(0, Math.floor(result?.count ?? 0))}))
        .catch((err: unknown) =>
          reply(frame, data.id, undefined, err instanceof Error ? err.message : String(err)),
        )
      return
    }
    if (data.method === 'host.storage.getAll') {
      if (!options.storage) {
        reply(frame, data.id, {values: {}})
        return
      }
      void options
        .storage.getAll()
        .then((values) => reply(frame, data.id, {values}))
        .catch((err: unknown) =>
          reply(frame, data.id, undefined, err instanceof Error ? err.message : String(err)),
        )
      return
    }
    if (data.method === 'host.storage.get') {
      const params = (data.params && typeof data.params === 'object' ? data.params : {}) as {key?: unknown}
      const key = typeof params.key === 'string' ? params.key : ''
      if (!key || !options.storage) {
        reply(frame, data.id, {value: null})
        return
      }
      void options
        .storage.getAll()
        .then((values) => reply(frame, data.id, {value: values[key] ?? null}))
        .catch((err: unknown) =>
          reply(frame, data.id, undefined, err instanceof Error ? err.message : String(err)),
        )
      return
    }
    if (data.method === 'host.storage.set' || data.method === 'host.storage.remove') {
      const params = (data.params && typeof data.params === 'object' ? data.params : {}) as {
        key?: unknown
        value?: unknown
      }
      const key = typeof params.key === 'string' ? params.key.trim() : ''
      const isRemove = data.method === 'host.storage.remove'
      if (!key || !options.storage) {
        reply(frame, data.id, {ok: false}, 'host.storage is not available')
        return
      }
      const value = isRemove || params.value == null ? null : String(params.value)
      void options
        .storage.setEntries({[key]: value})
        .then(() => reply(frame, data.id, {ok: true}))
        .catch((err: unknown) =>
          reply(frame, data.id, undefined, err instanceof Error ? err.message : String(err)),
        )
      return
    }
    if (data.method === 'host.pickSaveFile') {
      const params = (data.params && typeof data.params === 'object' ? data.params : {}) as {
        suggestedName?: unknown
        extension?: unknown
      }
      const suggestedName =
        typeof params.suggestedName === 'string' && params.suggestedName.trim()
          ? params.suggestedName.trim()
          : 'download'
      const extension =
        typeof params.extension === 'string' && params.extension.trim()
          ? params.extension.trim().replace(/^\./, '')
          : suggestedName.includes('.')
            ? suggestedName.slice(suggestedName.lastIndexOf('.') + 1)
            : ''
      const selectSaveFile = window.datawise?.fs?.selectSaveFile
      if (!selectSaveFile) {
        reply(frame, data.id, {unsupported: true})
        return
      }
      void selectSaveFile(suggestedName, extension)
        .then((path) => {
          if (!path) {
            reply(frame, data.id, {cancelled: true})
            return
          }
          const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
          savePaths.set(id, path)
          window.setTimeout(() => savePaths.delete(id), 120000)
          const name = path.split(/[/\\]/).pop() || suggestedName
          reply(frame, data.id, {id, name, path})
        })
        .catch((err: unknown) => {
          reply(frame, data.id, undefined, err instanceof Error ? err.message : String(err))
        })
      return
    }
    if (data.method === 'host.pickOpenFile') {
      const params = (data.params && typeof data.params === 'object' ? data.params : {}) as {
        extension?: unknown
      }
      const extension =
        typeof params.extension === 'string' && params.extension.trim()
          ? params.extension.trim().replace(/^\./, '')
          : ''
      const selectFile = window.datawise?.fs?.selectFile
      if (!selectFile) {
        reply(frame, data.id, {unsupported: true})
        return
      }
      void selectFile(extension || undefined)
        .then((path) => {
          if (!path) {
            reply(frame, data.id, {cancelled: true})
            return
          }
          const name = path.split(/[/\\]/).pop() || path
          reply(frame, data.id, {path, name})
        })
        .catch((err: unknown) => {
          reply(frame, data.id, undefined, err instanceof Error ? err.message : String(err))
        })
      return
    }
    if (data.method === 'host.pickDirectory') {
      const selectDirectory = window.datawise?.fs?.selectDirectory
      if (!selectDirectory) {
        reply(frame, data.id, {unsupported: true})
        return
      }
      void selectDirectory()
        .then((path) => {
          if (!path) {
            reply(frame, data.id, {cancelled: true})
            return
          }
          const name = path.split(/[/\\]/).pop() || path
          reply(frame, data.id, {path, name})
        })
        .catch((err: unknown) => {
          reply(frame, data.id, undefined, err instanceof Error ? err.message : String(err))
        })
      return
    }
    if (data.method === 'host.writeSaveFile') {
      const params = (data.params && typeof data.params === 'object' ? data.params : {}) as {
        id?: unknown
        contentBase64?: unknown
      }
      const id = typeof params.id === 'string' ? params.id : ''
      const path = id ? savePaths.get(id) : undefined
      const contentBase64 = typeof params.contentBase64 === 'string' ? params.contentBase64 : ''
      const writeBinaryFile = window.datawise?.fs?.writeBinaryFile
      if (!path || !contentBase64 || !writeBinaryFile) {
        reply(frame, data.id, undefined, '保存已失效，请重新下载')
        return
      }
      savePaths.delete(id)
      void writeBinaryFile(path, contentBase64)
        .then((result) => {
          if (!result?.ok) {
            reply(frame, data.id, undefined, result?.error || '写入失败')
            return
          }
          const saved = result.path || path
          reply(frame, data.id, {ok: true, path: saved, name: saved.split(/[/\\]/).pop() || saved})
        })
        .catch((err: unknown) => {
          reply(frame, data.id, undefined, err instanceof Error ? err.message : String(err))
        })
      return
    }
    if (data.method === 'host.sql.listConnections' || data.method === 'host.sql.executeReadonly') {
      if (!sqlEnabled()) {
        reply(frame, data.id, undefined, 'permission host.sql is required')
        return
      }
      const path =
        data.method === 'host.sql.listConnections'
          ? API_PATHS.communityPlugins.sqlConnections(options.pluginId)
          : API_PATHS.communityPlugins.sqlExecute(options.pluginId)
      const params = (data.params && typeof data.params === 'object' ? data.params : {}) as Record<string, unknown>
      void import('@/shared/api/http/request')
        .then(({getJson, postJson}) =>
          data.method === 'host.sql.listConnections'
            ? getJson(path, undefined, {silent: true, timeoutMs: 20_000})
            : postJson(path, params, {silent: true, timeoutMs: 120_000}),
        )
        .then((result) => reply(frame, data.id, result))
        .catch((err: unknown) =>
          reply(frame, data.id, undefined, err instanceof Error ? err.message : String(err)),
        )
      return
    }
    if (data.method === 'host.sql.openConsole') {
      if (!sqlEnabled()) {
        reply(frame, data.id, undefined, 'permission host.sql is required')
        return
      }
      const params = (data.params && typeof data.params === 'object' ? data.params : {}) as {
        connectionId?: unknown
        database?: unknown
        sql?: unknown
        title?: unknown
      }
      const connectionId = typeof params.connectionId === 'string' ? params.connectionId.trim() : ''
      const sql = typeof params.sql === 'string' ? params.sql : ''
      if (!connectionId || !sql.trim()) {
        reply(frame, data.id, undefined, 'connectionId and sql are required')
        return
      }
      void import('@/features/workspace/stores/workspace')
        .then(({useWorkspaceStore}) =>
          useWorkspaceStore().openConsole({
            connectionId,
            database: typeof params.database === 'string' ? params.database : undefined,
            sql,
            title: typeof params.title === 'string' ? params.title : undefined,
          }),
        )
        .then(() => reply(frame, data.id, {ok: true}))
        .catch((err: unknown) =>
          reply(frame, data.id, undefined, err instanceof Error ? err.message : String(err)),
        )
      return
    }
    if (data.method === 'host.ai.status') {
      if (!aiEnabled()) {
        reply(frame, data.id, undefined, 'permission host.ai is required')
        return
      }
      void import('@/shared/api/http/request')
        .then(({getJson}) =>
          getJson(API_PATHS.communityPlugins.aiStatus(options.pluginId), undefined, {
            silent: true,
            timeoutMs: 15_000,
          }),
        )
        .then((result) => reply(frame, data.id, result))
        .catch((err: unknown) =>
          reply(frame, data.id, undefined, err instanceof Error ? err.message : String(err)),
        )
      return
    }
    if (data.method === 'host.ai.chat') {
      if (!aiEnabled()) {
        reply(frame, data.id, undefined, 'permission host.ai is required')
        return
      }
      const params = (data.params && typeof data.params === 'object' ? data.params : {}) as {
        prompt?: unknown
        systemPrompt?: unknown
        requestId?: unknown
        stream?: unknown
      }
      const prompt = typeof params.prompt === 'string' ? params.prompt : ''
      if (!prompt.trim()) {
        reply(frame, data.id, undefined, 'prompt is required')
        return
      }
      const requestId =
        typeof params.requestId === 'string' && params.requestId.trim()
          ? params.requestId.trim()
          : `host-ai-${Date.now()}`
      const wantStream = params.stream !== false
      if (!wantStream) {
        void import('@/shared/api/http/request')
          .then(({postJson}) =>
            postJson(
              API_PATHS.communityPlugins.aiChat(options.pluginId),
              {
                prompt,
                systemPrompt: typeof params.systemPrompt === 'string' ? params.systemPrompt : undefined,
              },
              {silent: true, timeoutMs: 180_000},
            ),
          )
          .then((result) => reply(frame, data.id, result))
          .catch((err: unknown) =>
            reply(frame, data.id, undefined, err instanceof Error ? err.message : String(err)),
          )
        return
      }
      const abort = new AbortController()
      aiChatAborts.set(requestId, abort)
      void (async () => {
        try {
          const {buildApiUrl, buildSessionHeaders} = await import('@/shared/api/http/request')
          const {parseSseBlock} = await import('@/shared/utils/sse')
          const response = await fetch(buildApiUrl(API_PATHS.communityPlugins.aiChatStream(options.pluginId)), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'text/event-stream',
              ...buildSessionHeaders(),
            },
            body: JSON.stringify({
              prompt,
              systemPrompt: typeof params.systemPrompt === 'string' ? params.systemPrompt : undefined,
            }),
            credentials: 'include',
            signal: abort.signal,
          })
          if (!response.ok || !response.body) {
            throw new Error(`HTTP ${response.status}`)
          }
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          let finalResult: unknown
          while (true) {
            const {done, value} = await reader.read()
            if (done) break
            buffer += decoder.decode(value, {stream: true})
            const blocks = buffer.split('\n\n')
            buffer = blocks.pop() ?? ''
            for (const block of blocks) {
              const parsed = parseSseBlock(block.trim())
              if (!parsed) continue
              if (parsed.event === 'delta') {
                let delta = ''
                let thinkingDelta = ''
                try {
                  const asJson = JSON.parse(parsed.data) as unknown
                  if (typeof asJson === 'string') {
                    delta = asJson
                  } else if (asJson && typeof asJson === 'object') {
                    const obj = asJson as Record<string, unknown>
                    if (typeof obj.delta === 'string') delta = obj.delta
                    else if (typeof obj.content === 'string') delta = obj.content
                    if (typeof obj.thinkingDelta === 'string') thinkingDelta = obj.thinkingDelta
                    else if (typeof obj.reasoning_content === 'string') thinkingDelta = obj.reasoning_content
                    else if (typeof obj.reasoning === 'string') thinkingDelta = obj.reasoning
                    else if (typeof obj.thinking === 'string') thinkingDelta = obj.thinking
                  } else {
                    delta = parsed.data
                  }
                } catch {
                  delta = parsed.data
                }
                if (delta || thinkingDelta) {
                  emitPluginEvent('host.ai.chat.delta', {
                    requestId,
                    ...(delta ? {delta} : {}),
                    ...(thinkingDelta ? {thinkingDelta} : {}),
                  })
                }
                continue
              }
              if (parsed.event === 'result') {
                try {
                  finalResult = JSON.parse(parsed.data)
                } catch {
                  finalResult = {reply: parsed.data, source: 'host'}
                }
                continue
              }
              if (parsed.event === 'error') {
                throw new Error(parsed.data || 'host AI stream failed')
              }
            }
          }
          if (!finalResult) {
            throw new Error('host AI stream ended without result')
          }
          reply(frame, data.id, finalResult)
        } catch (err: unknown) {
          if (abort.signal.aborted) {
            reply(frame, data.id, undefined, 'cancelled')
          } else {
            reply(frame, data.id, undefined, err instanceof Error ? err.message : String(err))
          }
        } finally {
          aiChatAborts.delete(requestId)
        }
      })()
      return
    }
    if (data.method === 'host.ai.chatCancel') {
      if (!aiEnabled()) {
        reply(frame, data.id, undefined, 'permission host.ai is required')
        return
      }
      const params = (data.params && typeof data.params === 'object' ? data.params : {}) as {
        requestId?: unknown
      }
      const requestId = typeof params.requestId === 'string' ? params.requestId.trim() : ''
      if (!requestId) {
        reply(frame, data.id, undefined, 'requestId is required')
        return
      }
      const ctrl = aiChatAborts.get(requestId)
      if (ctrl) {
        ctrl.abort()
        aiChatAborts.delete(requestId)
      }
      reply(frame, data.id, {ok: true, cancelled: Boolean(ctrl)})
      return
    }
    if (data.method === 'host.clipboard.readText') {
      void import('@/shared/browser/app-clipboard')
        .then(({readClipboardText}) => readClipboardText())
        .then((text) => reply(frame, data.id, {text: text ?? ''}))
        .catch((err: unknown) =>
          reply(frame, data.id, undefined, err instanceof Error ? err.message : String(err)),
        )
      return
    }
    if (data.method === 'host.clipboard.writeText') {
      const params = (data.params && typeof data.params === 'object' ? data.params : {}) as {text?: unknown}
      const text = typeof params.text === 'string' ? params.text : String(params.text ?? '')
      void import('@/shared/browser/app-clipboard')
        .then(({writeClipboardText}) => writeClipboardText(text))
        .then((ok) => {
          if (!ok) {
            reply(frame, data.id, undefined, 'clipboard write failed')
            return
          }
          reply(frame, data.id, {ok: true})
        })
        .catch((err: unknown) =>
          reply(frame, data.id, undefined, err instanceof Error ? err.message : String(err)),
        )
      return
    }
    if (data.method === 'host.openExternal') {
      const params = (data.params && typeof data.params === 'object' ? data.params : {}) as {url?: unknown}
      const url = typeof params.url === 'string' ? params.url.trim() : String(params.url ?? '').trim()
      void import('@/shared/browser/open-url')
        .then(async ({isHttpUrl, openUrl}) => {
          if (!isHttpUrl(url)) {
            reply(frame, data.id, undefined, 'only http(s) urls are allowed')
            return
          }
          const ok = await openUrl(url)
          if (!ok) {
            reply(frame, data.id, undefined, 'failed to open url')
            return
          }
          reply(frame, data.id, {ok: true})
        })
        .catch((err: unknown) =>
          reply(frame, data.id, undefined, err instanceof Error ? err.message : String(err)),
        )
      return
    }
    void options
      .invoke(data.method, data.params)
      .then((result) => {
        reply(frame, data.id, result)
      })
      .catch((err: unknown) => {
        reply(frame, data.id, undefined, err instanceof Error ? err.message : String(err))
      })
  }

  function injectEnv(iframe: HTMLIFrameElement, context?: Record<string, unknown>, theme?: PluginHostTheme) {
    try {
      const win = iframe.contentWindow
      if (!win) return
      iframeWindow = win
      if (context) {
        currentContext = {pluginId: options.pluginId, ...context}
        const ctxLocale = context.locale
        if (typeof ctxLocale === 'string' && ctxLocale.trim()) {
          currentLocale = ctxLocale.trim()
        }
      }
      resolveLocale()
      if (theme) {
        currentTheme = theme
      } else {
        currentTheme = collectPluginHostTheme()
      }
      ensureStream()
      postEnv(win)

      // Same-origin fallback: refresh live API if bootstrap is missing (older packages).
      // Cross-origin iframes throw here — postMessage path above is enough then.
      try {
        const doc = iframe.contentDocument
        if (!doc) return
        const existing = doc.getElementById('datawise-plugin-bridge')
          || doc.getElementById('datawise-plugin-bridge-bootstrap')
        if (existing) {
          try {
            const api = (win as Window & {
              datawisePlugin?: {
                context?: Record<string, unknown>
                ready?: Promise<Record<string, unknown>>
                theme?: PluginHostTheme | null
                appearance?: ReturnType<typeof appearanceFromTheme> | null
                locale?: string
              }
            }).datawisePlugin
            if (api) {
              const info = buildHostInfo()
              api.context = currentContext
              api.ready = Promise.resolve(currentContext)
              api.theme = info.theme
              api.appearance = info.appearance
              api.locale = info.locale
              win.postMessage({type: 'datawise-plugin-context', context: currentContext}, '*')
            }
          } catch {
            // ignore
          }
          options.onReady?.()
        }
        // Workbench frames run at an opaque origin (sandbox="allow-scripts"): the
        // postMessage env path above is the only channel — the host ships exactly
        // one bridge, injected server-side.
      } catch {
        // Cross-origin iframes throw here — postMessage path above is enough then.
      }
    } catch {
      // Never let inject failures take down the host SPA.
    }
  }

  return {
    attach() {
      if (listening) return
      window.addEventListener('message', onMessage)
      listening = true
      paused = false
    },
    detach() {
      if (listening) {
        window.removeEventListener('message', onMessage)
        listening = false
      }
      paused = false
      if (stream) {
        stream.close()
        stream = null
      }
      iframeWindow = null
    },
    /** KeepAlive deactivate: stop handling messages without tearing down the iframe. */
    pause() {
      paused = true
      postActive(false)
    },
    /** KeepAlive activate: resume message handling for this host only. */
    resume() {
      paused = false
      if (!listening) {
        window.addEventListener('message', onMessage)
        listening = true
      }
      const win = boundWindow()
      if (win) {
        iframeWindow = win
        ensureStream()
        postEnv(win)
        postActive(true)
      }
    },
    /**
     * Move keyboard focus into the workbench (after tab-chrome click).
     * Posts `datawise-plugin-focus` so plugins can focus xterm / inputs inside
     * the opaque-origin iframe — parent cannot reach their DOM directly.
     */
    requestContentFocus() {
      const win = boundWindow()
      if (!win) return
      try {
        win.postMessage({type: 'datawise-plugin-focus'}, '*')
      } catch {
        // ignore
      }
    },
    injectEnv,
    sendBinary,
    refreshTheme(theme?: PluginHostTheme) {
      currentTheme = theme || collectPluginHostTheme()
      resolveLocale()
      const win = boundWindow()
      if (win) {
        iframeWindow = win
        postEnv(win)
      }
    },
    /** Push a fresh locale (and current theme) into the workbench iframe. */
    refreshLocale(locale?: string) {
      if (locale && locale.trim()) currentLocale = locale.trim()
      else resolveLocale()
      const win = boundWindow()
      if (win) {
        iframeWindow = win
        postEnv(win)
      }
    },
    getHostInfo: buildHostInfo,
  }
}
