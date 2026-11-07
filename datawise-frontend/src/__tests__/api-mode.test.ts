import assert from 'node:assert/strict'
import {describe, it, beforeEach} from 'node:test'

import {
    API_SERVER_STORAGE_KEY,
    loadApiServerPreferences,
    normalizeApiServerUrl,
    readUserConfiguredApiBaseUrl,
    saveApiServerPreferences,
} from '@/shared/api/api-server-prefs'
import {DEFAULT_DESKTOP_API_BASE, readApiBaseUrl} from '@/shared/api/mode'
import {BACKEND_PACKAGED_PORT, FRONTEND_DEV_PORT} from '@/shared/config/runtime-ports'

describe('api-server-prefs', () => {
    beforeEach(() => {
        localStorage.removeItem(API_SERVER_STORAGE_KEY)
    })

    it('normalizes http(s) urls and strips trailing slash', () => {
        assert.equal(normalizeApiServerUrl('https://api.example.com/'), 'https://api.example.com')
        assert.equal(normalizeApiServerUrl('http://192.168.1.10:8080'), 'http://192.168.1.10:8080')
        assert.equal(normalizeApiServerUrl('https://api.example.com/v1/'), 'https://api.example.com/v1')
        assert.equal(normalizeApiServerUrl('https://api.example.com/api'), 'https://api.example.com')
        assert.equal(normalizeApiServerUrl('https://api.example.com/api/'), 'https://api.example.com')
    })

    it('rejects invalid urls', () => {
        assert.equal(normalizeApiServerUrl(''), null)
        assert.equal(normalizeApiServerUrl('ftp://x'), null)
        assert.equal(normalizeApiServerUrl('not-a-url'), null)
    })

    it('defaults to local mode', () => {
        assert.deepEqual(loadApiServerPreferences(), {mode: 'local', remoteUrl: ''})
        assert.equal(readUserConfiguredApiBaseUrl(), null)
    })

    it('returns remote url only when mode is remote', () => {
        saveApiServerPreferences({mode: 'remote', remoteUrl: 'https://cloud.example.com/'})
        assert.equal(readUserConfiguredApiBaseUrl(), 'https://cloud.example.com')

        saveApiServerPreferences({mode: 'local', remoteUrl: 'https://cloud.example.com'})
        assert.equal(readUserConfiguredApiBaseUrl(), null)
    })
})

describe('readApiBaseUrl', () => {
    beforeEach(() => {
        localStorage.removeItem(API_SERVER_STORAGE_KEY)
    })

    it('uses packaged backend port for file protocol default', () => {
        assert.equal(DEFAULT_DESKTOP_API_BASE, `http://127.0.0.1:${BACKEND_PACKAGED_PORT}`)
    })

    it('uses desktop default when loaded from file protocol', () => {
        const previous = globalThis.window
        ;(globalThis as typeof globalThis & {window: Window}).window = {
            location: {protocol: 'file:', origin: 'file://'},
        } as Window

        assert.equal(readApiBaseUrl(), DEFAULT_DESKTOP_API_BASE)

        globalThis.window = previous
    })

    it('uses desktop default when loaded from app protocol', () => {
        const previous = globalThis.window
        ;(globalThis as typeof globalThis & {window: Window}).window = {
            location: {protocol: 'app:', origin: 'app://local'},
        } as Window

        assert.equal(readApiBaseUrl(), DEFAULT_DESKTOP_API_BASE)

        globalThis.window = previous
    })

    it('prefers injected desktop api base url from bridge before compose', () => {
        const previous = globalThis.window
        ;(globalThis as typeof globalThis & {window: Window}).window = {
            __datawiseDesktopBridge: {platform: 'win32', apiBaseUrl: 'http://127.0.0.1:9090'},
        } as Window

        assert.equal(readApiBaseUrl(), 'http://127.0.0.1:9090')

        globalThis.window = previous
    })

    it('prefers injected desktop api base url', () => {
        const previous = globalThis.window
        ;(globalThis as typeof globalThis & {window: Window}).window = {
            location: {protocol: 'file:', origin: 'file://'},
            datawise: {platform: 'win32', apiBaseUrl: 'http://127.0.0.1:9090'},
        } as Window

        assert.equal(readApiBaseUrl(), 'http://127.0.0.1:9090')

        globalThis.window = previous
    })

    it('prefers user remote preference over desktop bridge', () => {
        saveApiServerPreferences({mode: 'remote', remoteUrl: 'https://team.example.com'})
        const previous = globalThis.window
        ;(globalThis as typeof globalThis & {window: Window}).window = {
            location: {protocol: 'file:', origin: 'file://'},
            datawise: {platform: 'win32', apiBaseUrl: 'http://127.0.0.1:9090'},
        } as Window

        assert.equal(readApiBaseUrl(), 'https://team.example.com')

        globalThis.window = previous
    })

    it('ignores web plugin stub when choosing api base', () => {
        const previous = globalThis.window
        ;(globalThis as typeof globalThis & {window: Window}).window = {
            location: {protocol: 'http:', origin: `http://localhost:${FRONTEND_DEV_PORT}`},
            datawise: {platform: 'web'},
        } as Window

        assert.equal(readApiBaseUrl(), '')

        globalThis.window = previous
    })

    it('returns empty for http dev origin without configured base', () => {
        const previous = globalThis.window
        ;(globalThis as typeof globalThis & {window: Window}).window = {
            location: {protocol: 'http:', origin: `http://localhost:${FRONTEND_DEV_PORT}`},
        } as Window

        assert.equal(readApiBaseUrl(), '')

        globalThis.window = previous
    })
})
