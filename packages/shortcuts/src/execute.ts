import {invokeLocalShortcut} from './local-shortcut-registry'
import {isLocalShortcutId} from './scope'
import type {ShortcutActionId} from './types'

export type ShortcutActionHandler = () => boolean

export interface ShortcutExecutorOptions {
  canExecute?: (actionId: ShortcutActionId) => boolean
  handlers?: Partial<Record<ShortcutActionId, ShortcutActionHandler>>
  /** Override local-id detection (default: registered defs with scope local). */
  isLocal?: (actionId: ShortcutActionId) => boolean
  /** Override local invoke (default: page local-shortcut registry). */
  invokeLocal?: (actionId: ShortcutActionId) => boolean
}

export interface ShortcutExecutor {
  execute(actionId: ShortcutActionId): boolean
  update(partial: Partial<ShortcutExecutorOptions>): void
}

/**
 * Create an isolated execute pipeline. Host wires product handlers here.
 */
export function createShortcutExecutor(
  options: ShortcutExecutorOptions = {},
): ShortcutExecutor {
  let config: ShortcutExecutorOptions = {...options}

  return {
    update(partial) {
      config = {...config, ...partial}
    },
    execute(actionId) {
      if (config.canExecute && !config.canExecute(actionId)) return false

      const isLocal = config.isLocal ?? isLocalShortcutId
      if (isLocal(actionId)) {
        const invoke = config.invokeLocal ?? invokeLocalShortcut
        return invoke(actionId)
      }

      const handler = config.handlers?.[actionId]
      if (!handler) return false
      return handler()
    },
  }
}

/** Default singleton used by hosts that boot once via configureShortcutActions. */
let defaultExecutor: ShortcutExecutor | null = null

/** Features / host registers handlers once at app boot. */
export function configureShortcutActions(options: ShortcutExecutorOptions): void {
  if (!defaultExecutor) {
    defaultExecutor = createShortcutExecutor(options)
    return
  }
  defaultExecutor.update(options)
}

export function executeShortcutAction(actionId: ShortcutActionId): boolean {
  return defaultExecutor?.execute(actionId) ?? false
}

/** Test helper — drop the default executor. */
export function resetShortcutExecutor(): void {
  defaultExecutor = null
}
