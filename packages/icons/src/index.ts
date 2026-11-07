export {default as DwIcon} from './DwIcon.vue'
export {default as DwPhIcon} from './DwPhIcon.vue'
export type {DwPhWeight} from './DwPhIcon.vue'

export {
  DW_ICON_SIZE_DEFAULT,
  type DwIconSize,
  type DwIconSizeToken,
  isDwIconSizeToken,
} from './icon-sizes'

export {
  DW_ICON_REGISTRY_CORE,
  type DwIconName,
  registerDwIcons,
  resolveDwIcon,
  isDwIconName,
} from './registry-core'

export {
  DW_PH_ICON_REGISTRY,
  type DwPhIconName,
  resolveDwPhIcon,
  isDwPhIconName,
} from './phosphor-registry'
