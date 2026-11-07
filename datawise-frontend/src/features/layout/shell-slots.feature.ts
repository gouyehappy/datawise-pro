import {defineFeature} from '@/core/feature-contract'

/**
 * Shell-slot NavModules rendered by MainContent (A-10).
 * ModuleWorkbench pages stay in module-registry; these are the special shells.
 */
export const shellSlotsFeature = defineFeature({
    id: 'layout-shell-slots',
    contributes: {
        navModules: [
            {module: 'database', kind: 'shell-slot', shell: 'database'},
        ],
    },
})
