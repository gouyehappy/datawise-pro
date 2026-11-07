<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {API_PATHS} from '@/shared/api/http/paths'
import {postJson} from '@/shared/api/http/request'
import {
  collectPluginHostTheme,
  createPluginHostBridge,
} from '@/features/community-plugin/lib/pluginHostBridge'
import {
  buildCommunityPluginHostContext,
  type CommunityPluginWorkbenchConnection,
} from '@/features/community-plugin/lib/connectCommunityPluginWorkbench'
import {
  beginCommunityWorkbenchPaint,
  completeCommunityWorkbenchPaint,
  releaseCommunityWorkbenchPaint,
} from '@/features/community-plugin/lib/community-workbench-paint-gate'
import {createHttpCommunityPluginsApi} from '@/shared/api/http/community-plugins'
import {useThemeStore} from '@/features/settings/stores/theme-store'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {backendHealth} from '@/features/layout/services/backend-health.service'

const props = defineProps<{
  /** Workspace tab id — used for CEF first-paint gating in WorkspaceArea. */
  tabId?: string
  pluginId: string
  contributionId?: string
  connectionId?: string
  connection?: CommunityPluginWorkbenchConnection
  workbenchInstanceId?: string
  hostContext?: Record<string, unknown>
  /** When false, pause bridge I/O (tab still mounted / iframe kept). */
  active?: boolean
}>()

const {locale} = useI18n()
const themeStore = useThemeStore()
const workspace = useWorkspaceStore()
const iframeRef = ref<HTMLIFrameElement | null>(null)
const error = ref('')
/** Short-lived UI ticket — never put the long-lived session id in the iframe URL. */
const uiTicket = ref<string | null>(null)
/** Host cover stays until iframe document + bridge hello have a chance to paint. */
const frameRevealed = ref(false)
/** True when the installed plugin may open the plugin stream (host.events / host.binary). */
const pluginStreamEnabled = ref(false)
/**
 * host.embed plugins may nest third-party https UIs (e.g. Kibana Discover).
 * Relaxes sandbox generically from permissions — never by plugin id.
 */
const embedEnabled = ref(false)
/** host.sql — list connections / read-only execute / open SQL console. */
const sqlEnabled = ref(false)
/** host.ai — status + chat via the current user's default LLM (keys stay on host). */
const aiEnabled = ref(false)
let revealTimer: ReturnType<typeof setTimeout> | null = null
let revealStarted = false
let focusContentTimer: ReturnType<typeof setTimeout> | null = null

/** After tab-bar click, focus stays on the tab button — defer into the iframe. */
function scheduleFocusIntoWorkbench() {
  if (props.active === false) return
  if (focusContentTimer != null) {
    clearTimeout(focusContentTimer)
    focusContentTimer = null
  }
  // Double-rAF + timeout: tab chrome steals focus synchronously on pointerup;
  // we must run after that, or Enter still drives the tab strip.
  void nextTick(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        focusContentTimer = setTimeout(() => {
          focusContentTimer = null
          if (props.active === false) return
          try {
            iframeRef.value?.focus({preventScroll: true})
          } catch {
            // ignore
          }
          bridge.requestContentFocus()
        }, 0)
      })
    })
  })
}

const workbenchSandbox = computed(() => {
  // allow-popups*: plugins commonly open controller/console URLs (Jenkins, K8s dashboards).
  // Without these, window.open / target=_blank fails with a sandbox console error.
  if (!embedEnabled.value) {
    return 'allow-scripts allow-downloads allow-modals allow-popups allow-popups-to-escape-sandbox'
  }
  // allow-same-origin is required for cookie sessions inside nested https apps.
  // Combined with allow-scripts this is higher trust; gated by host.embed.
  return 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals'
})

const resolvedContext = computed(() => {
  // Always merge tab props over hostContext — incomplete hostContext (e.g. restored
  // tabs / older openers) previously won and left connectionId empty → hostBridgeMissing.
  const built = buildCommunityPluginHostContext({
    pluginId: props.pluginId,
    connectionId: props.connectionId,
    connection: props.connection,
    workbenchInstanceId: props.workbenchInstanceId,
    locale: locale.value,
  })
  const fromHost = props.hostContext && Object.keys(props.hostContext).length > 0
    ? props.hostContext
    : {}
  const mergedConnection = {
    ...((built.connection && typeof built.connection === 'object')
      ? (built.connection as Record<string, unknown>)
      : {}),
    ...((fromHost.connection && typeof fromHost.connection === 'object'
      && !Array.isArray(fromHost.connection))
      ? (fromHost.connection as Record<string, unknown>)
      : {}),
  }
  const connectionId =
    String(fromHost.connectionId || props.connectionId || built.connectionId || mergedConnection.id || '')
  const connectionName = String(
    fromHost.connectionName
    || mergedConnection.name
    || built.connectionName
    || '',
  )
  const workbenchId =
    String(fromHost.workbenchId || props.workbenchInstanceId || built.workbenchId || '')
  return {
    ...built,
    ...fromHost,
    connectionId,
    connectionName,
    workbenchId,
    connection: {
      ...mergedConnection,
      id: String(mergedConnection.id || connectionId),
      name: String(mergedConnection.name || connectionName),
    },
    pluginId: props.pluginId,
    locale: locale.value,
  }
})

