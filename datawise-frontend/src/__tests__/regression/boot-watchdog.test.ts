import {describe, it, beforeEach, afterEach} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import vm from 'node:vm'

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const watchdogSource = readFileSync(join(frontendRoot, 'public/boot-watchdog.js'), 'utf8')

function installWatchdog(options?: {timeoutMs?: number}) {
    const timeouts: Array<{id: number; fn: () => void; ms: number}> = []
    let nextId = 1
    const session = new Map<string, string>()
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
    let reloadCount = 0
    let failHidden = true
    let failDetail = ''

    const failEl = {
        get hidden() {
            return failHidden
        },
        set hidden(v: boolean) {
            failHidden = v
        },
    }
    const detailEl = {
        textContent: '',
        set textContent(v: string) {
            failDetail = v
            this._text = v
        },
        get textContent() {
            return failDetail
        },
        _text: '',
    }
    const retryEl = {
        listeners: [] as Array<() => void>,
        addEventListener(_type: string, fn: () => void) {
            this.listeners.push(fn)
        },
    }
    const bootEl = {
        attrs: {} as Record<string, string>,
        setAttribute(name: string, value: string) {
            this.attrs[name] = value
        },
    }

    const documentFake = {
        getElementById(id: string) {
            if (id === 'dw-boot-fail') return failEl
            if (id === 'dw-boot-fail-detail') return detailEl
            if (id === 'dw-boot-retry') return retryEl
            return null
        },
        querySelector(sel: string) {
            return sel === '.dw-boot' ? bootEl : null
        },
        addEventListener(type: string, fn: (...args: unknown[]) => void) {
            const list = listeners.get(type) ?? []
            list.push(fn)
            listeners.set(type, list)
        },
        visibilityState: 'visible' as string,
    }

    const windowFake: Record<string, unknown> = {
        __DW_APP_MOUNTED__: false,
        __DW_BOOT_MOUNT_TIMEOUT_MS__: options?.timeoutMs,
        sessionStorage: {
            getItem(key: string) {
                return session.has(key) ? session.get(key)! : null
            },
            setItem(key: string, value: string) {
                session.set(key, value)
            },
            removeItem(key: string) {
                session.delete(key)
            },
        },
        addEventListener(type: string, fn: (...args: unknown[]) => void) {
            const list = listeners.get(type) ?? []
            list.push(fn)
            listeners.set(type, list)
        },
        setTimeout(fn: () => void, ms: number) {
            const id = nextId++
            timeouts.push({id, fn, ms})
            return id
        },
        clearTimeout(id: number) {
            const idx = timeouts.findIndex((t) => t.id === id)
            if (idx >= 0) timeouts.splice(idx, 1)
        },
        location: {
            reload() {
                reloadCount += 1
            },
            href: 'http://127.0.0.1/',
        },
        document: documentFake,
    }

    const context = vm.createContext({
        window: windowFake,
        document: documentFake,
        sessionStorage: windowFake.sessionStorage,
        location: windowFake.location,
        setTimeout: windowFake.setTimeout,
        clearTimeout: windowFake.clearTimeout,
        Number,
        Date,
        String,
    })

    // Allow watchdog to assign globals on window
    vm.runInContext('var window = this.window; var document = this.document;', context)
    vm.runInContext(watchdogSource, context)

    // Fire DOMContentLoaded handlers
    for (const fn of listeners.get('DOMContentLoaded') ?? []) fn()

    return {
        window: windowFake,
        document: documentFake,
        timeouts,
        flushTimeouts() {
            const pending = [...timeouts]
            timeouts.length = 0
            for (const t of pending) t.fn()
        },
        reloadCount: () => reloadCount,
        failHidden: () => failHidden,
        failDetail: () => failDetail,
        session,
        emit(type: string, event?: unknown) {
            for (const fn of listeners.get(type) ?? []) fn(event)
        },
        clickRetry() {
            for (const fn of retryEl.listeners) fn()
        },
    }
}

describe('boot-watchdog', () => {
    beforeEach(() => {
        // no-op: each install creates fresh sandbox
    })

    afterEach(() => {
        // no-op
    })

    it('marks mounted and clears auto-reload counter', () => {
        const env = installWatchdog({timeoutMs: 50})
        env.session.set('dw-boot-auto-reload', '1')
        const mark = env.window.__DW_MARK_MOUNTED__ as () => void
        mark()
        assert.equal(env.window.__DW_APP_MOUNTED__, true)
        assert.equal(env.session.has('dw-boot-auto-reload'), false)
        env.flushTimeouts()
        assert.equal(env.reloadCount(), 0)
        assert.equal(env.failHidden(), true)
    })

    it('auto-reloads once when mount times out', () => {
        const env = installWatchdog({timeoutMs: 50})
        env.flushTimeouts()
        assert.equal(env.reloadCount(), 1)
        assert.equal(env.session.get('dw-boot-auto-reload'), '1')
        assert.equal(env.failHidden(), true)
    })

    it('shows fail UI after auto-reload budget is exhausted', () => {
        const env = installWatchdog({timeoutMs: 50})
        env.session.set('dw-boot-auto-reload', '1')
        env.flushTimeouts()
        assert.equal(env.reloadCount(), 0)
        assert.equal(env.failHidden(), false)
        assert.match(env.failDetail(), /启动超时|未能完成加载|休眠/)
    })
})
