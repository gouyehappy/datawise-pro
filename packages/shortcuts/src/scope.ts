import {getShortcutDefinitions} from './definitions-registry'
import type {ShortcutActionId, ShortcutDefinition} from './types'

export function isGlobalShortcutDefinition(def: ShortcutDefinition): boolean {
  return def.scope === 'global'
}

export function isLocalShortcutDefinition(def: ShortcutDefinition): boolean {
  return def.scope === 'local'
}

/** True when the id is registered with `scope: 'local'`. */
export function isLocalShortcutId(id: ShortcutActionId): boolean {
  return getShortcutDefinitions().some((def) => def.id === id && def.scope === 'local')
}

export function getGlobalShortcutDefinitions(): ShortcutDefinition[] {
  return getShortcutDefinitions().filter(isGlobalShortcutDefinition)
}

export function getLocalShortcutDefinitions(): ShortcutDefinition[] {
  return getShortcutDefinitions().filter(isLocalShortcutDefinition)
}

export function getGlobalShortcutActionIds(): ShortcutActionId[] {
  return getGlobalShortcutDefinitions().map((def) => def.id)
}

export function getLocalShortcutActionIds(): ShortcutActionId[] {
  return getLocalShortcutDefinitions().map((def) => def.id)
}
