/**
 * Attach an overlay scrollbar in place on a scroll root.
 * Implementation: `overlay-scrollbar-controller.ts`; metrics: `overlay-scrollbar-metrics.ts`.
 */
export {
  createOverlayScrollbarController,
  detachOverlayScrollbar,
  getAttachedOverlayScrollbar,
  isOverlayScrollbarAttached,
} from './overlay-scrollbar-controller'

import {createOverlayScrollbarController} from './overlay-scrollbar-controller'

/** @returns dispose; null when not attached */
export function attachOverlayScrollbar(
  viewport: HTMLElement,
  options?: {hideAfterMs?: number},
): (() => void) | null {
  const controller = createOverlayScrollbarController(viewport, options)
  return controller ? () => controller.dispose() : null
}
