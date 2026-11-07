import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {resolveLocalFileIcon} from '@/features/local-files/services/local-files-icon'

describe('local-files-icon', () => {
    it('uses open folder when expanded', () => {
        assert.deepEqual(
            resolveLocalFileIcon({name: 'src', isDirectory: true, expanded: true}),
            {icon: 'open', tone: 'folder'},
        )
        assert.deepEqual(
            resolveLocalFileIcon({name: 'src', isDirectory: true, expanded: false}),
            {icon: 'folder', tone: 'folder'},
        )
    })

    it('maps distinctive icons by extension', () => {
        assert.equal(resolveLocalFileIcon({name: 'a.SQL', isDirectory: false}).icon, 'ddl')
        assert.equal(resolveLocalFileIcon({name: 'a.sql', isDirectory: false}).tone, 'sql')
        assert.equal(resolveLocalFileIcon({name: 'readme.md', isDirectory: false}).tone, 'markdown')
        assert.equal(resolveLocalFileIcon({name: 'pkg.json', isDirectory: false}).icon, 'file-json')
        assert.equal(resolveLocalFileIcon({name: 'app.yml', isDirectory: false}).icon, 'file-braces')
        assert.equal(resolveLocalFileIcon({name: 'data.csv', isDirectory: false}).icon, 'file-sheet')
        assert.equal(resolveLocalFileIcon({name: 'run.sh', isDirectory: false}).icon, 'terminal')
        assert.equal(resolveLocalFileIcon({name: 'main.ts', isDirectory: false}).icon, 'code')
        assert.equal(resolveLocalFileIcon({name: 'notes.txt', isDirectory: false}).icon, 'editor')
        assert.equal(resolveLocalFileIcon({name: 'weird.xyz', isDirectory: false}).icon, 'file')
    })
})
