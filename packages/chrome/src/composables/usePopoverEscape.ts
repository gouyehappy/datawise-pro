import {onUnmounted, watch, type MaybeRefOrGetter, toValue} from 'vue'

export type UsePopoverEscapeOptions = {
  /**
   * Close the overlay when pointerdown is outside these nodes.
   * Pass trigger + menu roots when the menu is Teleported.
   */
  containRefs?: MaybeRefOrGetter<Array<HTMLElement | null | undefined>>
  /** Default true; only applies when containRefs is provided. */
  closeOnOutside?: boolean
}

/** Overlay dismiss: Escape; optional outside-click when containRefs is set. */
export function usePopoverEscape(
  open: MaybeRefOrGetter<boolean>,
  onClose: () => void,
  options?: UsePopoverEscapeOptions,
) {
  const closeOnOutside = options?.closeOnOutside !== false

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !toValue(open)) return
    event.preventDefault()
    event.stopPropagation()
    onClose()
  }

  function resolveContainers(): Array<HTMLElement | null | undefined> {
    return toValue(options?.containRefs) ?? []
  }

  function isInsidePopover(target: Node): boolean {
    return resolveContainers().some((el) => el?.contains(target))
  }

  function onPointerDown(event: PointerEvent) {
    if (!closeOnOutside || !options?.containRefs || !toValue(open)) return
    if (event.button !== 0) return
    const target = event.target
    if (!(target instanceof Node)) return
    // Do not treat as outside while containers are not mounted yet
    if (!resolveContainers().some((el) => el != null)) return
    if (isInsidePopover(target)) return
    onClose()
  }

  function bind() {
    window.addEventListener('keydown', onKeydown, true)
    if (closeOnOutside && options?.containRefs) {
      window.addEventListener('pointerdown', onPointerDown, true)
    }
  }

  function unbind() {
    window.removeEventListener('keydown', onKeydown, true)
    window.removeEventListener('pointerdown', onPointerDown, true)
  }

  watch(
    () => toValue(open),
    (isOpen) => {
      if (isOpen) bind()
      else unbind()
    },
    {immediate: true},
  )

  onUnmounted(unbind)
}
