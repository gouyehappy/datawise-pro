export {default as DwIcon} from './DwIcon.vue'
export type {DwIconName} from './registry'
export type {DwPhIconName} from './phosphor-registry'
export type {DwIconSize, DwIconSizeToken} from './icon-sizes'
export {DW_ICON_SIZE_DEFAULT} from './icon-sizes'
export {DW_ICON_REGISTRY, resolveDwIcon, ensureDeferredDwIcons} from './registry'
export {
    settingsSectionDwIcon,
    shortcutActionDwIcon,
    shortcutRailDwIcon,
    sideRailDwIcon,
    workspaceTabDwIcon,
} from './resolvers'
