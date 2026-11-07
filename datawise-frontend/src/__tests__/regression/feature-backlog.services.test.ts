import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    createEmptyKnowledgeEntry,
    formatCommaList,
    normalizeKnowledgeEntry,
    parseCommaList,
} from '@/features/ai/knowledge/types/ai-knowledge.types'
import {buildPromptWithAttachments, isTextAttachment} from '@/features/ai/chat/services/chat-attachment.service'
import {buildQualifiedTableName, quoteSqlIdentifier} from '@/features/connection/services/sql-dialect.service'
import {
    normalizeConnectionEnvironment,
    resolveConnectionEnvironmentLabel,
    resolveConnectionEnvironmentVariant,
    resolveConnectionEnvBadgeTone,
    resolveConnectionEnvTreeLabel,
} from '@/features/connection/services/connection-environment.service'
import {isWorkspaceTabProduction, resolveWorkspaceTabConnectionIds} from '@/features/workspace/services/workspace-production-banner.service'
import {
    isDangerousSqlWhitelisted,
    matchesTableGlob,
    needsDangerousSqlConfirmation,
    shouldConfirmDangerousSql,
} from '@/features/workspace/services/dangerous-sql-confirm-policy.service'
import {analyzeDangerousSql} from '@/features/workspace/services/dangerous-sql-preview.service'
import {DEFAULT_DANGEROUS_SQL_PREFERENCES} from '@/shared/config/app-config.defaults'
import {isCsvImportSupported, isDbTypeSupported, supportsSqlExecute, supportsTableMutation, supportsSqlExplain, supportsSessionKill, supportsLockMonitor, supportsOnlineDdl, filterConnectionCapabilityMenuItems} from '@/shared/capabilities/db-type-capabilities'
import {CAPABILITY_HINT_I18N} from '@/shared/capabilities/capability-keys'
import type {ContextMenuItem} from '@/core/types'

describe('ai-knowledge.types', () => {
    it('normalizes valid entries', () => {
        const entry = normalizeKnowledgeEntry({
            id: 'kb-1',
            term: 'GMV',
            definition: 'Gross merchandise volume',
            synonyms: ['成交额'],
        })
        assert.equal(entry?.term, 'GMV')
        assert.deepEqual(entry?.synonyms, ['成交额'])
    })

    it('rejects blank term or definition', () => {
        assert.equal(normalizeKnowledgeEntry({id: 'x', term: '', definition: 'a'}), null)
    })

    it('parses comma lists', () => {
        assert.deepEqual(parseCommaList('a, b，c'), ['a', 'b', 'c'])
        assert.equal(formatCommaList(['x', 'y']), 'x, y')
    })

    it('creates empty entry shell', () => {
        const entry = createEmptyKnowledgeEntry('kb-new')
        assert.equal(entry.id, 'kb-new')
        assert.deepEqual(entry.synonyms, [])
    })
})

describe('chat-attachment.service', () => {
    it('detects text attachments by extension', () => {
        assert.equal(isTextAttachment(new File([''], 'query.sql', {type: ''})), true)
        assert.equal(isTextAttachment(new File([''], 'photo.png', {type: 'image/png'})), false)
    })

    it('inlines text attachment content into prompt', async () => {
        const file = new File(['SELECT 1'], 'q.sql', {type: 'text/plain'})
        const result = await buildPromptWithAttachments('Explain', [
            {id: '1', name: 'q.sql', file},
        ])
        assert.match(result.prompt, /Explain/)
        assert.match(result.prompt, /SELECT 1/)
        assert.deepEqual(result.skipped, [])
    })
})

describe('sql-dialect.service', () => {
    it('quotes mysql identifiers with backticks', () => {
        assert.equal(quoteSqlIdentifier('mysql', 'user`name'), '`user``name`')
        assert.equal(buildQualifiedTableName('mysql', 'db', 't'), '`db`.`t`')
    })

    it('builds oracle schema-qualified names in uppercase', () => {
        assert.equal(buildQualifiedTableName('oracle', 'hr', 'employees'), '"HR"."EMPLOYEES"')
    })

    it('builds sqlserver catalog.schema.table names with brackets', () => {
        assert.equal(
            buildQualifiedTableName('sqlserver', 'AdventureWorks', 'Person'),
            '[AdventureWorks].[dbo].[Person]',
        )
        assert.equal(
            buildQualifiedTableName('sqlserver', 'AdventureWorks.sales', 'Person'),
            '[AdventureWorks].[sales].[Person]',
        )
    })

    it('builds trino catalog.schema.table names with double quotes', () => {
        assert.equal(quoteSqlIdentifier('trino', 'hive'), '"hive"')
        assert.equal(
            buildQualifiedTableName('trino', 'hive.a003', 'agent_test3'),
            '"hive"."a003"."agent_test3"',
        )
    })
})

