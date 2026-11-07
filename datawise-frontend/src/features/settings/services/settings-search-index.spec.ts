import {describe, expect, it} from 'vitest'
import {
    buildMcpCursorConfigJson,
} from '@/features/settings/services/mcp-settings.service'
import {searchSettingsIndex} from '@/features/settings/services/settings-search-index'
import type {SettingsSection} from '@/core/types'

describe('settings-search-index', () => {
    const allowed = new Set<SettingsSection>(['basic', 'mcp', 'sqlEditor', 'integrations'])

    it('finds MCP by keyword', () => {
        const hits = searchSettingsIndex('mcp', {
            translate: (key) => key,
            allowedSections: allowed,
        })
        expect(hits.some((h) => h.section === 'mcp')).toBe(true)
    })

    it('finds readonly under sql editor keywords', () => {
        const hits = searchSettingsIndex('只读', {
            translate: (key) => key,
            allowedSections: allowed,
        })
        expect(hits.some((h) => h.section === 'sqlEditor')).toBe(true)
    })
})

describe('mcp-settings.service', () => {
    it('embeds allowlist env in Cursor JSON', () => {
        const json = buildMcpCursorConfigJson({
            apiUrl: 'http://localhost:18421/',
            connectionAllowlist: ['mysql-1', 'pg-2'],
            permissionTier: 'readonly',
        })
        expect(json).toContain('DATAWISE_CONNECTION_ALLOWLIST')
        expect(json).toContain('mysql-1,pg-2')
        expect(json).toContain('DATAWISE_PERMISSION_TIER')
        expect(json).toContain('http://localhost:18421')
        expect(json).not.toContain('http://localhost:18421/')
    })
})
