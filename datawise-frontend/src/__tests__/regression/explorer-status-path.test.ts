import assert from 'node:assert/strict'
import {describe, test} from 'node:test'
import type {TreeNode} from '@/core/types'
import {
    buildExplorerStatusPath,
    formatConnectionEndpointLabel,
} from '@/features/explorer/services/explorer-status-path.service'

const t = (key: string) => {
    const map: Record<string, string> = {
        'explorer.title': '数据库',
        'explorer.treeCatalog.tables': '表',
    }
    return map[key] ?? key
}

describe('explorer-status-path', () => {
    test('formats connection endpoint as @host:port', () => {
        assert.equal(
            formatConnectionEndpointLabel({name: 'MySQL@localhost', host: '192.0.2.141', port: '3306'}),
            '@192.0.2.141:3306',
        )
    })

    test('builds database selection path like SQLark breadcrumb', () => {
        const tree: TreeNode[] = [
            {
                id: 'conn-1',
                label: 'MySQL@localhost',
                type: 'connection',
                children: [
                    {
                        id: 'db-1',
                        label: 'archive_repository',
                        type: 'database',
                        children: [],
                    },
                ],
            },
        ]
        const path = buildExplorerStatusPath(
            tree,
            'db-1',
            t,
            new Map([['conn-1', '@192.0.2.141:3306']]),
        )
        assert.deepEqual(
            path.map((segment) => [segment.kind, segment.label]),
            [
                ['connection', '@192.0.2.141:3306'],
                ['database', 'archive_repository'],
            ],
        )
    })

    test('includes table trail under database', () => {
        const tree: TreeNode[] = [
            {
                id: 'conn-1',
                label: 'MySQL@localhost',
                type: 'connection',
                children: [
                    {
                        id: 'db-1',
                        label: 'archive_repository',
                        type: 'database',
                        children: [
                            {
                                id: 'tables',
                                label: 'tables',
                                type: 'folder',
                                children: [
                                    {id: 'tbl-1', label: 'users', type: 'table'},
                                ],
                            },
                        ],
                    },
                ],
            },
        ]
        const path = buildExplorerStatusPath(
            tree,
            'tbl-1',
            t,
            new Map([['conn-1', '@192.0.2.141:3306']]),
        )
        assert.deepEqual(
            path.map((segment) => segment.label),
            ['@192.0.2.141:3306', 'archive_repository', 'users'],
        )
    })

    test('includes sql script and view model objects', () => {
        const tree: TreeNode[] = [
            {
                id: 'conn-1',
                label: 'MySQL@localhost',
                type: 'connection',
                children: [
                    {
                        id: 'db-1',
                        label: 'admin_db',
                        type: 'database',
                        children: [
                            {
                                id: 'ws',
                                label: 'workspaces',
                                type: 'folder',
                                children: [
                                    {id: 'sql-1', label: 'query.sql', type: 'sql_file'},
                                ],
                            },
                            {
                                id: 'models',
                                label: 'models',
                                type: 'folder',
                                children: [
                                    {id: 'vm-1', label: 'sales_view', type: 'view_model'},
                                ],
                            },
                        ],
                    },
                ],
            },
        ]
        const sqlPath = buildExplorerStatusPath(tree, 'sql-1', t, new Map([['conn-1', '@192.0.2.141:3306']]))
        assert.deepEqual(
            sqlPath.map((segment) => segment.label),
            ['@192.0.2.141:3306', 'admin_db', 'query.sql'],
        )
        const modelPath = buildExplorerStatusPath(tree, 'vm-1', t, new Map([['conn-1', '@192.0.2.141:3306']]))
        assert.deepEqual(
            modelPath.map((segment) => segment.label),
            ['@192.0.2.141:3306', 'admin_db', 'sales_view'],
        )
    })
})
