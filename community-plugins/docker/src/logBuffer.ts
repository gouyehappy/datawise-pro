/** Ring buffer for container logs — append by line without re-splitting the whole text. */

export interface LogBufferOptions {
  maxLines?: number
  maxChars?: number
}

export class LogBuffer {
  private lines: string[] = []
  /** Logical start index into `lines` (avoid O(n) Array.shift on trim). */
  private head = 0
  private carry = ''
  private charCount = 0
  private readonly maxLines: number
  private readonly maxChars: number

  constructor(options: LogBufferOptions = {}) {
    this.maxLines = options.maxLines ?? 10_000
    this.maxChars = options.maxChars ?? 5 * 1024 * 1024
  }

  get lineCount(): number {
    return this.lines.length - this.head + (this.carry ? 1 : 0)
  }

  get size(): number {
    return this.charCount + this.carry.length
  }

  clear(): void {
    this.lines = []
    this.head = 0
    this.carry = ''
    this.charCount = 0
  }

  append(chunk: string): void {
    if (!chunk) return
    const combined = this.carry + chunk
    const parts = combined.split('\n')
    this.carry = parts.pop() ?? ''
    if (!parts.length) return

    for (const line of parts) {
      this.lines.push(line)
      this.charCount += line.length + 1
    }
    this.trim()
  }

  /** Snapshot as display text (includes incomplete trailing line). */
  toText(): string {
    const active = this.activeLines()
    if (!active.length) return this.carry
    const body = active.join('\n')
    // Completed lines keep a trailing newline so log dumps match stream fidelity.
    return this.carry ? `${body}\n${this.carry}` : `${body}\n`
  }

  /**
   * Serialize so another LogBuffer.append() keeps the same line boundaries
   * (complete lines always end with \\n).
   */
  serializeForAppend(): string {
    const active = this.activeLines()
    if (!active.length) return this.carry
    return `${active.join('\n')}\n${this.carry}`
  }

  /** Case-insensitive line filter; empty needle returns full text. */
  filter(needle: string): string {
    const q = needle.trim().toLowerCase()
    if (!q) return this.toText()
    const matched = this.activeLines().filter((line) => line.toLowerCase().includes(q))
    if (this.carry && this.carry.toLowerCase().includes(q)) matched.push(this.carry)
    return matched.join('\n')
  }

  private activeLines(): string[] {
    return this.head === 0 ? this.lines : this.lines.slice(this.head)
  }

  private trim(): void {
    while (this.lineCountComplete() > this.maxLines || this.charCount > this.maxChars) {
      if (this.head >= this.lines.length) break
      const removed = this.lines[this.head]
      this.head += 1
      this.charCount -= removed.length + 1
    }
    if (this.charCount < 0) this.charCount = 0
    // Compact occasionally so the backing array does not grow without bound.
    if (this.head > 1024 && this.head * 2 > this.lines.length) {
      this.lines = this.lines.slice(this.head)
      this.head = 0
    }
  }

  private lineCountComplete(): number {
    return this.lines.length - this.head
  }
}