// Stable iframe src: only identity params. Putting full dwContext in the URL made
// KeepAlive reactivate rewrite :src → full reload → connect card + double init.
// Keep relative `/api/...` so the iframe reuses the SPA origin's asset paths (opaque
// origin — the bridge runs over postMessage, not contentDocument). Absolute API
// origins would break the sandboxed frame and white-screen. dwAppearance is
// snapshotted with the ticket — do not bind live theme or theme toggles would
// rewrite :src and flash-reload the workbench.
const hostAppearance = computed(() => collectPluginHostTheme().appearance)
const paintAppearance = ref<'light' | 'dark'>(hostAppearance.value)

const uiUrl = computed(() => {
  if (!uiTicket.value) return ''
  const base = API_PATHS.communityPlugins.ui(props.pluginId, 'index.html')
  const params = new URLSearchParams()
  params.set('dwUiTicket', uiTicket.value)
  // First-paint guard in injected HTML reads this before CSS modules / postMessage theme.
  params.set('dwAppearance', paintAppearance.value)
  const connectionId = String(
    props.connectionId
    || (typeof props.hostContext?.connectionId === 'string' ? props.hostContext.connectionId : '')
    || '',
  ).trim()
  const workbenchId = String(
    props.workbenchInstanceId
    || (typeof props.hostContext?.workbenchId === 'string' ? props.hostContext.workbenchId : '')
    || '',
  ).trim()
  if (connectionId) params.set('dwConnectionId', connectionId)
  if (workbenchId) params.set('dwWorkbenchId', workbenchId)
  const qs = params.toString()
  return `${base}${base.includes('?') ? '&' : '?'}${qs}`
})

function clearRevealTimer() {
  if (revealTimer != null) {
    clearTimeout(revealTimer)
    revealTimer = null
  }
}

function revealFrame() {
  if (frameRevealed.value || revealStarted) return
  revealStarted = true
  clearRevealTimer()
  // 1) Lift welcome / show host with cover still opaque (never welcome→white).
  if (props.tabId) completeCommunityWorkbenchPaint(props.tabId)
  // 2) After CEF composites the foreground host, drop cover + show iframe.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      frameRevealed.value = true
    })
  })
}

function scheduleReveal(delayMs = 0) {
  if (frameRevealed.value || revealStarted) return
  clearRevealTimer()
  revealTimer = setTimeout(() => {
    revealTimer = null
    revealFrame()
  }, delayMs)
}

async function refreshUiTicket() {
  error.value = ''
  uiTicket.value = null
  frameRevealed.value = false
  revealStarted = false
  paintAppearance.value = collectPluginHostTheme().appearance
  if (props.tabId) beginCommunityWorkbenchPaint(props.tabId)
  try {
    const issued = await postJson<{ticket: string; expiresInSec: number}>(
      API_PATHS.communityPlugins.uiTicket(props.pluginId),
      {},
      {silent: true},
    )
    if (!issued?.ticket) {
      throw new Error('UI ticket missing')
    }
    uiTicket.value = issued.ticket
    // Safety: never leave the workspace stuck behind welcome / cover.
    scheduleReveal(2500)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    revealFrame()
  }
}

