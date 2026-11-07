import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    canOpenLocalFileInEditor,
    isLocalAbsolutePath,
    isLocalBinaryFileName,
    isLocalSqlFileName,
    isLocalTextFileName,
    joinLocalPath,
    localFileBaseName,
    localFileNodeId,
    normalizeLocalPathKey,
    renameSelectionRange,
} from '@/features/local-files/services/local-files-path'

describe('local-files-path', () => {
    it('detects absolute paths', () => {
        assert.equal(isLocalAbsolutePath('C:\\work\\a.sql'), true)
        assert.equal(isLocalAbsolutePath('/Users/a/b.sql'), true)
        assert.equal(isLocalAbsolutePath('\\\\server\\share\\a.sql'), true)
        assert.equal(isLocalAbsolutePath('Script-1.sql'), false)
        assert.equal(isLocalAbsolutePath(null), false)
    })

    it('classifies text, binary, and openable files', () => {
        assert.equal(isLocalSqlFileName('a.SQL'), true)
        assert.equal(isLocalSqlFileName('a.ddl'), true)
        assert.equal(isLocalTextFileName('notes.md'), true)
        assert.equal(isLocalTextFileName('bin.png'), false)
        assert.equal(isLocalBinaryFileName('bin.png'), true)
        assert.equal(canOpenLocalFileInEditor('App.java'), true)
        assert.equal(canOpenLocalFileInEditor('photo.webp'), false)
        assert.equal(canOpenLocalFileInEditor('Makefile'), true)
        assert.equal(canOpenLocalFileInEditor('.env'), true)
    })

    it('selects filename stem for rename (keeps extension)', () => {
        assert.deepEqual(renameSelectionRange('test.sql'), {start: 0, end: 4})
        assert.deepEqual(renameSelectionRange('archive.tar.gz'), {start: 0, end: 11})
        assert.deepEqual(renameSelectionRange('Makefile'), {start: 0, end: 8})
        assert.deepEqual(renameSelectionRange('.env'), {start: 0, end: 4})
        assert.deepEqual(renameSelectionRange('docs', {isDirectory: true}), {start: 0, end: 4})
        assert.deepEqual(renameSelectionRange('readme.md', {isDirectory: true}), {start: 0, end: 9})
    })

    it('builds stable node ids', () => {
        assert.equal(
            localFileNodeId('C:\\Work\\A.sql'),
            localFileNodeId('c:/work/a.sql'),
        )
        assert.equal(normalizeLocalPathKey('C:\\Work\\'), 'c:/work')
        assert.equal(localFileBaseName('C:\\Work\\a.sql'), 'a.sql')
        assert.equal(localFileBaseName('C:\\Work\\datawise-cli\\'), 'datawise-cli')
        assert.equal(joinLocalPath('C:\\Work', 'a.sql'), 'C:\\Work\\a.sql')
        assert.equal(joinLocalPath('/Users/a', 'b.md'), '/Users/a/b.md')
    })
})
