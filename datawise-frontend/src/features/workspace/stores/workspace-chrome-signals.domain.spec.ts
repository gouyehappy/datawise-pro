import {describe, expect, it} from 'vitest'
import {ref} from 'vue'
import type {StatusSnapshot, WorkspaceTab} from '@/core/types'
import {createWorkspaceChromeSignalsDomain} from '@/features/workspace/stores/workspace-chrome-signals.domain'

describe('createWorkspaceChromeSignalsDomain', () => {
    it('tracks status, dirty, and refresh/auto-run signals', () => {
        const tabs = ref<WorkspaceTab[]>([
            {
                id: 't1',
                title: 'T',
                type: 'ssh-script-record',
                closable: true,
                sshScriptRecordHtml: '<p>a</p>',
                sshScriptRecordSavedHtml: '<p>b</p>',
            },
        ])
        const status = ref<StatusSnapshot>({message: 'ready', duration: '-', rowCount: '-'})
        const sshScriptDirtyByTabId = ref<Record<string, boolean>>({})
        const tableDataRefreshSeq = ref<Record<string, number>>({})
        const tabActivateRefreshSeq = ref<Record<string, number>>({})
        const fakeDataDialogRequest = ref<{tabId: string; nonce: number} | null>(null)
        const contentDirtyByTabId = ref<Record<string, boolean>>({})
        const consoleAutoRunRequest = ref<{tabId: string; nonce: number} | null>(null)
        const consoleAiPromptRequest = ref<{tabId: string; nonce: number} | null>(null)

        const signals = createWorkspaceChromeSignalsDomain({
            tabs,
            status,
            sshScriptDirtyByTabId,
            contentDirtyByTabId,
            tableDataRefreshSeq,
            tabActivateRefreshSeq,
            fakeDataDialogRequest,
            consoleAutoRunRequest,
            consoleAiPromptRequest,
        })

        signals.setStatus('ok')
        expect(status.value.message).toBe('ok')

        signals.setSshScriptDirty('t1', true)
        expect(signals.isTabDirty('t1')).toBe(true)
        signals.setSshScriptDirty('t1', false)
        expect(sshScriptDirtyByTabId.value['t1']).toBeUndefined()

        signals.bumpTableDataRefresh('t1')
        expect(tableDataRefreshSeq.value.t1).toBe(1)

        signals.requestFakeDataDialog('t1')
        expect(fakeDataDialogRequest.value?.tabId).toBe('t1')

        signals.requestConsoleAutoRun('t1')
        expect(consoleAutoRunRequest.value?.tabId).toBe('t1')
        signals.clearConsoleAutoRun()
        expect(consoleAutoRunRequest.value).toBeNull()

        signals.requestConsoleAiPrompt('t1')
        expect(consoleAiPromptRequest.value?.tabId).toBe('t1')
        signals.clearConsoleAiPrompt()
        expect(consoleAiPromptRequest.value).toBeNull()
    })
})
