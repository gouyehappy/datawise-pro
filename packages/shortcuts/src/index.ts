/**
 * @datawise/shortcuts — binding engine, scope matcher, local registry, execute pipeline.
 * Product definitions stay in the host and are registered via `registerShortcutDefinitions`.
 */

export const SHORTCUTS_PACKAGE = '@datawise/shortcuts' as const

export type {
  ShortcutActionId,
  ShortcutCategory,
  ShortcutScope,
  ShortcutDefinition,
  ShortcutPreferences,
} from './types'

export {
  registerShortcutDefinitions,
  getShortcutDefinitions,
  getShortcutDefinition,
  clearShortcutDefinitions,
} from './definitions-registry'

export {
  isGlobalShortcutDefinition,
  isLocalShortcutDefinition,
  isLocalShortcutId,
  getGlobalShortcutDefinitions,
  getLocalShortcutDefinitions,
  getGlobalShortcutActionIds,
  getLocalShortcutActionIds,
} from './scope'

export {
  setPageLocalShortcuts,
  clearPageLocalShortcuts,
  getActivePageLocalShortcutOwner,
  getPageLocalShortcutState,
  invokeLocalShortcut,
  getLocalShortcutHandlers,
  setLocalShortcutHandlers,
  clearLocalShortcutHandlers,
  type PageLocalShortcutState,
} from './local-shortcut-registry'

export {
  parseBinding,
  formatBinding,
  formatBindingParts,
  matchesBinding,
  eventToBinding,
  isEditableTarget,
  isTerminalTarget,
  stripTrailingShortcutHint,
} from './binding'

export {
  createShortcutExecutor,
  configureShortcutActions,
  executeShortcutAction,
  resetShortcutExecutor,
  type ShortcutActionHandler,
  type ShortcutExecutor,
  type ShortcutExecutorOptions,
} from './execute'

export {default as ShortcutActionIcon} from './ShortcutActionIcon.vue'
