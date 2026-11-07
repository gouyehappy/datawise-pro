/** Package copy: @datawise/chrome attachOverlayScrollbar. Host file kept until cutover. */
/**
 * 原地挂载资源树同款叠加滚动条。
 * 实现见 `overlay-scrollbar-controller.ts`；度量见 `overlay-scrollbar-metrics.ts`。
 */
export {
    createOverlayScrollbarController,
    detachOverlayScrollbar,
    getAttachedOverlayScrollbar,
    isOverlayScrollbarAttached,
} from './overlay-scrollbar-controller'

import {createOverlayScrollbarController} from './overlay-scrollbar-controller'

/** @returns dispose；未挂载则 null */
export function attachOverlayScrollbar(
    viewport: HTMLElement,
    options?: {hideAfterMs?: number},
): (() => void) | null {
    const controller = createOverlayScrollbarController(viewport, options)
    return controller ? () => controller.dispose() : null
}
