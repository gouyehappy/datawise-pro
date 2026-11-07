import {describe, expect, it} from 'vitest'
import {
    applyElasticsearchEndpointOptions,
    elasticsearchConnectionMode,
    normalizeElasticsearchConnectivityCheckPath,
    normalizeKibanaBasePath,
} from '@/features/connection/utils/elasticsearch-endpoint'

describe('elasticsearch-endpoint', () => {
    it('normalizes kibana and connectivity paths', () => {
        expect(normalizeKibanaBasePath('kibana/')).toBe('/kibana')
        expect(normalizeElasticsearchConnectivityCheckPath('GET /_cluster/health')).toBe('/_cluster/health')
        expect(normalizeElasticsearchConnectivityCheckPath('/')).toBe('')
    })

    it('applies kibana mode and flags into advancedConfig', () => {
        const next = applyElasticsearchEndpointOptions('', {
            mode: 'kibana',
            kibanaBasePath: 'kibana',
            connectivityCheckPath: '/_cat/health',
            connectivityCheckDisabled: true,
            useHttps: true,
        })
        expect(elasticsearchConnectionMode(next)).toBe('kibana')
        expect(next).toContain('mode=kibana')
        expect(next).toContain('kibanaBasePath=/kibana')
        expect(next).toContain('connectivityCheckPath=/_cat/health')
        expect(next).toContain('connectivityCheckDisabled=true')
        expect(next).toContain('useHttps=true')
    })

    it('clears kibana keys when switching to direct', () => {
        const seeded = applyElasticsearchEndpointOptions('', {
            mode: 'kibana',
            kibanaBasePath: '/kibana',
        })
        const next = applyElasticsearchEndpointOptions(seeded, {mode: 'direct'})
        expect(elasticsearchConnectionMode(next)).toBe('direct')
        expect(next).not.toContain('mode=')
        expect(next).not.toContain('kibanaBasePath=')
    })
})
