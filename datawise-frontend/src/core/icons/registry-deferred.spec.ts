import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'
import {DW_ICON_DEFERRED_NAMES, DW_ICON_DEFERRED_REGISTRY} from '@/core/icons/registry-deferred'

const here = dirname(fileURLToPath(import.meta.url))

describe('registry-deferred (PERF-09)', () => {
    it('keeps a non-empty deferred Lucide set', () => {
        expect(DW_ICON_DEFERRED_NAMES.length).toBeGreaterThanOrEqual(10)
        expect(DW_ICON_DEFERRED_REGISTRY['chart-bar']).toBeTruthy()
        expect(DW_ICON_DEFERRED_REGISTRY['settings-basic']).toBeTruthy()
    })

    it('does not static-import deferred Lucide glyphs from the shell registry', () => {
        const shell = readFileSync(join(here, 'registry.ts'), 'utf8')
        for (const name of [
            'ChartColumn',
            'ChartPie',
            'LineChart',
            'Grid3x3',
            'TrendingUp',
            'ShieldCheck',
            'Webhook',
            'SlidersHorizontal',
            'FileCog',
            'GitCompare',
            'ListVideo',
            'FileDiff',
            'FileSpreadsheet',
            'Share2',
        ]) {
            expect(shell, name).not.toMatch(new RegExp(`\\b${name}\\b`))
        }
    })
})
