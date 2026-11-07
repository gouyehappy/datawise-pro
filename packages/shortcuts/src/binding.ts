const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

interface ParsedBinding {
  ctrl: boolean
  alt: boolean
  shift: boolean
  key: string
}

const SPECIAL_KEYS: Record<string, string> = {
  '/': '/',
  ',': ',',
  '.': '.',
  '`': '`',
  '-': '-',
  '=': '=',
  ';': ';',
  "'": "'",
  '[': '[',
  ']': ']',
  '\\': '\\',
  Space: 'Space',
  Enter: 'Enter',
  Escape: 'Escape',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
}

function normalizeKey(key: string): string {
  if (SPECIAL_KEYS[key]) return SPECIAL_KEYS[key]
  if (key.length === 1) return key.toUpperCase()
  return key
}

export function parseBinding(binding: string): ParsedBinding | null {
  const trimmed = binding.trim()
  if (!trimmed) return null

  const parts = trimmed
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
  if (!parts.length) return null

  const modifiers = parts.slice(0, -1)
  const keyPart = parts[parts.length - 1]
  const key = normalizeKey(keyPart)

  let ctrl = false
  let alt = false
  let shift = false

  for (const mod of modifiers) {
    const lower = mod.toLowerCase()
    if (
      lower === 'ctrl' ||
      lower === 'control' ||
      lower === 'cmd' ||
      lower === 'command' ||
      lower === 'meta'
    ) {
      ctrl = true
    } else if (lower === 'alt' || lower === 'option') {
      alt = true
    } else if (lower === 'shift') {
      shift = true
    } else {
      return null
    }
  }

  return {ctrl, alt, shift, key}
}

export function formatBinding(binding: string): string {
  const parts = formatBindingParts(binding)
  if (!parts.length) return binding
  return isMac ? parts.join('') : parts.join('+')
}

export function formatBindingParts(binding: string): string[] {
  const parsed = parseBinding(binding)
  if (!parsed) return binding.trim() ? [binding] : []

  const parts: string[] = []
  if (parsed.ctrl) parts.push(isMac ? '⌘' : 'Ctrl')
  if (parsed.alt) parts.push(isMac ? '⌥' : 'Alt')
  if (parsed.shift) parts.push(isMac ? '⇧' : 'Shift')

  const keyLabel =
    parsed.key === 'Space' ? 'Space' : parsed.key.length === 1 ? parsed.key : parsed.key

  parts.push(keyLabel)
  return parts
}

export function matchesBinding(event: KeyboardEvent, binding: string): boolean {
  const parsed = parseBinding(binding)
  if (!parsed) return false

  const modKey = isMac ? event.metaKey : event.ctrlKey
  if (parsed.ctrl !== modKey) return false
  if (parsed.alt !== event.altKey) return false
  if (parsed.shift !== event.shiftKey) return false

  const eventKey = normalizeKey(event.key)
  if (eventKey === parsed.key) return true
  // US layout: Shift+/ emits key "?" while binding is written as Shift+/
  if (parsed.shift && parsed.key === '/' && (event.key === '?' || event.code === 'Slash')) {
    return true
  }
  return false
}

export function eventToBinding(event: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return null

  const parts: string[] = []
  const modKey = isMac ? event.metaKey : event.ctrlKey
  if (modKey) parts.push(isMac ? 'Cmd' : 'Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')

  const key = normalizeKey(event.key)
  parts.push(key)
  return parts.join('+')
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  if (target.closest('.monaco-editor')) return true
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

/** xterm / SSH / local terminal — bare keys like `/` must reach the PTY. */
export function isTerminalTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as {closest?: unknown}).closest !== 'function') return false
  try {
    return Boolean((target as HTMLElement).closest('.xterm'))
  } catch {
    return false
  }
}

/** Strip legacy i18n shortcut suffix like " (Ctrl+S)" before appending dynamic hints. */
export function stripTrailingShortcutHint(label: string): string {
  return label
    .replace(/\s*\(([^()]*)\)\s*$/, (full, inner: string) => {
      const hint = inner.trim()
      if (
        hint === '/' ||
        /^(?:Ctrl|Alt|Shift|Meta|Cmd|Mod|Control|Command)\+/i.test(hint) ||
        /^F\d+(?:\+|$)/i.test(hint)
      ) {
        return ''
      }
      return full
    })
    .trimEnd()
}
