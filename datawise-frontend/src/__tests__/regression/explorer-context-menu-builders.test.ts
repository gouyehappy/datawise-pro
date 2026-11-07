import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildPinContextMenuItems,
    buildSpecializedConnectionMenuItems,
    isExplorerUiBlocking,
    prependJdbcSshTunnelMenuItems,
    prependMoveConnectionHereMenuItems,
    resolveDeleteCatalogDialogCopy,
    resolveExplorerContextMenuType,
    withCsvImportMenuDisabled,
} from '@/features/explorer/services/explorer-context-menu-builders.service'
import type {ContextMenuItem} from '@/core/types'

const t = ((key: string, params?: {name?: string}) => {
    if (params?.name != null) return `${key}:${params.name}`
    return key
}) as never

const baseItems: ContextMenuItem[] = [
    {id: 'open', label: 'open', icon: 'open'},
    {id: 'pin', label: 'pin-placeholder', icon: 'pin'},
    {id: 'delete', label: 'delete', icon: 'delete'},
]

describe('explorer-context-menu-builders.service', () => {
    it('rewrites table pin label without injecting a new pin row', () => {
        const items = buildPinContextMenuItems({type: 'table'}, baseItems, true, t)
        assert.equal(items.length, baseItems.length)
        assert.equal(items.find((item) => item.id === 'pin')?.label, 'explorer.context.unfavoriteTable')
        assert.equal(items[0]?.id, 'open')
    })

    it('injects pin at top for connection when pinned=false', () => {
        const items = buildPinContextMenuItems(
            {type: 'connection'},
            [{id: 'open', label: 'open', icon: 'open'}],
            false,
            t,
        )
        assert.equal(items[0]?.id, 'pin')
        assert.equal(items[0]?.label, 'explorer.context.pinToTop')
        assert.equal(items[1]?.divider, true)
        assert.equal(items[2]?.id, 'open')
    })

    it('leaves non-pinnable nodes unchanged', () => {
        const items = buildPinContextMenuItems({type: 'group'}, baseItems, false, t)
        assert.deepEqual(items, baseItems)
    })

    it('prepends JDBC SSH tunnel and move-here items', () => {
        const tunnel = prependJdbcSshTunnelMenuItems([{id: 'open', label: 'open', icon: 'open'}], t)
        assert.equal(tunnel[0]?.id, 'open-jdbc-ssh-tunnel')
        assert.equal(tunnel[0]?.label, 'explorer.context.openJdbcSshTunnel')
        assert.equal(tunnel[1]?.divider, true)

        const move = prependMoveConnectionHereMenuItems(
            [{id: 'open', label: 'open', icon: 'open'}],
            'conn-a',
            t,
        )
        assert.equal(move[0]?.id, 'move-here')
        assert.equal(move[0]?.label, 'explorer.context.moveConnectionHere:conn-a')
    })

    it('resolves delete-catalog dialog copy for group / connection / empty', () => {
        assert.deepEqual(resolveDeleteCatalogDialogCopy({type: 'group', label: 'g1'}, t), {
            title: 'explorer.deleteGroupTitle',
            message: 'explorer.deleteGroupMessage:g1',
            confirmLabel: 'explorer.context.deleteGroup',
        })
        assert.deepEqual(resolveDeleteCatalogDialogCopy({type: 'connection', label: 'c1'}, t), {
            title: 'explorer.deleteConnectionTitle',
            message: 'explorer.deleteConnectionMessage:c1',
            confirmLabel: 'explorer.context.deleteConnection',
        })
        assert.deepEqual(resolveDeleteCatalogDialogCopy(null, t), {
            title: 'explorer.deleteConnectionTitle',
            message: '',
            confirmLabel: 'explorer.context.deleteConnection',
        })
    })

    it('detects explorer UI blocking from any true flag', () => {
        assert.equal(isExplorerUiBlocking({a: false, b: false}), false)
        assert.equal(isExplorerUiBlocking({a: false, b: true}), true)
        assert.equal(isExplorerUiBlocking({}), false)
    })

    it('resolves folder context-menu types and disables csv import', () => {
        assert.equal(resolveExplorerContextMenuType({type: 'folder', label: 'models'}), 'folder-models')
        assert.equal(resolveExplorerContextMenuType({type: 'folder', label: 'tables'}), 'folder-tables')
        assert.equal(resolveExplorerContextMenuType({type: 'table', label: 't'}), 'table')
        const disabled = withCsvImportMenuDisabled(
            [{id: 'import', label: 'import', icon: 'import'}, {id: 'open', label: 'open', icon: 'open'}],
            'no-csv',
        )
        assert.equal(disabled[0]?.disabled, true)
        assert.equal(disabled[0]?.disabledHint, 'no-csv')
        assert.equal(disabled[1]?.disabled, undefined)
    })

    it('builds specialized connection menus and returns null for JDBC / three-tier', () => {
        assert.equal(buildSpecializedConnectionMenuItems('mysql', t), null)
        assert.equal(buildSpecializedConnectionMenuItems('trino', t), null)
        assert.equal(buildSpecializedConnectionMenuItems('sqlserver', t), null)
        const redis = buildSpecializedConnectionMenuItems('redis', t)
        assert.ok(redis)
        assert.deepEqual(redis.map((item) => item.id), [
            'open-redis-workbench',
            'edit',
            'move',
            'refresh',
            'copy-name',
            'divider-1',
            'delete',
        ])
        const kafka = buildSpecializedConnectionMenuItems('kafka', t)
        assert.ok(kafka?.some((item) => item.id === 'publish-table-data'))
        const ssh = buildSpecializedConnectionMenuItems('ssh', t)
        assert.ok(ssh?.some((item) => item.id === 'new-ssh-terminal'))
        assert.ok(!ssh?.some((item) => item.id === 'open-ssh-script-records'))
    })
})
