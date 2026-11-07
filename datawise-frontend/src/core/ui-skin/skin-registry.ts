import type {UiSkin, UiSkinCapabilities} from './types'

export type {UiSkin, UiSkinCapabilities}

export interface UiSkinDefinition {
    id: UiSkin
    /** i18n：settings.basic.uiSkins.* */
    labelKey: string
    /** i18n：settings.basic.uiSkinHints.* */
    hintKey: string
    capabilities: UiSkinCapabilities
}

/** UI 壳层插件注册表 — 新增款式只需加一条 + styles/skins/<id>.css */
export const UI_SKIN_DEFINITIONS: readonly UiSkinDefinition[] = [
    {
        id: 'classic',
        labelKey: 'settings.basic.uiSkins.classic',
        hintKey: 'settings.basic.uiSkinHints.classic',
        capabilities: {
            panelShadow: 'inherit',
            shellFlush: false,
            activityBarLabels: true,
            tabStyle: 'pill',
        },
    },
    {
        id: 'ide',
        labelKey: 'settings.basic.uiSkins.ide',
        hintKey: 'settings.basic.uiSkinHints.ide',
        capabilities: {
            panelShadow: 'none',
            shellFlush: true,
            activityBarLabels: true,
            tabStyle: 'strip',
        },
    },
    {
        id: 'atelier',
        labelKey: 'settings.basic.uiSkins.atelier',
        hintKey: 'settings.basic.uiSkinHints.atelier',
        capabilities: {
            panelShadow: 'inherit',
            shellFlush: false,
            activityBarLabels: true,
            tabStyle: 'pill',
        },
    },
    {
        id: 'ledger',
        labelKey: 'settings.basic.uiSkins.ledger',
        hintKey: 'settings.basic.uiSkinHints.ledger',
        capabilities: {
            panelShadow: 'none',
            shellFlush: true,
            activityBarLabels: true,
            tabStyle: 'strip',
        },
    },
] as const

export const UI_SKIN_IDS: UiSkin[] = UI_SKIN_DEFINITIONS.map((item) => item.id)

export function resolveUiSkinDefinition(id: UiSkin | string | undefined): UiSkinDefinition {
    return UI_SKIN_DEFINITIONS.find((item) => item.id === id) ?? UI_SKIN_DEFINITIONS[0]
}

export function resolveUiSkinCapabilities(id: UiSkin | string | undefined): UiSkinCapabilities {
    return resolveUiSkinDefinition(id).capabilities
}

export function isRegisteredUiSkin(value: unknown): value is UiSkin {
    return typeof value === 'string' && UI_SKIN_IDS.includes(value as UiSkin)
}
