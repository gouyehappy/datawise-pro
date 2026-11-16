/**
 * Delay Info panel sync after select.
 * Double-click / Enter that actually activates cancels this timer so Info does not
 * race ensureChildrenLoaded; no-op open (leaf meta) leaves the timer running.
 */
export const EXPLORER_INFO_SYNC_DELAY_MS = 280
