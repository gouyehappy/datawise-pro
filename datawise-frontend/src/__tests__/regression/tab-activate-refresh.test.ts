import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {ref} from 'vue'
import type {StatusSnapshot, WorkspaceTab} from '@/core/types'
import {createWorkspaceChromeSignalsDomain} from '@/features/workspace/stores/workspace-chrome-signals.domain'
import {tabNeedsDiskContentHydration} from '@/features/workspace/utils/workspace-session'

describe('tab activate refresh', () => {
    it('bumps per-tab activate refresh sequence for sticky hosts', () => {
        const tabs = ref<WorkspaceTab[]>([])
        const status = ref<StatusSnapshot>({message: '', duration: '-', rowCount: '-'})
        const sshScriptDirtyByTabId = ref<Record<string, boolean>>({})
        const tableDataRefreshSeq = ref<Record<string, number>>({})
        const tabActivateRefreshSeq = ref<Record<string, number>>({})
        const fakeDataDialogRequest = ref<{tabId: string; nonce: number} | null>(null)
        const consoleAutoRunRequest = ref<{tabId: string; nonce: number} | null>(null)

        const signals = createWorkspaceChromeSignalsDomain({
            tabs,
            status,
            sshScriptDirtyByTabId,
            tableDataRefreshSeq,
            tabActivateRefreshSeq,
            fakeDataDialogRequest,
            consoleAutoRunRequest,
        })

        signals.bumpTabActivateRefresh('doc-1')
        signals.bumpTabActivateRefresh('doc-1')
        signals.bumpTabActivateRefresh('ssh-1')
        assert.equal(tabActivateRefreshSeq.value['doc-1'], 2)
        assert.equal(tabActivateRefreshSeq.value['ssh-1'], 1)
    })

    it('treats missing saved* as unload so empty project docs can re-fetch', () => {
        assert.equal(
            tabNeedsDiskContentHydration({
                type: 'local-text',
                localFilePath: 'dw-project://p/docs/x.md',
                sql: '',
            }),
            true,
        )
    })
})
