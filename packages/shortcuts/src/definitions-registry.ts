import type {ShortcutDefinition} from './types'

let registered: readonly ShortcutDefinition[] = []

/**
 * Host registers product shortcut definitions once at boot.
 * Engine never ships product action tables.
 */
export function registerShortcutDefinitions(defs: readonly ShortcutDefinition[]): void {
  registered = Object.freeze([...defs])
}

export function getShortcutDefinitions(): readonly ShortcutDefinition[] {
  return registered
}

export function getShortcutDefinition(
  id: string,
): ShortcutDefinition | undefined {
  return registered.find((def) => def.id === id)
}

/** Test / hot-reload helper — clears the registry. */
export function clearShortcutDefinitions(): void {
  registered = []
}
