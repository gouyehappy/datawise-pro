import {readDatawiseHost} from '@/features/layout/services/desktop-bridge'
import type {LocalGitLineMark} from '@/shared/editor/git-line-marks'

export type {LocalGitLineKind, LocalGitLineMark} from '@/shared/editor/git-line-marks'

/**
 * Parse `git diff -U0` hunk headers into new-file line ranges.
 * Deleted-only hunks anchor on the surrounding new-file line.
 */
export function parseGitUnifiedDiffHunks(diff: string): LocalGitLineMark[] {
    if (!diff) return []
    const marks: LocalGitLineMark[] = []
    const re = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm
    let match: RegExpExecArray | null
    while ((match = re.exec(diff)) !== null) {
        const oldCount = match[2] === undefined ? 1 : Number(match[2])
        const newStart = Number(match[3])
        const newCount = match[4] === undefined ? 1 : Number(match[4])
        if (!Number.isFinite(newStart) || newStart < 0) continue
        if (oldCount === 0 && newCount > 0) {
            marks.push({
                kind: 'added',
                startLine: Math.max(1, newStart),
                endLine: Math.max(1, newStart + newCount - 1),
            })
            continue
        }
        if (newCount === 0 && oldCount > 0) {
            const line = Math.max(1, newStart || 1)
            marks.push({kind: 'deleted', startLine: line, endLine: line})
            continue
        }
        if (newCount > 0) {
            marks.push({
                kind: 'modified',
                startLine: Math.max(1, newStart),
                endLine: Math.max(1, newStart + newCount - 1),
            })
        }
    }
    return marks
}

export function allLinesAddedMarks(lineCount: number): LocalGitLineMark[] {
    if (!Number.isFinite(lineCount) || lineCount < 1) return []
    return [{kind: 'added', startLine: 1, endLine: Math.floor(lineCount)}]
}

export async function fetchLocalGitLineMarks(
    absolutePath: string,
    lineCount: number,
): Promise<LocalGitLineMark[]> {
    const fs = readDatawiseHost()?.fs
    if (!fs?.gitDiff) return []
    try {
        const result = await fs.gitDiff(absolutePath)
        if (!result?.ok || !result.insideRepo) return []
        if (result.untracked) return allLinesAddedMarks(lineCount)
        return parseGitUnifiedDiffHunks(result.diff ?? '')
    } catch {
        return []
    }
}
