import {describe, expect, it, vi} from 'vitest'
import type {ConnectionConfig} from '@/core/types'
import {
    connectorEndpointFromConfig,
    isHttpConsoleUrl,
    openHttpConsole,
} from '@/features/workspace/composables/useConnectorWorkbenchHeader'

describe('connector kit helpers', () => {
    it('isHttpConsoleUrl accepts only http(s)', () => {
        expect(isHttpConsoleUrl('https://nacos.example/')).toBe(true)
        expect(isHttpConsoleUrl('http://localhost:8080')).toBe(true)
        expect(isHttpConsoleUrl('redis://localhost:6379')).toBe(false)
        expect(isHttpConsoleUrl('')).toBe(false)
        expect(isHttpConsoleUrl(undefined)).toBe(false)
    })

    it('connectorEndpointFromConfig prefers formatted then url then fallback', () => {
        const config = {url: 'https://from-url'} as ConnectionConfig
        expect(connectorEndpointFromConfig(config, 'label', () => 'https://formatted')).toBe(
            'https://formatted',
        )
        expect(connectorEndpointFromConfig(config, 'label', () => '')).toBe('https://from-url')
        expect(connectorEndpointFromConfig({} as ConnectionConfig, 'label', () => null)).toBe(
            'label',
        )
    })

    it('openHttpConsole opens blank window for http urls only', async () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        openHttpConsole('https://example.com')
        await Promise.resolve()
        expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')
        open.mockClear()
        openHttpConsole('redis://x')
        await Promise.resolve()
        expect(open).not.toHaveBeenCalled()
        open.mockRestore()
    })
})
