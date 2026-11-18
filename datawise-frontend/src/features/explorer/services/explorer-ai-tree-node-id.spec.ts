import {describe, expect, it} from 'vitest'
import {
    connectionAiFolderNodeId,
    connectionScriptsFolderNodeId,
    schemaNodeIdSlug,
} from '@/features/explorer/services/explorer-ai-tree.service'

describe('connection scripts/ai folder node ids', () => {
    it('slugs CatalogSchemaScope keys like SchemaNodeIds.slug', () => {
        expect(schemaNodeIdSlug('_scripts')).toBe('scripts')
        expect(schemaNodeIdSlug('_connection')).toBe('connection')
    })

    it('builds backend-aligned folder ids', () => {
        expect(connectionScriptsFolderNodeId('conn-1')).toBe('folder-scripts-conn-1-scripts')
        expect(connectionAiFolderNodeId('conn-1')).toBe('folder-ai-conn-1-connection')
    })
})
