import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildCreateDatabaseSql,
    buildCreateSchemaSql,
    filterCreateNamespaceMenuItems,
    resolveCreateNamespaceErrorMessage,
    supportsCreateDatabase,
    supportsCreateSchema,
    supportsMysqlCharsetOptions,
} from '@/features/explorer/services/create-namespace.service'

describe('create-namespace.service', () => {
    it('builds mysql create database with charset and collation', () => {
        assert.equal(
            buildCreateDatabaseSql('mysql', 'test', 'utf8mb4', 'utf8mb4_general_ci'),
            "CREATE DATABASE `test` CHARACTER SET 'utf8mb4' COLLATE 'utf8mb4_general_ci'",
        )
    })

    it('builds postgresql schema and catalog-qualified schema', () => {
        assert.equal(buildCreateSchemaSql('postgresql', 'app'), 'CREATE SCHEMA "app"')
        assert.equal(
            buildCreateSchemaSql('trino', 'reporting', 'hive'),
            'CREATE SCHEMA "hive"."reporting"',
        )
    })

    it('gates capabilities by db type', () => {
        assert.equal(supportsCreateDatabase('mysql'), true)
        assert.equal(supportsCreateDatabase('oracle'), false)
        assert.equal(supportsCreateSchema('postgresql'), true)
        assert.equal(supportsCreateSchema('mysql'), false)
        assert.equal(supportsMysqlCharsetOptions('mariadb'), true)
    })

    it('filters unsupported namespace menu items', () => {
        const items = [
            {id: 'console', label: 'Console'},
            {id: 'create-database', label: 'DB'},
            {id: 'create-schema', label: 'Schema'},
            {id: 'edit', label: 'Edit'},
        ]
        const mysql = filterCreateNamespaceMenuItems(items, 'mysql').map((item) => item.id)
        assert.deepEqual(mysql, ['console', 'create-database', 'edit'])
        const pg = filterCreateNamespaceMenuItems(items, 'postgresql').map((item) => item.id)
        assert.deepEqual(pg, ['console', 'create-database', 'create-schema', 'edit'])
        const redis = filterCreateNamespaceMenuItems(items, 'redis').map((item) => item.id)
        assert.deepEqual(redis, ['console', 'edit'])
        const noDdl = filterCreateNamespaceMenuItems(items, 'mysql', {canDdl: false}).map((item) => item.id)
        assert.deepEqual(noDdl, ['console', 'edit'])
        const withDelete = [
            ...items,
            {id: 'delete-database', label: 'Drop'},
        ]
        const redisDrop = filterCreateNamespaceMenuItems(withDelete, 'redis').map((item) => item.id)
        assert.deepEqual(redisDrop, ['console', 'edit'])
        const mysqlDrop = filterCreateNamespaceMenuItems(withDelete, 'mysql').map((item) => item.id)
        assert.deepEqual(mysqlDrop, ['console', 'create-database', 'edit', 'delete-database'])
    })

    it('maps CONNECTION_ACCESS_DENIED to createNamespace.accessDenied', () => {
        const t = (key: string) => key
        assert.equal(
            resolveCreateNamespaceErrorMessage(new Error('CONNECTION_ACCESS_DENIED'), t),
            'explorer.createNamespace.accessDenied',
        )
        assert.equal(
            resolveCreateNamespaceErrorMessage(
                new Error('CONNECTION_ACCESS_DENIED connectionId=x required=DDL actual=READONLY'),
                t,
            ),
            'explorer.createNamespace.accessDenied',
        )
    })
})
