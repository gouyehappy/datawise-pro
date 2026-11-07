import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    allLinesAddedMarks,
    parseGitUnifiedDiffHunks,
} from '@/features/local-files/services/local-files-git-diff'

describe('local-files-git-diff', () => {
    it('parses U0 hunks into added/modified/deleted marks', () => {
        const diff = [
            'diff --git a/a.ts b/a.ts',
            '@@ -10,0 +11,2 @@',
            '+one',
            '+two',
            '@@ -20,3 +20,0 @@',
            '-a',
            '-b',
            '-c',
            '@@ -30,2 +30,2 @@',
            '-old',
            '+new',
        ].join('\n')
        const marks = parseGitUnifiedDiffHunks(diff)
        assert.deepEqual(marks, [
            {kind: 'added', startLine: 11, endLine: 12},
            {kind: 'deleted', startLine: 20, endLine: 20},
            {kind: 'modified', startLine: 30, endLine: 31},
        ])
    })

    it('marks entire untracked file as added', () => {
        assert.deepEqual(allLinesAddedMarks(3), [
            {kind: 'added', startLine: 1, endLine: 3},
        ])
        assert.deepEqual(allLinesAddedMarks(0), [])
    })
})
