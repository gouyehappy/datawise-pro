export type DiffStats = {
  changes: number
  added: number
  removed: number
}

export type DiffLineKind = 'added' | 'removed' | 'changed'

export type DiffLineMark = {
  /** 1-based line number */
  lineNumber: number
  kind: DiffLineKind
}

export type LineDiffResult = {
  stats: DiffStats
  /** Marks for the left/original editor (current). */
  originalMarks: DiffLineMark[]
  /** Marks for the right/modified editor (history). */
  modifiedMarks: DiffLineMark[]
  /** 1-based line numbers (prefer modified side) for next/prev navigation. */
  hunkStarts: number[]
}

type Op = { type: 'eq' | 'del' | 'ins'; ai: number; bi: number }

/** Normalize newlines then split into lines. */
export function splitLines(text: string): string[] {
  return String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}

/** Content equality after newline normalization (CRLF vs LF). */
export function contentsEqual(a: string, b: string): boolean {
  return splitLines(a).join('\n') === splitLines(b).join('\n')
}

function alignHuge(a: string[], b: string[]): Op[] {
  const n = a.length
  const m = b.length
  let prefix = 0
  while (prefix < n && prefix < m && a[prefix] === b[prefix]) prefix++
  let suffix = 0
  while (
    suffix < n - prefix &&
    suffix < m - prefix &&
    a[n - 1 - suffix] === b[m - 1 - suffix]
  ) {
    suffix++
  }
  const ops: Op[] = []
  for (let i = 0; i < prefix; i++) ops.push({ type: 'eq', ai: i, bi: i })
  for (let i = prefix; i < n - suffix; i++) ops.push({ type: 'del', ai: i, bi: -1 })
  for (let j = prefix; j < m - suffix; j++) ops.push({ type: 'ins', ai: -1, bi: j })
  for (let k = 0; k < suffix; k++) {
    ops.push({ type: 'eq', ai: n - suffix + k, bi: m - suffix + k })
  }
  return ops
}

function alignOps(a: string[], b: string[]): Op[] {
  const n = a.length
  const m = b.length
  if (n === 0 && m === 0) return []
  if (n * m > 1_500_000) return alignHuge(a, b)

  const cols = m + 1
  const dp = new Int32Array((n + 1) * cols)
  for (let i = 1; i <= n; i++) {
    const ai = a[i - 1]
    const base = i * cols
    const prevBase = (i - 1) * cols
    for (let j = 1; j <= m; j++) {
      if (ai === b[j - 1]) dp[base + j] = dp[prevBase + j - 1] + 1
      else {
        const up = dp[prevBase + j]
        const left = dp[base + j - 1]
        dp[base + j] = up >= left ? up : left
      }
    }
  }

  const opsRev: Op[] = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    if (
      i > 0 &&
      j > 0 &&
      a[i - 1] === b[j - 1] &&
      dp[i * cols + j] === dp[(i - 1) * cols + j - 1] + 1
    ) {
      opsRev.push({ type: 'eq', ai: i - 1, bi: j - 1 })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i * cols + j - 1] >= dp[(i - 1) * cols + j])) {
      opsRev.push({ type: 'ins', ai: -1, bi: j - 1 })
      j--
    } else {
      opsRev.push({ type: 'del', ai: i - 1, bi: -1 })
      i--
    }
  }
  opsRev.reverse()
  return opsRev
}

/**
 * Full line diff: stats, gutter marks, and hunk anchors.
 * Left/original = current; right/modified = history.
 */
export function computeLineDiff(original: string, modified: string): LineDiffResult {
  if (original === modified) {
    return {
      stats: { changes: 0, added: 0, removed: 0 },
      originalMarks: [],
      modifiedMarks: [],
      hunkStarts: [],
    }
  }
  const a = splitLines(original)
  const b = splitLines(modified)
  const ops = alignOps(a, b)

  const originalMarks: DiffLineMark[] = []
  const modifiedMarks: DiffLineMark[] = []
  const hunkStarts: number[] = []

  let added = 0
  let removed = 0
  let hunks = 0
  let pendingDel: number[] = []
  let pendingIns: number[] = []

  const flushHunk = () => {
    if (pendingDel.length === 0 && pendingIns.length === 0) return
    hunks++
    const startLine =
      pendingIns.length > 0
        ? pendingIns[0]! + 1
        : pendingDel.length > 0
          ? pendingDel[0]! + 1
          : 1
    hunkStarts.push(startLine)

    const pair = Math.min(pendingDel.length, pendingIns.length)
    for (let k = 0; k < pair; k++) {
      originalMarks.push({ lineNumber: pendingDel[k]! + 1, kind: 'changed' })
      modifiedMarks.push({ lineNumber: pendingIns[k]! + 1, kind: 'changed' })
    }
    for (let k = pair; k < pendingDel.length; k++) {
      originalMarks.push({ lineNumber: pendingDel[k]! + 1, kind: 'removed' })
    }
    for (let k = pair; k < pendingIns.length; k++) {
      modifiedMarks.push({ lineNumber: pendingIns[k]! + 1, kind: 'added' })
    }
    removed += pendingDel.length
    added += pendingIns.length
    pendingDel = []
    pendingIns = []
  }

  for (const op of ops) {
    if (op.type === 'eq') {
      flushHunk()
      continue
    }
    if (op.type === 'del') pendingDel.push(op.ai)
    else pendingIns.push(op.bi)
  }
  flushHunk()

  return {
    stats: {
      changes: Math.max(hunks, added > 0 || removed > 0 ? 1 : 0),
      added,
      removed,
    },
    originalMarks,
    modifiedMarks,
    hunkStarts,
  }
}

export function computeLineDiffStats(original: string, modified: string): DiffStats {
  return computeLineDiff(original, modified).stats
}

/** First 1-based line where original and modified diverge (for scrolling). */
export function firstDiffLine(original: string, modified: string): number {
  const diff = computeLineDiff(original, modified)
  if (diff.hunkStarts.length > 0) return diff.hunkStarts[0]!
  return 1
}
