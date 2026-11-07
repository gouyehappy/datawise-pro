import {describe, expect, it, vi, beforeEach, afterEach} from 'vitest'
import {ref, nextTick} from 'vue'
import {useEphemeralNotice} from './useEphemeralNotice'

function mockSessionStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v)
    },
    clear: () => store.clear(),
    removeItem: (k: string) => {
      store.delete(k)
    },
  })
}

describe('useEphemeralNotice', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockSessionStorage()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shows while active and auto-hides after ttl', () => {
    const active = ref(true)
    const {visible} = useEphemeralNotice(active, {ttlMs: 1000})
    expect(visible.value).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(visible.value).toBe(false)
  })

  it('re-shows when resetKey changes', async () => {
    const active = ref(true)
    const resetKey = ref(2)
    const {visible} = useEphemeralNotice(active, {ttlMs: 5000, resetKey})
    vi.advanceTimersByTime(5000)
    expect(visible.value).toBe(false)
    resetKey.value = 3
    await nextTick()
    expect(visible.value).toBe(true)
  })

  it('honors session dismiss and does not re-show', async () => {
    const active = ref(true)
    const {visible, dismiss} = useEphemeralNotice(active, {
      ttlMs: 5000,
      sessionKey: 'test-notice',
    })
    expect(visible.value).toBe(true)
    dismiss()
    expect(visible.value).toBe(false)
    active.value = false
    await nextTick()
    active.value = true
    await nextTick()
    expect(visible.value).toBe(false)
  })
})
