import { parseContainerHealth } from './containerHealth'
import type { DockerContainer, DockerContainerStats, DockerPort } from './types'

/** Ports fingerprint for list stability (ignore volatile formatting noise). */
export function portsFingerprint(ports: DockerPort[]): string {
  return ports
    .map((port) => `${port.ip ?? ''}:${port.publicPort ?? ''}→${port.privatePort}/${port.portType}`)
    .join(',')
}

/**
 * Identity fields that affect list UI. Excludes Docker Status relative time
 * ("Up 2 minutes") which changes every poll and would otherwise remount rows.
 */
export function containerIdentityKey(container: DockerContainer): string {
  return [
    container.id,
    container.state,
    parseContainerHealth(container.status),
    container.image,
    container.imageId,
    container.names.join('\0'),
    portsFingerprint(container.ports),
    container.labels['com.docker.compose.project'] || '',
    container.labels['com.docker.compose.service'] || '',
  ].join('\u0001')
}

/**
 * Merge a fresh list into the previous one, preserving object identity when
 * nothing meaningful changed. Mutates volatile `status` onto the old object
 * so health can still be re-parsed later without replacing the array.
 */
export function mergeContainerList(prev: DockerContainer[], next: DockerContainer[]): DockerContainer[] {
  if (!next.length && !prev.length) return prev

  const prevById = new Map(prev.map((item) => [item.id, item]))
  const merged: DockerContainer[] = new Array(next.length)
  let sameRefsInOrder = prev.length === next.length

  for (let i = 0; i < next.length; i += 1) {
    const item = next[i]
    const old = prevById.get(item.id)
    if (!old) {
      merged[i] = item
      sameRefsInOrder = false
      continue
    }
    if (containerIdentityKey(old) === containerIdentityKey(item)) {
      if (old.status !== item.status) old.status = item.status
      if (old.command !== item.command) old.command = item.command
      if (old.created !== item.created) old.created = item.created
      merged[i] = old
      if (prev[i] !== old) sameRefsInOrder = false
      continue
    }
    merged[i] = item
    sameRefsInOrder = false
  }

  if (sameRefsInOrder) return prev
  return merged
}

/** Compare stats by what the table actually paints (avoids byte-level thrash). */
export function statsVisuallyEqual(left: DockerContainerStats, right: DockerContainerStats, formatBytes: (n: number) => string): boolean {
  return (
    left.cpuPercent.toFixed(1) === right.cpuPercent.toFixed(1) &&
    formatBytes(left.memoryUsage) === formatBytes(right.memoryUsage) &&
    formatBytes(left.memoryLimit) === formatBytes(right.memoryLimit)
  )
}
