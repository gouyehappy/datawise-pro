/** Default dock width bounds — Cursor-like chat column flexibility. */
export const COPILOT_DOCK_WIDTH = {
  min: 300,
  max: 800,
  default: 420,
} as const;

export type CopilotDockWidthBounds = {
  min: number;
  max: number;
  default: number;
};

export function clampCopilotDockWidth(
  value: number,
  bounds: CopilotDockWidthBounds = COPILOT_DOCK_WIDTH,
): number {
  const fallback = Number.isFinite(bounds.default) ? bounds.default : COPILOT_DOCK_WIDTH.default;
  if (!Number.isFinite(value)) return fallback;
  const min = Number.isFinite(bounds.min) ? bounds.min : COPILOT_DOCK_WIDTH.min;
  const max = Number.isFinite(bounds.max) ? bounds.max : COPILOT_DOCK_WIDTH.max;
  return Math.max(min, Math.min(max, Math.round(value)));
}
