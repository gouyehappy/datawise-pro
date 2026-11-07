import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    resolveWin11FolderPalette,
    WIN11_FOLDER_BLUE,
    WIN11_FOLDER_YELLOW,
} from '@/features/explorer/constants/win11-folder-palette'

describe('win11-folder-palette', () => {
    it('uses yellow palette for normal folders', () => {
        assert.equal(resolveWin11FolderPalette(false), WIN11_FOLDER_YELLOW)
    })

    it('uses blue palette for special folders', () => {
        assert.equal(resolveWin11FolderPalette(true), WIN11_FOLDER_BLUE)
        assert.equal(resolveWin11FolderPalette(true).body[1], '#0078D4')
    })
})
