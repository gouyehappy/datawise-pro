/**
 * Vue Flow binds Space/Shift/… on document and calls preventDefault when matched.
 * KeepAlive pageActive alone is not enough: lineage/ER can sit beside the SQL editor
 * on the same tab. Never treat Space as pan while the user is typing.
 */

const TYPING_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '[role="textbox"]',
  '.monaco-editor',
  '.inputarea',
  '.cm-editor',
  '.cm-content',
  '.nokey',
].join(', ')

export function isEditableDomElement(el: EventTarget | null | undefined): boolean {
  if (typeof HTMLElement === 'undefined') return false
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  if (el.getAttribute('role') === 'textbox') return true
  if (
    el.classList.contains('monaco-editor')
    || el.classList.contains('inputarea')
    || el.classList.contains('cm-editor')
    || el.classList.contains('cm-content')
    || el.classList.contains('nokey')
  ) {
    return true
  }
  return Boolean(el.closest(TYPING_SELECTOR))
}

export function isTypingKeyboardEvent(event: KeyboardEvent): boolean {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  for (const node of path) {
    if (isEditableDomElement(node)) return true
  }
  if (isEditableDomElement(event.target)) return true
  if (typeof document !== 'undefined' && isEditableDomElement(document.activeElement)) {
    return true
  }
  return false
}

/** KeyFilter for Vue Flow panActivationKeyCode — Space only while over canvas & not typing. */
export function createSpacePanKeyFilter(options: {
  isPageActive: () => boolean
  isPointerOverCanvas: () => boolean
}): (event: KeyboardEvent) => boolean {
  return (event: KeyboardEvent) => {
    if (!options.isPageActive()) return false
    if (!options.isPointerOverCanvas()) return false
    if (event.code !== 'Space' && event.key !== ' ') return false
    if (isTypingKeyboardEvent(event)) return false
    return true
  }
}
