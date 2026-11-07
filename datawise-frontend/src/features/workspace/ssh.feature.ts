import {defineFeature} from '@/core/feature-contract'
import type {LazyViewLoader} from '@/core/registry/create-lazy-view'
import type {WorkspaceTabType} from '@/core/types'

const loadSshTerminal: LazyViewLoader = () => import('./components/tabs/SshTerminalTab.vue')
const loadSshScriptRecord: LazyViewLoader = () =>
    import('./components/tabs/SshScriptRecordTab.vue')

/**
 * Host SSH tabs — Feature Contract A-15 S4.
 * Coexists with community SSH plugins. KeepAlive: SshTerminalTab.
 * Open helper `openSshTerminal` remains (A-06b).
 */
export const sshFeature = defineFeature({
    id: 'workspace-ssh',
    contributes: {
        tabs: [
            {
                type: 'ssh-terminal' as const satisfies WorkspaceTabType,
                loader: loadSshTerminal,
                asyncName: 'SshTerminalTab',
            },
            {
                type: 'ssh-script-record' as const satisfies WorkspaceTabType,
                loader: loadSshScriptRecord,
            },
        ],
    },
})