describe('db-type-capabilities', () => {
    it('marks jdbc types with csv import and redis without', () => {
        assert.equal(isDbTypeSupported('oracle'), true)
        assert.equal(isDbTypeSupported('mysql'), true)
        assert.equal(isCsvImportSupported('mysql'), true)
        assert.equal(isCsvImportSupported('postgresql'), true)
        assert.equal(isCsvImportSupported('redis'), false)
        assert.equal(CAPABILITY_HINT_I18N.csvImport, 'capabilities.unsupported.csvImport')
    })

    it('prefers catalog DML for csv import', () => {
        const catalog = [{
            id: 'mysql',
            label: 'MySQL',
            primary: true,
            defaultPort: '3306',
            jdbcDriverRequired: true,
            capabilities: ['SQL_EXECUTE'],
        }]
        assert.equal(isCsvImportSupported('mysql', catalog), false)
        assert.equal(isCsvImportSupported('mysql'), true)
    })

    it('disables sql console for mongodb redis and kafka', () => {
        assert.equal(supportsSqlExecute('mongodb'), false)
        assert.equal(supportsSqlExecute('redis'), false)
        assert.equal(supportsSqlExecute('kafka'), false)
        assert.equal(supportsSqlExecute('mysql'), true)
    })

    it('disables table grid mutations for document and kv stores', () => {
        assert.equal(supportsTableMutation('mongodb'), false)
        assert.equal(supportsTableMutation('redis'), false)
        assert.equal(supportsTableMutation('mysql'), true)
    })

    it('hides sql and dml explorer menu items for document stores', () => {
        const items: ContextMenuItem[] = [
            {id: 'open', label: 'Open'},
            {id: 'console', label: 'Console'},
            {id: 'truncate', label: 'Truncate'},
            {id: 'migrate-data', label: 'Migrate'},
            {id: 'schema-compare', label: 'Schema compare'},
            {id: 'cross-env-compare', label: 'Cross-env compare'},
            {id: 'export-sql', label: 'Export SQL', children: [{id: 'export-all', label: 'All'}]},
        ]
        const filtered = filterConnectionCapabilityMenuItems(items, 'mongodb')
        assert.deepEqual(filtered.map((item) => item.id), ['open'])
    })

    it('prefers catalog capabilities over static matrix', () => {
        const catalog = [{
            id: 'mysql',
            label: 'MySQL',
            primary: true,
            defaultPort: '3306',
            jdbcDriverRequired: true,
            capabilities: ['SQL_EXECUTE', 'SQL_EXPLAIN'],
        }]
        assert.equal(supportsSqlExplain('mysql', catalog), true)
        assert.equal(supportsSessionKill('mysql', catalog), false)
    })

    it('marks jdbc explain and session ops on mysql static fallback', () => {
        assert.equal(supportsSqlExplain('mysql'), true)
        assert.equal(supportsSessionKill('mysql'), true)
        assert.equal(supportsLockMonitor('postgresql'), true)
        assert.equal(supportsOnlineDdl('oracle'), true)
        assert.equal(supportsSqlExplain('redis'), false)
        assert.equal(supportsSessionKill('trino'), false)
    })
})

describe('connection-environment.service', () => {
    it('defaults blank env to dev', () => {
        assert.deepEqual(normalizeConnectionEnvironment(null, null), {env: 'dev'})
    })

    it('migrates legacy uppercase values', () => {
        assert.equal(normalizeConnectionEnvironment('PROD', null).env, 'prod')
        assert.equal(normalizeConnectionEnvironment('TEST', null).env, 'dev')
        assert.equal(normalizeConnectionEnvironment('STAGING', null).env, 'staging')
    })

    it('maps unknown labels to custom', () => {
        const normalized = normalizeConnectionEnvironment('QA', null)
        assert.equal(normalized.env, 'staging')
    })

    it('maps free-text UAT to staging', () => {
        assert.equal(normalizeConnectionEnvironment('UAT', null).env, 'staging')
        assert.equal(normalizeConnectionEnvironment('custom', 'UAT').env, 'staging')
    })

    it('resolves display labels and variants', () => {
        assert.equal(resolveConnectionEnvironmentLabel('prod', null), 'prod')
        assert.equal(resolveConnectionEnvironmentVariant('prod'), 'error')
        assert.equal(resolveConnectionEnvironmentVariant('dev'), 'primary')
    })

    it('resolves tree badge tone and short labels', () => {
        assert.equal(resolveConnectionEnvBadgeTone('UAT', null), 'staging')
        assert.equal(resolveConnectionEnvBadgeTone('custom', 'TEXT'), 'custom')
        assert.equal(resolveConnectionEnvTreeLabel('prod', null), 'prod')
        assert.equal(resolveConnectionEnvTreeLabel('custom', 'TEXT'), 'TEXT')
    })
})

