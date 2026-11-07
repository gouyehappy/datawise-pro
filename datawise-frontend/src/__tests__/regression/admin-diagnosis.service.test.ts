import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildAdminMaintenanceSql,
    buildAdminPrivilegesQuery,
    buildAdminStorageQuery,
    parseAdminPrivilegeRows,
    parseAdminStorageRows,
    supportsAdminPrivileges,
    supportsAdminStorage,
} from '@/features/workspace/services/admin-diagnosis.service'

describe('admin-diagnosis.service', () => {
    it('supports mysql and postgres families only', () => {
        assert.equal(supportsAdminPrivileges('mysql'), true)
        assert.equal(supportsAdminStorage('postgresql'), true)
        assert.equal(supportsAdminPrivileges('redis'), false)
        assert.equal(supportsAdminStorage('clickhouse'), false)
    })

    it('builds mysql privilege and storage queries', () => {
        const privileges = buildAdminPrivilegesQuery('mysql')
        const storage = buildAdminStorageQuery('mariadb')
        assert.ok(privileges?.sql.includes('information_schema'))
        assert.ok(privileges?.sql.includes('privilege_rows'))
        assert.ok(storage?.sql.includes('DATA_LENGTH'))
    })

    it('builds postgres privilege and storage queries', () => {
        const privileges = buildAdminPrivilegesQuery('postgresql')
        const storage = buildAdminStorageQuery('opengauss')
        assert.ok(privileges?.sql.includes('pg_roles'))
        assert.ok(storage?.sql.includes('pg_total_relation_size'))
    })

    it('parses privilege and storage rows with flexible column names', () => {
        const privileges = parseAdminPrivilegeRows([
            {
                GRANTEE: "'app'@'%'",
                TABLE_SCHEMA: 'app',
                TABLE_NAME: 'orders',
                PRIVILEGE_TYPE: 'SELECT',
                IS_GRANTABLE: 'NO',
            },
        ])
        assert.equal(privileges[0]?.principal, "'app'@'%'")
        assert.equal(privileges[0]?.privilege, 'SELECT')

        const storage = parseAdminStorageRows(
            [{object_name: 'orders', engine: 'InnoDB', total_mb: '12.5', data_mb: '10', index_mb: '2.5'}],
            'mysql',
        )
        assert.equal(storage[0]?.objectName, 'orders')
        assert.equal(storage[0]?.totalSize, '12.5 MB')
    })

    it('builds maintenance SQL drafts without executing', () => {
        const mysql = buildAdminMaintenanceSql('mysql', 'orders')
        const pg = buildAdminMaintenanceSql('postgresql', 'orders')
        assert.ok(mysql?.includes('ANALYZE TABLE'))
        assert.ok(pg?.includes('VACUUM (ANALYZE)'))
        assert.equal(buildAdminMaintenanceSql('redis', 'k'), null)
    })
})
