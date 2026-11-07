import {defineFeature} from '@/core/feature-contract'

/**
 * AI workbench as Feature Contract customer (A-16 / A-15-SET).
 * Owns AI shell-slot, palette entry, settings nav items, and a settings-menu slot pilot.
 */
export const aiFeature = defineFeature({
    id: 'ai',
    contributes: {
        navModules: [{module: 'ai', kind: 'shell-slot', shell: 'ai'}],
        palette: [
            {
                id: 'module:ai',
                labelKey: 'commandPalette.modules.ai',
                groupKey: 'commandPalette.groups.navigation',
                order: 30,
                when: 'nonStandardEdition',
                action: {kind: 'setModule', module: 'ai'},
            },
        ],
        settings: [
            {
                id: 'ai',
                labelKey: 'settings.nav.aiModels',
                groupKey: 'settings.nav.groups.ai',
                order: 10,
            },
            {
                id: 'dataAgent',
                labelKey: 'settings.nav.dataAgent',
                groupKey: 'settings.nav.groups.ai',
                order: 20,
            },
        ],
        menus: [
            {
                id: 'settings:ai-models',
                slot: 'settings.nav',
                labelKey: 'settings.nav.aiModels',
                order: 30,
                when: 'nonStandardEdition',
                action: {kind: 'openSettings', section: 'ai'},
            },
        ],
    },
})