const bridge = createPluginHostBridge({
  pluginId: props.pluginId,
  locale: () => locale.value,
  context: resolvedContext.value,
  getIframeWindow: () => iframeRef.value?.contentWindow ?? null,
  enableBinaryStream: () => pluginStreamEnabled.value,
  enableSql: () => sqlEnabled.value,
  enableAi: () => aiEnabled.value,
  onReady: () => {
    scheduleReveal(32)
  },
  invoke: async (method, params) => {
    // Mirror the backend timeout policy (by capability class, never by plugin RPC
    // name): connection/* and host.binary plugins get the long budget, the rest
    // the default — plus a small HTTP grace over the 30s sidecar budget.
    const timeoutMs =
      pluginStreamEnabled.value || method.startsWith('connection/')
        ? 6 * 60_000
        : 35_000
    return postJson<unknown>(
      API_PATHS.communityPlugins.invoke(props.pluginId),
      {method, params},
      {timeoutMs, silent: true},
    )
  },
  notify: async (method, params) => {
    await postJson<unknown>(
      API_PATHS.communityPlugins.notify(props.pluginId),
      {method, params},
      {silent: true},
    )
  },
  openWorkbench: async (contributionId, context, openOptions) => {
    const {useWorkspaceStore} = await import('@/features/workspace/stores/workspace')
    const workspace = useWorkspaceStore()
    const connectionId =
      (typeof context?.connectionId === 'string' && context.connectionId)
      || props.connectionId
      || ''
    const workbenchInstanceId =
      (typeof context?.workbenchId === 'string' && context.workbenchId)
      || undefined
    const connection =
      context?.connection && typeof context.connection === 'object' && !Array.isArray(context.connection)
        ? (context.connection as CommunityPluginWorkbenchConnection)
        : props.connection
    const connectionName =
      connection && typeof connection.name === 'string' && connection.name.trim()
        ? connection.name.trim()
        : ''
    const tabTitle = connectionName || props.pluginId
    workspace.openCommunityWorkbench(props.pluginId, contributionId, tabTitle, {
      connectionId: connectionId || undefined,
      connection,
      workbenchInstanceId,
      pluginHostContext: context,
      forceNew: openOptions?.forceNew === true,
    })
  },
  reopenConnection: async (connectionId) => {
    const {createHttpExplorerApi} = await import('@/shared/api/http/explorer')
    const {createHttpCommunityPluginsApi} = await import('@/shared/api/http/community-plugins')
    const config = await createHttpExplorerApi().fetchConnection(connectionId)
    const pluginId = config.pluginId?.trim()
    if (!pluginId) throw new Error('pluginId missing on connection')
    const pluginsApi = createHttpCommunityPluginsApi()
    await pluginsApi.activate(pluginId)
    await pluginsApi.connect(config)
    return {ok: true}
  },
  listOpenWorkbenches: async () => {
    const {useWorkspaceStore} = await import('@/features/workspace/stores/workspace')
    const workspace = useWorkspaceStore()
    const workbenchIds = workspace.tabs
      .filter((tab) => tab.type === 'community-workbench' && tab.pluginId === props.pluginId)
      .map((tab) => {
        const id = tab.pluginHostContext?.workbenchId
        return typeof id === 'string' ? id.trim() : ''
      })
      .filter(Boolean)
    return {workbenchIds}
  },
  importConnections: async (connections) => {
    const {useExplorerStore} = await import('@/features/explorer/stores/explorer')
    const explorer = useExplorerStore()
    const configs = connections.filter(
      (item): item is import('@/core/types').ConnectionConfig =>
        !!item && typeof item === 'object' && !Array.isArray(item),
    ) as import('@/core/types').ConnectionConfig[]
    if (!configs.length) return {count: 0}
    const count = await explorer.importConnections(configs)
    return {count}
  },
  // hostApi 1.2 UI storage: opaque-origin frames have no localStorage — persist
  // plugin UI preferences/history server-side in the plugin data dir.
  storage: {
    getAll: async () => {
      const result = await createHttpCommunityPluginsApi().storageGetAll(props.pluginId)
      return result?.values ?? {}
    },
    setEntries: async (entries) => {
      await createHttpCommunityPluginsApi().storagePut(props.pluginId, entries)
    },
  },
})

// Attach before iframe can finish loading so bridge-hello is not missed.
bridge.attach()

function pushEnv() {
  if (iframeRef.value) {
    bridge.injectEnv(iframeRef.value, resolvedContext.value, collectPluginHostTheme())
  }
}

function onLoad() {
  pushEnv()
  // Hello may already have fired; load is a second chance to reveal after themed paint.
  scheduleReveal(48)
}

async function resolveBinaryStreamPermission() {
  try {
    const info = await createHttpCommunityPluginsApi().get(props.pluginId)
    const permissions = info.manifest.permissions || []
    // hostApi ^1.1: jsonl plugins use the stream for events, framed ones for binary.
    pluginStreamEnabled.value = permissions.includes('host.binary') || permissions.includes('host.events')
    embedEnabled.value = permissions.includes('host.embed')
    sqlEnabled.value = permissions.includes('host.sql')
    aiEnabled.value = permissions.includes('host.ai')
  } catch {
    pluginStreamEnabled.value = false
    embedEnabled.value = false
    sqlEnabled.value = false
    aiEnabled.value = false
  }
}

onMounted(() => {
  if (props.tabId) beginCommunityWorkbenchPaint(props.tabId)
  void (async () => {
    await resolveBinaryStreamPermission()
    await refreshUiTicket()
    // Extra push in case hello arrived before context was ready.
    pushEnv()
  })()
})

