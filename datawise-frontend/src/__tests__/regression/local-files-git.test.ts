import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildLocalGitStatusMap,
    lookupLocalGitStatus,
    mergeLocalGitStatus,
    resolveLocalGitStatus,
} from '@/features/local-files/services/local-files-git'

describe('local-files-git', () => {
    it('maps porcelain XY codes', () => {
        assert.equal(resolveLocalGitStatus(' M'), 'modified')
        assert.equal(resolveLocalGitStatus('M '), 'modified')
        assert.equal(resolveLocalGitStatus('A '), 'added')
        assert.equal(resolveLocalGitStatus('??'), 'untracked')
        assert.equal(resolveLocalGitStatus('D '), 'deleted')
        assert.equal(resolveLocalGitStatus('R '), 'renamed')
        assert.equal(resolveLocalGitStatus('UU'), 'conflict')
        assert.equal(resolveLocalGitStatus('!!'), null)
    })

    it('builds absolute path map and aggregates directories', () => {
        const map = buildLocalGitStatusMap('C:/ws', [
            {path: 'src/a.ts', xy: ' M'},
            {path: 'src/b.ts', xy: '??'},
        ])
        assert.equal(lookupLocalGitStatus(map, 'C:/ws/src/a.ts', false), 'modified')
        assert.equal(lookupLocalGitStatus(map, 'C:/ws/src', true), 'modified')
        assert.equal(mergeLocalGitStatus('untracked', 'modified'), 'modified')
    })

    it('joins porcelain paths from repo root when workspace is a subfolder', () => {
        const map = buildLocalGitStatusMap('C:/repo', [
            {path: 'frontend/a.ts', xy: ' M'},
            {path: 'backend/b.java', xy: '??'},
        ])
        assert.equal(lookupLocalGitStatus(map, 'C:/repo/frontend/a.ts', false), 'modified')
        assert.equal(lookupLocalGitStatus(map, 'C:/repo/frontend', true), 'modified')
        assert.equal(lookupLocalGitStatus(map, 'C:/repo/backend/b.java', false), 'untracked')
    })
})
