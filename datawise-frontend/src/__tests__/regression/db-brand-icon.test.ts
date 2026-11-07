import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    resolveDbBrandIcon,
    resolveDbBrandIconColor,
} from '@/features/connection/constants/db-brand-icon'

describe('db-brand-icon', () => {
    it('resolves MySQL and PostgreSQL brand icons', () => {
        const mysql = resolveDbBrandIcon('mysql')
        const postgresql = resolveDbBrandIcon('postgresql')

        assert.equal(mysql.title, 'MySQL')
        assert.equal(postgresql.title, 'PostgreSQL')
        assert.ok(mysql.path.length > 100)
        assert.ok(postgresql.path.length > 100)
        assert.notEqual(mysql.path, postgresql.path)
    })

    it('normalizes icon visual scale across brands', () => {
        const mysql = resolveDbBrandIcon('mysql')
        const oracle = resolveDbBrandIcon('oracle')

        assert.ok(mysql.scale > 0)
        assert.ok(oracle.scale > 0)
        assert.notEqual(mysql.scale, oracle.scale)
    })

    it('uses brighter fills for dark theme', () => {
        const kafkaLight = resolveDbBrandIconColor('kafka', false)
        const kafkaDark = resolveDbBrandIconColor('kafka', true)

        assert.equal(kafkaLight, '#231F20')
        assert.equal(kafkaDark, '#E5E7EB')
    })

    it('uses official multi-color StarRocks logo', () => {
        const starrocks = resolveDbBrandIcon('starrocks')

        assert.equal(starrocks.title, 'StarRocks')
        assert.equal(starrocks.hex, '#01808F')
        assert.equal(starrocks.layers?.length, 4)
        assert.equal(starrocks.layers?.[3].fill, '#FEBD02')
        assert.notEqual(starrocks.path, 'M12 4.2l2.1 4.3 4.7.7-3.4 3.3.8 4.7L12 14.8l-4.2 2.2.8-4.7-3.4-3.3 4.7-.7L12 4.2z')
    })

    it('normalizes aliases and falls back for unknown types', () => {
        assert.equal(resolveDbBrandIcon('postgres').title, 'PostgreSQL')
        assert.equal(resolveDbBrandIcon('mssql').title, 'SQL Server')
        assert.equal(resolveDbBrandIcon('unknown-db').title, 'Database')
    })

    it('uses official simple-icons for TiDB / Elasticsearch / Kylin / H2', () => {
        assert.equal(resolveDbBrandIcon('tidb').title, 'TiDB')
        assert.equal(resolveDbBrandIcon('tidb').hex, '#DC150B')
        assert.equal(resolveDbBrandIcon('elasticsearch').title, 'Elasticsearch')
        assert.equal(resolveDbBrandIcon('elasticsearch').hex, '#005571')
        assert.equal(resolveDbBrandIcon('kylin').title, 'Apache Kylin')
        assert.equal(resolveDbBrandIcon('h2').title, 'H2 Database')
        for (const type of ['tidb', 'elasticsearch', 'kylin', 'h2']) {
            assert.ok(resolveDbBrandIcon(type).path.length > 100, `${type} should use official vector path`)
        }
    })

    it('uses Huawei glyph for GaussDB', () => {
        const gaussdb = resolveDbBrandIcon('gaussdb')
        assert.equal(gaussdb.title, 'GaussDB')
        assert.equal(gaussdb.hex, '#C7000B')
        assert.ok(gaussdb.path.length > 100)
    })

    it('uses official vectors for Oracle / SQL Server / Db2 / OceanBase / TDengine / Sybase', () => {
        const cases: Array<[string, string]> = [
            ['oracle', '#EA1B22'],
            ['sqlserver', '#CC2927'],
            ['db2', '#0F62FE'],
            ['oceanbase', '#0181FD'],
            ['tdengine', '#0041CE'],
            ['sybase', '#0070F2'],
        ]
        for (const [type, hex] of cases) {
            const icon = resolveDbBrandIcon(type)
            assert.equal(icon.hex, hex, `${type} brand color`)
            assert.ok(icon.path.length > 100, `${type} should use official vector path`)
            assert.equal(icon.label, undefined, `${type} should not fall back to letter badge`)
        }
    })

    it('renders letter badges for brands without official vectors', () => {
        const cases: Array<[string, string]> = [
            ['dm', 'DM'],
            ['kingbase', 'KB'],
            ['greenplum', 'GP'],
            ['opengauss', 'OG'],
            ['gbase8a', 'G8'],
            ['oscar', 'OS'],
            ['highgo', 'HG'],
            ['phoenix', 'PHX'],
            ['kudu', 'KDU'],
            ['cachedb', 'Ca'],
            ['hsql', 'HSQ'],
        ]
        for (const [type, label] of cases) {
            const icon = resolveDbBrandIcon(type)
            assert.equal(icon.label, label, `${type} should use letter badge ${label}`)
            assert.ok(icon.label!.length <= 3)
        }
    })

    it('every catalog db type resolves to a non-generic icon', () => {
        const catalogTypes = [
            'mysql', 'oracle', 'postgresql', 'sqlserver', 'mariadb', 'clickhouse',
            'dm', 'oscar', 'presto', 'trino', 'db2', 'redis', 'kafka', 'mongodb',
            'sqlite', 'hive', 'kudu', 'oceanbase', 'kingbase', 'greenplum', 'opengauss',
            'highgo', 'gbase8a', 'elasticsearch', 'kylin', 'starrocks', 'doris',
            'tidb', 'tdengine', 'sybase', 'phoenix', 'cachedb', 'h2', 'hsql',
            'dameng', 'gaussdb', 'flink',
        ]
        for (const type of catalogTypes) {
            const icon = resolveDbBrandIcon(type)
            assert.notEqual(icon.title, 'Database', `${type} should not fall back to generic icon`)
        }
    })
})
