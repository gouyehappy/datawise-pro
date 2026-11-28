import { describe, expect, it } from 'vitest'
import { formatPublicPorts, parseContainerHealth } from './containerHealth'

describe('parseContainerHealth', () => {
  it('detects healthy / unhealthy / starting', () => {
    expect(parseContainerHealth('Up 3 hours (healthy)')).toBe('healthy')
    expect(parseContainerHealth('Up 10 seconds (unhealthy)')).toBe('unhealthy')
    expect(parseContainerHealth('Up Less than a second (health: starting)')).toBe('starting')
    expect(parseContainerHealth('Exited (0) 2 days ago')).toBe('none')
  })
})

describe('formatPublicPorts', () => {
  it('formats only published ports', () => {
    expect(
      formatPublicPorts([
        { privatePort: 80, portType: 'tcp' },
        { ip: '0.0.0.0', publicPort: 8080, privatePort: 80, portType: 'tcp' },
      ]),
    ).toBe('8080→80/tcp')
  })
})
