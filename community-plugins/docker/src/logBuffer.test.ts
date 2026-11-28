import { describe, expect, it } from 'vitest'
import { LogBuffer } from './logBuffer'

describe('LogBuffer', () => {
  it('keeps incomplete trailing line in carry', () => {
    const buf = new LogBuffer()
    buf.append('hello')
    expect(buf.toText()).toBe('hello')
    buf.append(' world\nnext')
    expect(buf.toText()).toBe('hello world\nnext')
    buf.append(' line\n')
    expect(buf.toText()).toBe('hello world\nnext line\n')
  })

  it('trims by max line count without rescanning joined text', () => {
    const buf = new LogBuffer({ maxLines: 3, maxChars: 1_000_000 })
    buf.append('a\nb\nc\nd\ne\n')
    expect(buf.toText()).toBe('c\nd\ne\n')
    expect(buf.lineCount).toBe(3)
  })

  it('compacts head after many trims', () => {
    const buf = new LogBuffer({ maxLines: 5, maxChars: 1_000_000 })
    for (let i = 0; i < 3000; i += 1) buf.append(`line-${i}\n`)
    expect(buf.lineCount).toBe(5)
    expect(buf.toText().split('\n').filter(Boolean)).toEqual([
      'line-2995',
      'line-2996',
      'line-2997',
      'line-2998',
      'line-2999',
    ])
  })

  it('filters lines case-insensitively', () => {
    const buf = new LogBuffer()
    buf.append('INFO boot\nERROR boom\ninfo ok\n')
    expect(buf.filter('error')).toBe('ERROR boom')
    expect(buf.filter('')).toBe('INFO boot\nERROR boom\ninfo ok\n')
  })

  it('clear resets state', () => {
    const buf = new LogBuffer()
    buf.append('a\nb\npartial')
    buf.clear()
    expect(buf.toText()).toBe('')
    expect(buf.lineCount).toBe(0)
  })

  it('serializeForAppend round-trips through append', () => {
    const src = new LogBuffer()
    src.append('a\nb\npartial')
    const dst = new LogBuffer()
    dst.append(src.serializeForAppend())
    expect(dst.toText()).toBe(src.toText())
  })
})
