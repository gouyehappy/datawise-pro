import {beforeEach, describe, expect, it, vi} from 'vitest'

const fetchConnection = vi.fn()
const activate = vi.fn()
const connect = vi.fn()
const markConnectionPooled = vi.fn()

vi.mock('@/shared/api/http/explorer', () => ({
  createHttpExplorerApi: () => ({fetchConnection}),
}))

vi.mock('@/shared/api/http/community-plugins', () => ({
  createHttpCommunityPluginsApi: () => ({activate, connect, get: vi.fn()}),
}))

vi.mock('@/features/explorer/stores/explorer', () => ({
  useExplorerStore: () => ({markConnectionPooled}),
}))

vi.mock('@/features/workspace/stores/workspace', () => ({
  useWorkspaceStore: () => ({tabs: [], openCommunityWorkbench: vi.fn()}),
}))

vi.mock('@/i18n', () => ({
  i18n: {global: {locale: {value: 'zh-CN'}}},
}))

vi.mock('@/features/community-plugin/lib/community-plugin-locale', () => ({
  resolveCommunityPluginLocalization: () => ({}),
  scopedCommunityPluginLocalization: () => ({}),
}))

vi.mock('@/shared/api/http/config', () => ({
  createHttpConfigApi: () => ({fetchConnectionsCatalog: vi.fn()}),
}))

import {
  ensureCommunityPluginSidecarConnection,
  prepareCommunityWorkbenchSnapshotsForRestore,
  resolveCommunityWorkbenchIdentity,
} from './connectCommunityPluginWorkbench'

describe('resolveCommunityWorkbenchIdentity', () => {
  it('reads top-level connectionId and pluginId', () => {
    expect(
      resolveCommunityWorkbenchIdentity({
        connectionId: 'c1',
        pluginId: 'io.datawise.community.nacos-ops',
      }),
    ).toEqual({
      connectionId: 'c1',
      pluginId: 'io.datawise.community.nacos-ops',
    })
  })

  it('falls back to pluginHostContext when top-level ids are missing', () => {
    expect(
      resolveCommunityWorkbenchIdentity({
        pluginHostContext: {
          connectionId: 'c2',
          pluginId: 'io.datawise.community.httpclient',
          connection: {id: 'ignored-when-connectionId-set', name: 'hh'},
        },
      }),
    ).toEqual({
      connectionId: 'c2',
      pluginId: 'io.datawise.community.httpclient',
    })
  })

  it('falls back to connection.id inside host context', () => {
    expect(
      resolveCommunityWorkbenchIdentity({
        pluginId: 'io.datawise.community.ssh',
        pluginHostContext: {
          connection: {id: 'ssh-1', host: '10.0.0.1'},
        },
      }),
    ).toEqual({
      connectionId: 'ssh-1',
      pluginId: 'io.datawise.community.ssh',
    })
  })

  it('returns null when either id is missing', () => {
    expect(resolveCommunityWorkbenchIdentity({connectionId: 'c1'})).toBeNull()
    expect(resolveCommunityWorkbenchIdentity({pluginId: 'p1'})).toBeNull()
  })
})

describe('ensureCommunityPluginSidecarConnection', () => {
  beforeEach(() => {
    fetchConnection.mockReset()
    activate.mockReset()
    connect.mockReset()
    markConnectionPooled.mockReset()
  })

  it('activates, connects, and marks explorer pooled', async () => {
    fetchConnection.mockResolvedValue({
      id: 'c1',
      pluginId: 'io.datawise.community.nacos-ops',
      name: 'Nacos',
      host: '192.0.2.30',
      port: 8848,
      user: '',
    })
    activate.mockResolvedValue({pluginId: 'io.datawise.community.nacos-ops', active: true})
    connect.mockResolvedValue({})

    const result = await ensureCommunityPluginSidecarConnection('c1')

    expect(activate).toHaveBeenCalledWith('io.datawise.community.nacos-ops')
    expect(connect).toHaveBeenCalled()
    expect(markConnectionPooled).toHaveBeenCalledWith('c1')
    expect(result.connection.host).toBe('192.0.2.30')
  })
})

describe('prepareCommunityWorkbenchSnapshotsForRestore', () => {
  beforeEach(() => {
    fetchConnection.mockReset()
    activate.mockReset()
    connect.mockReset()
    markConnectionPooled.mockReset()
  })

  it('reconnects tabs that only store ids in pluginHostContext', async () => {
    fetchConnection.mockResolvedValue({
      id: 'c9',
      pluginId: 'io.datawise.community.polaris-ops',
      name: 'Polaris',
      host: '192.0.2.11',
      port: 8090,
      user: 'u',
    })
    activate.mockResolvedValue({})
    connect.mockResolvedValue({})

    const tabs = [
      {
        type: 'community-workbench',
        pluginHostContext: {
          connectionId: 'c9',
          pluginId: 'io.datawise.community.polaris-ops',
          workbenchId: 'wb-1',
        },
      },
    ]

    await prepareCommunityWorkbenchSnapshotsForRestore(tabs)

    expect(connect).toHaveBeenCalled()
    expect(tabs[0].connectionId).toBe('c9')
    expect(tabs[0].pluginId).toBe('io.datawise.community.polaris-ops')
    expect(tabs[0].pluginHostContext?.connection).toMatchObject({
      id: 'c9',
      host: '192.0.2.11',
    })
    expect(tabs[0].pluginHostContext?.workbenchId).toBe('wb-1')
  })
})