describe('workspace-production-banner.service', () => {
    it('detects production connection on active tab', () => {
        const tree = [{
            id: 'conn-prod',
            label: 'prod-mysql',
            type: 'connection' as const,
            env: 'prod',
        }]
        const tab = {
            id: 'tab-1',
            title: 'Console',
            type: 'console' as const,
            closable: true,
            connectionId: 'conn-prod',
        }
        assert.equal(
            isWorkspaceTabProduction(tab, tree, (id) => tree.find((node) => node.id === id) ?? null),
            true,
        )
    })

    it('ignores dev connections', () => {
        const tree = [{
            id: 'conn-dev',
            label: 'dev-mysql',
            type: 'connection' as const,
            env: 'dev',
        }]
        const tab = {
            id: 'tab-1',
            title: 'Console',
            type: 'console' as const,
            closable: true,
            connectionId: 'conn-dev',
        }
        assert.equal(
            isWorkspaceTabProduction(tab, tree, (id) => tree.find((node) => node.id === id) ?? null),
            false,
        )
    })

    it('includes cross-env compare scopes in tab connection ids', () => {
        const tree = [{
            id: 'conn-prod',
            label: 'prod-mysql',
            type: 'connection' as const,
            env: 'prod',
        }]
        const tab = {
            id: 'tab-x',
            title: 'Cross-env',
            type: 'cross-env-compare' as const,
            closable: true,
            crossEnvCompareRight: {
                connectionId: 'conn-prod',
                connectionLabel: 'prod-mysql',
                database: 'shop',
                dbType: 'mysql' as const,
            },
        }
        assert.deepEqual(resolveWorkspaceTabConnectionIds(tab, tree), ['conn-prod'])
        assert.equal(
            isWorkspaceTabProduction(tab, tree, (id) => tree.find((node) => node.id === id) ?? null),
            true,
        )
    })
})

describe('dangerous-sql-confirm-policy.service', () => {
    it('matches table globs', () => {
        assert.equal(matchesTableGlob('staging_*', 'staging_orders'), true)
        assert.equal(matchesTableGlob('orders', 'staging_orders'), false)
    })

    it('skips confirmation on development without whitelist', () => {
        const preview = analyzeDangerousSql('DELETE FROM staging_orders')!
        assert.equal(shouldConfirmDangerousSql(preview, {
            env: 'dev',
            preferences: DEFAULT_DANGEROUS_SQL_PREFERENCES,
        }), false)
    })

    it('still confirms on staging with default preferences', () => {
        const preview = analyzeDangerousSql('DELETE FROM staging_orders')!
        assert.equal(shouldConfirmDangerousSql(preview, {
            env: 'staging',
            preferences: DEFAULT_DANGEROUS_SQL_PREFERENCES,
        }), true)
    })

    it('skips confirmation for whitelisted tables on dev', () => {
        const preview = analyzeDangerousSql('DELETE FROM staging_orders')!
        assert.ok(preview)
        assert.equal(isDangerousSqlWhitelisted(preview, {
            ...DEFAULT_DANGEROUS_SQL_PREFERENCES,
            whitelistedTables: ['staging_*'],
        }), true)
        assert.equal(shouldConfirmDangerousSql(preview, {
            env: 'dev',
            preferences: {
                ...DEFAULT_DANGEROUS_SQL_PREFERENCES,
                whitelistedTables: ['staging_*'],
            },
        }), false)
    })

    it('forces confirmation on production even when whitelisted', () => {
        const preview = analyzeDangerousSql('DELETE FROM staging_orders')!
        assert.equal(shouldConfirmDangerousSql(preview, {
            env: 'prod',
            preferences: {
                ...DEFAULT_DANGEROUS_SQL_PREFERENCES,
                whitelistedTables: ['staging_*'],
            },
        }), true)
    })

    it('needsDangerousSqlConfirmation returns false for safe SQL', () => {
        assert.equal(needsDangerousSqlConfirmation('SELECT 1', {
            env: 'prod',
            preferences: DEFAULT_DANGEROUS_SQL_PREFERENCES,
        }), false)
    })

    it('needsDangerousSqlConfirmation respects production policy', () => {
        assert.equal(needsDangerousSqlConfirmation('DELETE FROM orders', {
            env: 'prod',
            preferences: DEFAULT_DANGEROUS_SQL_PREFERENCES,
        }), true)
        assert.equal(needsDangerousSqlConfirmation('DELETE FROM staging_orders', {
            env: 'dev',
            preferences: {
                ...DEFAULT_DANGEROUS_SQL_PREFERENCES,
                whitelistedTables: ['staging_*'],
            },
        }), false)
    })
})