watch(
  () => props.active !== false,
  (isActive) => {
    if (isActive) {
      bridge.resume()
      // Soft fit only — do not re-inject env on every focus (avoids visible flash).
      // After backend restart tickets are cleared below; re-issue when focused again.
      if (error.value || !uiTicket.value) {
        void refreshUiTicket()
      }
      scheduleFocusIntoWorkbench()
    } else {
      bridge.pause()
    }
  },
  {immediate: true},
)

watch(
  () => (props.tabId ? workspace.tabActivateRefreshSeq[props.tabId] ?? 0 : 0),
  (seq, prev) => {
    if (!seq || seq === prev) return
    if (props.active === false) return
    // Full ticket refresh only when the frame is already broken / ticket was dropped.
    if (error.value || !uiTicket.value) {
      void refreshUiTicket()
      scheduleFocusIntoWorkbench()
      return
    }
    pushEnv()
    scheduleFocusIntoWorkbench()
  },
)

watch(
  () => backendHealth.status,
  (status, prev) => {
    if (status !== 'online') {
      // Drop short-lived UI ticket so the next activate / online transition re-issues it.
      uiTicket.value = null
      return
    }
    if (prev && prev !== 'online' && props.active !== false) {
      void refreshUiTicket()
    }
  },
)

onBeforeUnmount(() => {
  clearRevealTimer()
  if (focusContentTimer != null) {
    clearTimeout(focusContentTimer)
    focusContentTimer = null
  }
  if (props.tabId) releaseCommunityWorkbenchPaint(props.tabId)
  // KeepAlive 切走只 deactivate，不会走到这里。真正关 tab / 缓存淘汰时才回收侧车会话。
  const workbenchId = String(resolvedContext.value.workbenchId || '').trim()
  if (workbenchId) {
    void postJson(
      API_PATHS.communityPlugins.invoke(props.pluginId),
      {method: 'workbench/close', params: {workbenchId}},
      {silent: true},
    ).catch(() => undefined)
  }
  bridge.detach()
})

watch(
  () => props.pluginId,
  () => {
    void (async () => {
      await resolveBinaryStreamPermission()
      await refreshUiTicket()
    })()
  },
)

watch(
  resolvedContext,
  (ctx) => {
    if (iframeRef.value) bridge.injectEnv(iframeRef.value, ctx, collectPluginHostTheme())
  },
  {deep: true},
)

watch(
  () => [themeStore.resolvedMode, themeStore.backgroundTone, themeStore.primaryTone, themeStore.uiSkin] as const,
  () => {
    bridge.refreshTheme(collectPluginHostTheme())
  },
)

// SPA language switch → push HostInfo so workbench i18n follows the host.
watch(
  locale,
  (next) => {
    bridge.refreshLocale(String(next || 'en'))
  },
)
</script>

<template>
  <div
    class="community-workbench-host"
    :data-appearance="hostAppearance"
    :data-revealed="frameRevealed ? 'true' : 'false'"
  >
    <p v-if="error" class="community-workbench-host__error">{{ error }}</p>
    <!--
      iframe 是 replaced element：仅靠 flex-1 在部分引擎（含 JCEF）会停在默认
      300×150，表现为工作台缩在左上角。对齐 MetadocTab：显式 width/height 100%。
      CEF 导航期间 iframe 会画白底：未 reveal 前用遮罩盖住，并保持 opacity:0。
    -->
    <iframe
      v-if="uiUrl"
      ref="iframeRef"
      class="community-workbench-host__frame"
      :class="{ 'is-revealed': frameRevealed }"
      :src="uiUrl"
      :style="{ colorScheme: hostAppearance }"
      :sandbox="workbenchSandbox"
      :referrerpolicy="embedEnabled ? 'no-referrer-when-downgrade' : 'no-referrer'"
      title="Community plugin workbench"
      @load="onLoad"
    />
    <div
      v-show="!frameRevealed"
      class="community-workbench-host__cover"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped>
.community-workbench-host {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  /* Ticket 签发前尚无 iframe：跟宿主主题底，避免欢迎页切走后露白 */
  background: var(--dw-bg);
  color-scheme: dark;
}

.community-workbench-host[data-appearance='light'] {
  background: var(--dw-bg);
  color-scheme: light;
}

.community-workbench-host__error {
  position: relative;
  z-index: 3;
  flex: 0 0 auto;
  margin: 0;
  border-bottom: 1px solid var(--dw-border);
  padding: 0.5rem 0.75rem;
  color: var(--dw-danger);
  font-size: var(--dw-text-sm);
}

.community-workbench-host__frame {
  display: block;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  border: 0;
  background: inherit;
  opacity: 0;
}

.community-workbench-host__frame.is-revealed {
  opacity: 1;
}

.community-workbench-host__cover {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background: inherit;
}
</style>
