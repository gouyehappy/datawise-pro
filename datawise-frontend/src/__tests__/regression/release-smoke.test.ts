import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {mkdtempSync, writeFileSync, mkdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {
    validateDesktopPackagingMarker,
    validateReleaseZipName,
    validateSizeReport,
} from '../../../scripts/desktop/release-smoke.mjs'

function sampleReport(overrides: Record<string, unknown> = {}) {
    return {
        profile: 'core',
        totalBytes: 200 * 1024 * 1024,
        totalMb: 200,
        buckets: {
            runtime: {bytes: 120 * 1024 * 1024, mb: 120, pct: 60},
            backend: {bytes: 40 * 1024 * 1024, mb: 40, pct: 20},
            plugins: {bytes: 10 * 1024 * 1024, mb: 10, pct: 5},
            drivers: {bytes: 200, mb: 0, pct: 0},
            'frontend-dist': {bytes: 20 * 1024 * 1024, mb: 20, pct: 10},
            'app-native': {bytes: 5 * 1024 * 1024, mb: 5, pct: 2.5},
            other: {bytes: 5 * 1024 * 1024, mb: 5, pct: 2.5},
        },
        largest: [{path: 'runtime/bin/java', bytes: 1, mb: 0}],
        ...overrides,
    }
}

describe('release-smoke validators', () => {
    it('accepts a healthy core size-report', () => {
        assert.deepEqual(validateSizeReport(sampleReport()), [])
    })

    it('rejects drivers JAR bloat and missing runtime', () => {
        const errors = validateSizeReport(
            sampleReport({
                buckets: {
                    ...sampleReport().buckets,
                    runtime: {bytes: 1, mb: 0, pct: 0},
                    drivers: {bytes: 5_000_000, mb: 4.8, pct: 2},
                },
            }),
        )
        assert.ok(errors.some((e) => e.includes('runtime')))
        assert.ok(errors.some((e) => e.includes('drivers')))
    })

    it('enforces zip naming per profile', () => {
        assert.deepEqual(
            validateReleaseZipName('DataWiseCLI-4.1.6-windows-x64.zip', 'core'),
            [],
        )
        assert.ok(
            validateReleaseZipName('DataWiseCLI-4.1.6-slim-windows-x64.zip', 'core').length > 0,
        )
        assert.deepEqual(
            validateReleaseZipName('DataWiseCLI-4.1.6-full-linux-x64.zip', 'full'),
            [],
        )
    })

    it('accepts desktop-packaging.json marker', () => {
        const dir = mkdtempSync(join(tmpdir(), 'dw-packaging-'))
        const configDir = join(dir, 'config')
        mkdirSync(configDir, {recursive: true})
        const marker = join(configDir, 'desktop-packaging.json')
        writeFileSync(
            marker,
            JSON.stringify({
                profile: 'core',
                connectors: 'curated',
                drivers: 'download-on-connect',
            }),
        )
        assert.deepEqual(validateDesktopPackagingMarker(marker, 'core'), [])
        assert.ok(validateDesktopPackagingMarker(marker, 'slim').some((e) => e.includes('expected')))
    })
})
