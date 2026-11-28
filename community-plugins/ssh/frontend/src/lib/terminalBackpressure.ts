/**
 * Large-output backpressure gate.
 *
 * When the terminal renderer falls behind the PTY (`tail -f`, build logs),
 * secondary per-row work (gutter / highlight / autofill) amplifies jank.
 * This helper owns the mode machine:
 *
 * - `feed(backlogBytes)` flips `normal` ↔ `strained` with hysteresis
 *   (engage ≥128KiB, release <64KiB).
 * - Byte slicing for xterm lives in `terminalWriteThrottle` (Motty pumpSlice);
 *   this gate only decides when to pause secondary work and tell the sidecar
 *   to stop draining the SSH channel.
 */

export type OutputGateMode = "normal" | "strained";

export interface OutputGateThresholds {
  /** Pending bytes at or above this engage strained (default 128 KiB). */
  strainedBytes: number;
  /** Pending bytes below this release strained (default 64 KiB). */
  resumeBytes: number;
}

export interface OutputGateOptions {
  strainedBytes?: number;
  resumeBytes?: number;
}

export interface OutputGate {
  readonly mode: OutputGateMode;
  /**
   * Re-evaluate mode against backlog (in-flight + throttle queue).
   * Returns true when the mode flipped.
   */
  feed(backlogBytes: number): boolean;
  /** Back to normal (terminal recreate / session end). */
  reset(): void;
}

export const DEFAULT_STRAINED_BYTES = 128 * 1024;
export const DEFAULT_RESUME_BYTES = 64 * 1024;
/**
 * Secondary work pauses sooner than strained. Steady `tail -f` often stays
 * under 128KiB backlog but still thrashes onRender — 8KiB catches that
 * without tripping on a single keystroke echo.
 */
export const DEFAULT_SECONDARY_BUSY_BYTES = 8 * 1024;

/** True when Motty-style secondary scans should yield to the renderer. */
export function isTerminalSecondaryBusy(input: {
  gateMode: OutputGateMode;
  backlogBytes: number;
  busyBytes?: number;
}): boolean {
  if (input.gateMode === "strained") return true;
  const busyBytes =
    typeof input.busyBytes === "number" && Number.isFinite(input.busyBytes) && input.busyBytes > 0
      ? input.busyBytes
      : DEFAULT_SECONDARY_BUSY_BYTES;
  const backlog = Number.isFinite(input.backlogBytes) && input.backlogBytes > 0 ? input.backlogBytes : 0;
  return backlog >= busyBytes;
}

/** Coerce thresholds; invalid values fall back to defaults. */
export function resolveOutputGateThresholds(options: OutputGateOptions = {}): OutputGateThresholds {
  const positive = (value: number | undefined, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
  const strainedBytes = positive(options.strainedBytes, DEFAULT_STRAINED_BYTES);
  const resumeBytes = Math.min(positive(options.resumeBytes, DEFAULT_RESUME_BYTES), strainedBytes);
  return { strainedBytes, resumeBytes };
}

/**
 * Hysteresis: engage at `backlog >= strainedBytes`, release only once below
 * `resumeBytes`.
 */
export function resolveOutputMode(
  current: OutputGateMode,
  backlogBytes: number,
  thresholds: Pick<OutputGateThresholds, "strainedBytes" | "resumeBytes">,
): OutputGateMode {
  const pending = Number.isFinite(backlogBytes) && backlogBytes > 0 ? backlogBytes : 0;
  if (current === "normal") return pending >= thresholds.strainedBytes ? "strained" : "normal";
  return pending < thresholds.resumeBytes ? "normal" : "strained";
}

export function createOutputGate(options: OutputGateOptions = {}): OutputGate {
  const thresholds = resolveOutputGateThresholds(options);
  let mode: OutputGateMode = "normal";
  return {
    get mode() {
      return mode;
    },
    feed(backlogBytes: number): boolean {
      const next = resolveOutputMode(mode, backlogBytes, thresholds);
      if (next === mode) return false;
      mode = next;
      return true;
    },
    reset() {
      mode = "normal";
    },
  };
}
