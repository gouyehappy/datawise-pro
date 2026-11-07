/**
 * Keyboard navigation for the batch-bar target picker popover.
 */

export type BatchTargetKey =
  | { action: "ignore" }
  | { action: "move"; delta: number }
  | { action: "toggle" }
  | { action: "select-all" }
  | { action: "select-connected" }
  | { action: "close" };

/** Keys while the batch targets popover is open (focus stays on draft/input). */
export function resolveBatchTargetKey(options: {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): BatchTargetKey {
  const mod = options.ctrlKey || options.metaKey;
  if (options.altKey) return { action: "ignore" };
  if (options.key === "Escape") return { action: "close" };
  if (options.key === "ArrowDown" && !mod) return { action: "move", delta: 1 };
  if (options.key === "ArrowUp" && !mod) return { action: "move", delta: -1 };
  if ((options.key === " " || options.code === "Space") && !mod) return { action: "toggle" };
  if ((options.key === "a" || options.key === "A") && mod) return { action: "select-all" };
  if ((options.key === "c" || options.key === "C") && mod && options.shiftKey) return { action: "select-connected" };
  if (options.key === "Enter" && !mod) return { action: "close" };
  return { action: "ignore" };
}
