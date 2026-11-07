import { afterEach, expect, it, vi } from 'vitest'
import { saveTextFile } from './desktop'

afterEach(() => {
  Reflect.deleteProperty(window, 'datawisePlugin')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('uses the DataWise native save bridge and preserves UTF-8 content', async () => {
  const saveFile = vi.fn(async () => ({ path: '/tmp/logs.txt' }))
  Object.defineProperty(window, 'datawisePlugin', {
    value: { saveFile },
    configurable: true,
  })
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const result = await saveTextFile({
    content: '日志\ntwo\n',
    suggestedName: 'pod-logs.txt',
  })
  expect(fetch).not.toHaveBeenCalled()
  expect(saveFile).toHaveBeenCalledWith(
    { fileName: 'pod-logs.txt', contentType: 'text/plain;charset=utf-8' },
    new TextEncoder().encode('日志\ntwo\n')
  )
  expect(result).toEqual({ canceled: false, path: '/tmp/logs.txt' })
})

it('handles user cancellation and reports unsupported hosts', async () => {
  Object.defineProperty(window, 'datawisePlugin', {
    value: { saveFile: async () => null },
    configurable: true,
  })
  expect(await saveTextFile({ content: 'log' })).toEqual({ canceled: true })
  Object.defineProperty(window, 'datawisePlugin', { value: {}, configurable: true })
  await expect(saveTextFile({ content: 'log' })).rejects.toThrow('update DataWise')
})
