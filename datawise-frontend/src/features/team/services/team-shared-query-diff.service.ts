export type SqlLineDiffKind = 'equal' | 'add' | 'remove'

export interface SqlLineDiffRow {
    kind: SqlLineDiffKind
    left?: string
    right?: string
}

export interface SqlConflictPaneLine {
    lineNo: number
    text: string
    changed: boolean
}

export function buildSqlLineDiff(left: string, right: string): SqlLineDiffRow[] {
    const leftLines = splitLines(left)
    const rightLines = splitLines(right)
    const lcs = longestCommonSubsequence(leftLines, rightLines)
    const rows: SqlLineDiffRow[] = []
    let leftIndex = 0
    let rightIndex = 0
    let lcsIndex = 0

    while (leftIndex < leftLines.length || rightIndex < rightLines.length) {
        if (leftIndex >= leftLines.length) {
            rows.push({kind: 'add', right: rightLines[rightIndex]})
            rightIndex += 1
            continue
        }
        if (rightIndex >= rightLines.length) {
            rows.push({kind: 'remove', left: leftLines[leftIndex]})
            leftIndex += 1
            continue
        }
        const nextCommon = lcsIndex < lcs.length ? lcs[lcsIndex] : null
        if (nextCommon != null && leftIndex === nextCommon.left && rightIndex === nextCommon.right) {
            rows.push({kind: 'equal', left: leftLines[leftIndex], right: rightLines[rightIndex]})
            leftIndex += 1
            rightIndex += 1
            lcsIndex += 1
            continue
        }
        if (nextCommon == null || leftIndex < nextCommon.left) {
            rows.push({kind: 'remove', left: leftLines[leftIndex]})
            leftIndex += 1
            continue
        }
        rows.push({kind: 'add', right: rightLines[rightIndex]})
        rightIndex += 1
    }
    return rows
}

export function summarizeSqlLineDiff(rows: SqlLineDiffRow[]) {
    let added = 0
    let removed = 0
    for (const row of rows) {
        if (row.kind === 'add') added += 1
        if (row.kind === 'remove') removed += 1
    }
    return {added, removed}
}

export function buildSqlConflictPane(base: string, current: string): SqlConflictPaneLine[] {
    const baseLines = splitLines(base)
    const currentLines = splitLines(current)
    const maxLen = Math.max(baseLines.length, currentLines.length)
    const rows: SqlConflictPaneLine[] = []
    for (let index = 0; index < maxLen; index += 1) {
        const baseLine = baseLines[index] ?? ''
        const currentLine = currentLines[index] ?? ''
        rows.push({
            lineNo: index + 1,
            text: currentLine,
            changed: baseLine !== currentLine,
        })
    }
    return rows
}

function splitLines(value: string): string[] {
    return value.replace(/\r\n/g, '\n').split('\n')
}

interface LcsPointer {
    left: number
    right: number
}

function longestCommonSubsequence(leftLines: string[], rightLines: string[]): LcsPointer[] {
    const width = leftLines.length
    const height = rightLines.length
    const dp = Array.from({length: width + 1}, () => Array<number>(height + 1).fill(0))

    for (let left = width - 1; left >= 0; left -= 1) {
        for (let right = height - 1; right >= 0; right -= 1) {
            if (leftLines[left] === rightLines[right]) {
                dp[left]![right] = dp[left + 1]![right + 1]! + 1
            } else {
                dp[left]![right] = Math.max(dp[left + 1]![right]!, dp[left]![right + 1]!)
            }
        }
    }

    const result: LcsPointer[] = []
    let left = 0
    let right = 0
    while (left < width && right < height) {
        if (leftLines[left] === rightLines[right]) {
            result.push({left, right})
            left += 1
            right += 1
            continue
        }
        if (dp[left + 1]![right]! >= dp[left]![right + 1]!) {
            left += 1
        } else {
            right += 1
        }
    }
    return result
}
