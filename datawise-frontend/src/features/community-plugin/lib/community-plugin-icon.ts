import {API_PATHS} from '@/shared/api/http/paths'
import {buildApiUrl, buildSessionHeaders} from '@/shared/api/http/request'
import type {CommunityPluginInfo} from '@/shared/api/http/community-plugins'

const DEFAULT_ICON = 'assets/plugin.svg'

type CachedIcon = {url: string; fingerprint: string}
const blobUrlCache = new Map<string, CachedIcon>()
const inflight = new Map<string, Promise<string>>()

/** Resolve the package-relative icon path from a plugin manifest. */
export function communityPluginIconPath(plugin: CommunityPluginInfo | null | undefined): string {
  const icon = plugin?.manifest?.icon
  if (typeof icon === 'string' && icon.trim()) {
    return icon.trim().replace(/\\/g, '/').replace(/^\/+/, '')
  }
  return DEFAULT_ICON
}

/** Authenticated API path for an installed plugin package asset. */
export function communityPluginPackageAssetPath(
  pluginId: string,
  relativePath = DEFAULT_ICON,
): string {
  const id = pluginId.trim()
  const path = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!id || !path) return ''
  return API_PATHS.communityPlugins.packageAsset(id, path)
}

async function fingerprintBlob(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  // Small package icons — FNV-1a over full bytes is enough to detect edits.
  let hash = 0x811c9dc5
  for (let i = 0; i < buf.length; i += 1) {
    hash ^= buf[i]
    hash = Math.imul(hash, 0x01000193)
  }
  return `${blob.size}:${(hash >>> 0).toString(16)}`
}

/**
 * Load plugin.svg (or manifest.icon) via authenticated fetch and return a blob:
 * URL. Always revalidates (`cache: 'no-store'`) so icon edits show up without a full reinstall.
 */
export async function loadCommunityPluginIconUrl(
  pluginId: string,
  relativePath = DEFAULT_ICON,
): Promise<string> {
  const apiPath = communityPluginPackageAssetPath(pluginId, relativePath)
  if (!apiPath) return ''

  const pending = inflight.get(apiPath)
  if (pending) return pending

  const task = (async () => {
    const response = await fetch(buildApiUrl(apiPath), {
      method: 'GET',
      headers: buildSessionHeaders(),
      credentials: 'include',
      cache: 'no-store',
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const blob = await response.blob()
    const fingerprint = await fingerprintBlob(blob)
    const previous = blobUrlCache.get(apiPath)
    if (previous && previous.fingerprint === fingerprint) {
      return previous.url
    }
    if (previous) URL.revokeObjectURL(previous.url)
    const objectUrl = URL.createObjectURL(blob)
    blobUrlCache.set(apiPath, {url: objectUrl, fingerprint})
    return objectUrl
  })().finally(() => {
    inflight.delete(apiPath)
  })

  inflight.set(apiPath, task)
  return task
}

export function communityPluginIconCacheKey(
  plugin: CommunityPluginInfo | null | undefined,
  pluginId?: string,
  iconPath = DEFAULT_ICON,
): string {
  // Include plugin version when known so a package upgrade always remounts the img.
  const version = plugin?.manifest?.version || ''
  if (plugin?.manifest?.id) {
    return `${communityPluginPackageAssetPath(plugin.manifest.id, communityPluginIconPath(plugin))}@${version}`
  }
  return `${communityPluginPackageAssetPath(pluginId || '', iconPath)}@${version}`
}
