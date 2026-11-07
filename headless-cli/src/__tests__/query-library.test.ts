import assert from 'node:assert/strict'
import {mkdtempSync, mkdirSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, it} from 'node:test'
import {
    hasValidationErrors,
    hasValidationFailures,
    loadQueryLibraryManifest,
    queriesForCiRun,
    resolveManifestRoot,
    validateQueryLibraryManifest,
} from '../query-library/manifest.js'
import {queryLibraryRunExitCode} from '../query-library/run.js'
import {QUERY_LIBRARY_MANIFEST_VERSION} from '../query-library/types.js'

function writeFixture(dir: string) {
    mkdirSync(join(dir, 'queries'), {recursive: true})
    writeFileSync(join(dir, 'queries', 'health.sql'), 'SELECT 1 AS ok;\n', 'utf8')
    writeFileSync(join(dir, 'query-library.json'), JSON.stringify({
        version: QUERY_LIBRARY_MANIFEST_VERSION,
        queries: [
            {
                id: 'health-check',
                name: 'Health check',
                file: 'queries/health.sql',
                connection: 'conn-staging',
                database: 'shop',
                tags: ['ci'],
                ci: {enabled: true, maxRows: 5, expectMinRows: 1},
            },
        ],
    }, null, 2), 'utf8')
}

describe('query-library manifest', () => {
    it('loads and validates a valid manifest', () => {
        const dir = mkdtempSync(join(tmpdir(), 'dw-ql-'))
        mkdirSync(join(dir, 'queries'), {recursive: true})
        writeFileSync(join(dir, 'queries', 'health.sql'), 'SELECT 1;\n', 'utf8')
        writeFileSync(join(dir, 'query-library.json'), JSON.stringify({
            version: QUERY_LIBRARY_MANIFEST_VERSION,
            queries: [{
                id: 'health-check',
                name: 'Health check',
                file: 'queries/health.sql',
                connection: 'conn-staging',
                ci: {enabled: true},
            }],
        }), 'utf8')

        const manifestPath = join(dir, 'query-library.json')
        const manifest = loadQueryLibraryManifest(manifestPath)
        const issues = validateQueryLibraryManifest(manifest, resolveManifestRoot(manifestPath))
        assert.equal(hasValidationErrors(issues), false)
    })

    it('reports duplicate ids and missing sql files', () => {
        const dir = mkdtempSync(join(tmpdir(), 'dw-ql-'))
        const manifestPath = join(dir, 'query-library.json')
        writeFileSync(manifestPath, JSON.stringify({
            version: QUERY_LIBRARY_MANIFEST_VERSION,
            queries: [
                {id: 'dup', name: 'A', file: 'missing.sql', connection: 'conn-1'},
                {id: 'dup', name: 'B', file: 'missing.sql', connection: 'conn-1'},
            ],
        }), 'utf8')

        const manifest = loadQueryLibraryManifest(manifestPath)
        const issues = validateQueryLibraryManifest(manifest, resolveManifestRoot(manifestPath))
        assert.equal(hasValidationErrors(issues), true)
        assert.ok(issues.some((issue) => issue.message.includes('duplicate id')))
        assert.ok(issues.some((issue) => issue.message.includes('SQL file not found')))
    })

    it('filters CI-enabled queries', () => {
        const dir = mkdtempSync(join(tmpdir(), 'dw-ql-'))
        writeFixture(dir)
        const manifestPath = join(dir, 'query-library.json')
        const manifest = loadQueryLibraryManifest(manifestPath)
        manifest.queries.push({
            id: 'manual-only',
            name: 'Manual',
            file: 'queries/health.sql',
            connection: 'conn-staging',
            ci: {enabled: false},
        })

        const all = queriesForCiRun(manifest)
        assert.equal(all.length, 1)
        assert.equal(all[0]?.id, 'health-check')

        const single = queriesForCiRun(manifest, 'health-check')
        assert.equal(single.length, 1)
    })

    it('computes run exit code from results', () => {
        assert.equal(queryLibraryRunExitCode([{id: 'a', name: 'A', status: 'success'}]), 0)
        assert.equal(queryLibraryRunExitCode([{id: 'a', name: 'A', status: 'failed', message: 'x'}]), 1)
        assert.equal(queryLibraryRunExitCode([]), 1)
    })

    it('treats warnings as failures in strict mode', () => {
        const dir = mkdtempSync(join(tmpdir(), 'dw-ql-'))
        mkdirSync(join(dir, 'queries'), {recursive: true})
        writeFileSync(join(dir, 'queries', 'q.sql'), 'SELECT 1;\n', 'utf8')
        const manifestPath = join(dir, 'query-library.json')
        writeFileSync(manifestPath, JSON.stringify({
            version: QUERY_LIBRARY_MANIFEST_VERSION,
            queries: [{
                id: 'no-conn',
                name: 'No connection',
                file: 'queries/q.sql',
                connection: '',
            }],
        }), 'utf8')

        const manifest = loadQueryLibraryManifest(manifestPath)
        const issues = validateQueryLibraryManifest(manifest, resolveManifestRoot(manifestPath))
        assert.equal(hasValidationErrors(issues), false)
        assert.equal(hasValidationFailures(issues, false), false)
        assert.equal(hasValidationFailures(issues, true), true)
    })
})
