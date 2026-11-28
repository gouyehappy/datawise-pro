/** Parse Docker list Status strings like "Up 2 hours (healthy)". */

export type ContainerHealth = 'healthy' | 'unhealthy' | 'starting' | 'none'

export function parseContainerHealth(status: string | undefined | null): ContainerHealth {
  const text = String(status || '').toLowerCase()
  if (!text) return 'none'
  if (text.includes('(healthy)')) return 'healthy'
  if (text.includes('(unhealthy)')) return 'unhealthy'
  if (text.includes('(health: starting)') || text.includes('(starting)')) return 'starting'
  return 'none'
}

export function formatPublicPorts(
  ports: Array<{ ip?: string | null; publicPort?: number | null; privatePort: number; portType?: string }>,
): string {
  const mapped = ports
    .filter((port) => port.publicPort)
    .map((port) => {
      const host = port.ip && port.ip !== '0.0.0.0' && port.ip !== '::' ? `${port.ip}:` : ''
      return `${host}${port.publicPort}→${port.privatePort}/${port.portType || 'tcp'}`
    })
  return mapped.join(', ')
}
