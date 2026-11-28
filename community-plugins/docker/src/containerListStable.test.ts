import { describe, expect, it } from 'vitest'
import { containerIdentityKey, mergeContainerList, statsVisuallyEqual } from './containerListStable'
import type { DockerContainer, DockerContainerStats } from './types'

function container(partial: Partial<DockerContainer> & Pick<DockerContainer, 'id'>): DockerContainer {
  return {
    names: ['/app'],
    image: 'nginx:latest',
    imageId: 'sha256:1',
    command: 'nginx',
    created: 1,
    state: 'running',
    status: 'Up 2 minutes',
    ports: [],
    labels: {},
    networkIps: {},
    ...partial,
  }
}

describe('containerIdentityKey', () => {
  it('ignores relative status time', () => {
    const a = container({ id: '1', status: 'Up 2 minutes (healthy)' })
    const b = container({ id: '1', status: 'Up 3 minutes (healthy)' })
    expect(containerIdentityKey(a)).toBe(containerIdentityKey(b))
  })

  it('detects health transitions', () => {
    const a = container({ id: '1', status: 'Up 2 minutes (healthy)' })
    const b = container({ id: '1', status: 'Up 2 minutes (unhealthy)' })
    expect(containerIdentityKey(a)).not.toBe(containerIdentityKey(b))
  })
})

describe('mergeContainerList', () => {
  it('keeps the same array reference when only status clocks tick', () => {
    const prev = [container({ id: 'a', status: 'Up 1 minute' })]
    const next = [container({ id: 'a', status: 'Up 2 minutes' })]
    const merged = mergeContainerList(prev, next)
    expect(merged).toBe(prev)
    expect(merged[0]).toBe(prev[0])
    expect(merged[0].status).toBe('Up 2 minutes')
  })

  it('replaces rows when state changes', () => {
    const prev = [container({ id: 'a', state: 'running', status: 'Up 1 minute' })]
    const next = [container({ id: 'a', state: 'exited', status: 'Exited (0) 1 second ago' })]
    const merged = mergeContainerList(prev, next)
    expect(merged).not.toBe(prev)
    expect(merged[0].state).toBe('exited')
  })
})

describe('statsVisuallyEqual', () => {
  const formatBytes = (n: number) => `${Math.round(n / 1024)}K`

  it('treats sub-display byte noise as equal', () => {
    const a: DockerContainerStats = {
      containerId: '1',
      cpuPercent: 1.14,
      memoryUsage: 10240,
      memoryLimit: 1048576,
      memoryPercent: 1,
      networkRx: 0,
      networkTx: 0,
      blockRead: 0,
      blockWrite: 0,
      readAt: '',
    }
    const b = { ...a, cpuPercent: 1.141, memoryUsage: 10250 }
    expect(statsVisuallyEqual(a, b, formatBytes)).toBe(true)
  })
})
