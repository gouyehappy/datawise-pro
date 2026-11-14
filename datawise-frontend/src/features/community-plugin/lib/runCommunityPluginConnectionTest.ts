import type {ConnectionConfig} from '@/core/types'
import {
    createHttpCommunityPluginsApi,
    type CommunityPluginConnectionTestResult,
} from '@/shared/api/http/community-plugins'
import {readApiBaseUrl} from '@/shared/api/mode'
import {backendDevBaseUrl} from '@/shared/config/runtime-ports'
import {openAuthedWebSocket} from '@/shared/api/http/open-authed-websocket'
import {findRememberedChallenge, rememberChallenge} from '@/features/community-plugin/lib/challengeTrust'
import {askAppConfirm} from '@/core/services/app-confirm.service'
import {t} from '@/i18n'

/** Generic connection/challenge payload (host-key, MFA, …). */
export type ConnectionChallenge = {
  challengeId: string
  operationId: string
  connectionId?: string
  kind?: string
  host: string
  port: number | string
  keyType?: string
  fingerprint?: string
}

export type ConnectionChallengeDecision = {
  accept: boolean
  remember: boolean
}

/** @deprecated Use ConnectionChallenge */
export type HostKeyChallenge = ConnectionChallenge
/** @deprecated Use ConnectionChallengeDecision */
export type HostKeyDecision = ConnectionChallengeDecision

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

async function defaultChallengePrompt(challenge: ConnectionChallenge): Promise<ConnectionChallengeDecision> {
    const kind = (challenge.kind || 'host-key').trim() || 'host-key'
    const remote = `${challenge.host}:${challenge.port}`
    const lines = [
        t('communityPlugin.challenge.intro', {kind, remote}),
    ]
    if (challenge.keyType) {
        lines.push(`${t('communityPlugin.challenge.keyType')}: ${challenge.keyType}`)
    }
    if (challenge.fingerprint) {
        lines.push(`${t('communityPlugin.challenge.fingerprint')}: ${challenge.fingerprint}`)
    }
    lines.push('', t('communityPlugin.challenge.verifyHint'))
    const accept = await askAppConfirm({
        title: t('communityPlugin.challenge.title'),
        message: lines.join('\n'),
        confirmVariant: 'danger',
    })
    return {accept, remember: accept}
}

/**
 * UI surfaces (e.g. the connection form) register a real dialog here; the
 * askAppConfirm fallback above stays for flows without a mounted dialog host.
 */
type CommunityChallengeHandler = (challenge: ConnectionChallenge) => Promise<ConnectionChallengeDecision>
let challengeHandler: CommunityChallengeHandler | null = null

export function setCommunityChallengeHandler(handler: CommunityChallengeHandler | null) {
    challengeHandler = handler
}

async function pluginHasStream(pluginId: string): Promise<boolean> {
  try {
    const info = await createHttpCommunityPluginsApi().get(pluginId)
    const permissions = info.manifest.permissions || []
    // host.events OR host.binary both open the plugin stream (hostApi ^1.1);
    // jsonl plugins use it for events, framed plugins additionally for binary.
    return permissions.includes('host.binary') || permissions.includes('host.events')
  } catch {
    return false
  }
}

/**
 * Run community-plugin connection/test while handling connection/challenge events.
 * Sidecar raises `connection/challenge` over the plugin stream; the connection
 * form has no workbench iframe, so this opens a short-lived WS listener when the
 * plugin declares host.events or host.binary (hostApi ^1.1).
 */
export async function runCommunityPluginConnectionTest(
  config: ConnectionConfig,
  options?: {
    onChallenge?: (challenge: ConnectionChallenge) => Promise<ConnectionChallengeDecision>
    /** @deprecated Use onChallenge */
    onHostKeyChallenge?: (challenge: ConnectionChallenge) => Promise<ConnectionChallengeDecision>
  },
): Promise<CommunityPluginConnectionTestResult> {
  const pluginId = config.pluginId?.trim()
  if (!pluginId) {
    throw new Error('pluginId is required')
  }
  const api = createHttpCommunityPluginsApi()
  await api.activate(pluginId)

  const onChallenge = options?.onChallenge ?? options?.onHostKeyChallenge ?? defaultChallengePrompt
  let socket: WebSocket | null = null
  const pendingResolves = new Set<Promise<unknown>>()
  const useStream = await pluginHasStream(pluginId)

  try {
    if (useStream) {
      socket = openAuthedSocket(resolvePluginStreamUrl(pluginId))
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('Plugin stream connect timed out')), 8_000)
        socket!.addEventListener(
          'open',
          () => {
            window.clearTimeout(timer)
            resolve()
          },
          {once: true},
        )
        socket!.addEventListener(
          'error',
          () => {
            window.clearTimeout(timer)
            reject(new Error('Plugin stream WebSocket failed'))
          },
          {once: true},
        )
      })

      socket.onmessage = (event) => {
        if (typeof event.data !== 'string') return
        let msg: {type?: string; method?: string; params?: Record<string, unknown>}
        try {
          msg = JSON.parse(event.data) as typeof msg
        } catch {
          return
        }
        if (msg.type !== 'event') return
        // Standard host contract only — plugins map private aliases internally.
        if (msg.method !== 'connection/challenge') return
        const params = msg.params || {}
        const challengeId = String(params.challengeId || '')
        const operationId = String(params.operationId || '')
        if (!challengeId || !operationId) return
        const challenge: ConnectionChallenge = {
          challengeId,
          operationId,
          connectionId: params.connectionId ? String(params.connectionId) : undefined,
          kind: params.kind ? String(params.kind) : undefined,
          host: String(params.host || config.host || ''),
          port: (params.port as number | string) ?? config.port ?? '',
          keyType: params.keyType ? String(params.keyType) : undefined,
          fingerprint: params.fingerprint ? String(params.fingerprint) : undefined,
        }
        const work = (async () => {
            // TOFU: a remembered fingerprint for this host/port/kind is auto-accepted.
            const remembered = findRememberedChallenge(pluginId, challenge)
            const decision = remembered
                ? {accept: true, remember: true}
                : await (challengeHandler ?? onChallenge)(challenge)
            if (decision.accept && decision.remember && !remembered) {
                rememberChallenge(pluginId, challenge)
            }
            if (!decision.accept) {
                return
            }
            await api.invoke(pluginId, 'connection/challenge/resolve', {
                challengeId,
                operationId,
                accept: true,
                remember: decision.remember,
            })
        })()
        pendingResolves.add(work)
        void work.finally(() => pendingResolves.delete(work))
      }
    }

    // Interactive challenges may take a while; keep HTTP open long enough.
    const result = await api.testConnection(config)
    await Promise.allSettled([...pendingResolves])
    return result
  } finally {
    if (socket) {
      try {
        socket.close()
      } catch {
        // ignore
      }
    }
  }
}
