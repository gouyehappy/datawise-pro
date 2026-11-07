import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {groupJdbcDrivers, mapCatalogFamilies} from '@/features/settings/services/driver-package.service'
import {resolveDriverDelivery} from '@/features/settings/services/runtime-format.service'
import type {JdbcDriverCached, JdbcDriverFamily} from '@/features/datasource/types/datasource.types'

describe('groupJdbcDrivers', () => {
    it('groups same database type into one family with version children', () => {
        const drivers: JdbcDriverCached[] = [
            {fileName: 'hive-jdbc-3.1.2.jar', relativePath: 'hive/hive-jdbc-3.1.2.jar', sizeBytes: 100, loadedInMemory: true},
            {fileName: 'hive-common-3.1.2.jar', relativePath: 'hive/hive-common-3.1.2.jar', sizeBytes: 50, loadedInMemory: false},
            {fileName: 'libthrift-0.9.3.jar', relativePath: 'hive/libthrift-0.9.3.jar', sizeBytes: 20, loadedInMemory: false},
            {fileName: 'hive-jdbc-0.10.0.jar', relativePath: 'hive-jdbc-0.10.0.jar', sizeBytes: 30, loadedInMemory: false},
            {fileName: 'postgresql-42.6.0.jar', relativePath: 'postgresql-42.6.0.jar', sizeBytes: 40, loadedInMemory: false},
            {fileName: 'postgresql-42.7.4.jar', relativePath: 'postgresql-42.7.4.jar', sizeBytes: 45, loadedInMemory: true},
            {fileName: 'mysql-connector-j-8.4.0.jar', relativePath: 'mysql-connector-j-8.4.0.jar', sizeBytes: 200, loadedInMemory: true},
        ]
        const families = groupJdbcDrivers(drivers)
        assert.equal(families.length, 3)

        const hive = families.find((f) => f.id === 'hive')
        assert.ok(hive)
        assert.equal(hive!.label, 'Apache Hive')
        assert.equal(hive!.versionCount, 2)
        assert.equal(hive!.jarCount, 4)

        const pg = families.find((f) => f.id === 'postgresql')
        assert.ok(pg)
        assert.equal(pg!.versionCount, 2)
        assert.equal(pg!.activeVersion, '42.7.4')
        assert.equal(pg!.versions[0].version, '42.7.4')
        assert.equal(pg!.versions[1].version, '42.6.0')

        const mysql = families.find((f) => f.id === 'mysql')
        assert.ok(mysql)
        assert.equal(mysql!.versionCount, 1)
    })
})

describe('mapCatalogFamilies', () => {
    it('keeps missing catalog drivers visible with install metadata', () => {
        const families: JdbcDriverFamily[] = [
            {
                id: 'oracle',
                label: 'Oracle',
                defaultMaven: 'com.oracle.database.jdbc:ojdbc11:23.5.0.24.07',
                driverClass: 'oracle.jdbc.OracleDriver',
                relatedDbTypes: ['oracle'],
                status: 'missing',
                bundle: false,
                bundleDir: null,
                jarCount: 0,
                sizeBytes: 0,
                jars: [],
            },
            {
                id: 'postgresql',
                label: 'PostgreSQL',
                defaultMaven: 'org.postgresql:postgresql:42.7.4',
                driverClass: 'org.postgresql.Driver',
                relatedDbTypes: ['postgresql', 'greenplum'],
                status: 'loaded',
                bundle: false,
                bundleDir: null,
                jarCount: 1,
                sizeBytes: 45,
                jars: [
                    {
                        fileName: 'postgresql-42.7.4.jar',
                        relativePath: 'postgresql-42.7.4.jar',
                        sizeBytes: 45,
                        loadedInMemory: true,
                    },
                ],
            },
        ]
        const mapped = mapCatalogFamilies(families)
        assert.equal(mapped.length, 2)
        assert.equal(mapped[0].status, 'missing')
        assert.equal(mapped[0].defaultMaven.includes('ojdbc11'), true)
        assert.equal(mapped[0].delivery, 'sidecar')
        assert.equal(mapped[1].status, 'loaded')
        assert.equal(mapped[1].delivery, 'core')
    })
})

describe('mapCatalogFamilies extras', () => {
    it('preserves relatedDbTypes and versionCount', () => {
        const families: JdbcDriverFamily[] = [
            {
                id: 'postgresql',
                label: 'PostgreSQL',
                defaultMaven: 'org.postgresql:postgresql:42.7.4',
                driverClass: 'org.postgresql.Driver',
                relatedDbTypes: ['postgresql', 'greenplum'],
                status: 'loaded',
                bundle: false,
                bundleDir: null,
                jarCount: 1,
                sizeBytes: 45,
                jars: [
                    {
                        fileName: 'postgresql-42.7.4.jar',
                        relativePath: 'postgresql-42.7.4.jar',
                        sizeBytes: 45,
                        loadedInMemory: true,
                    },
                ],
            },
        ]
        const mapped = mapCatalogFamilies(families)
        assert.equal(mapped[0].relatedDbTypes.includes('greenplum'), true)
        assert.equal(mapped[0].versionCount, 1)
    })
})

describe('resolveDriverDelivery', () => {
    it('classifies core / sidecar / on-demand', () => {
        assert.equal(resolveDriverDelivery('postgresql', ['postgresql']), 'core')
        assert.equal(resolveDriverDelivery('hive', [], true), 'sidecar')
        assert.equal(resolveDriverDelivery('oracle', ['oracle']), 'sidecar')
        assert.equal(resolveDriverDelivery('h2', ['h2']), 'on-demand')
        assert.equal(resolveDriverDelivery('x', [], false, 'sidecar'), 'sidecar')
    })
})
