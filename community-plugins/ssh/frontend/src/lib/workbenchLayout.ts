export type SshWorkbenchPaneOrder = "terminal-left" | "sftp-left";

/** Motty-aligned SFTP dock width (px). */
export const SFTP_WIDTH_MIN_PX = 280;
export const SFTP_WIDTH_MAX_PX = 480;
export const SFTP_WIDTH_DEFAULT_PX = 340;

/** Below this workbench width, SFTP becomes a left overlay drawer. */
export const SFTP_DRAWER_BREAKPOINT_PX = 900;

export function getSshWorkbenchSplitLayout(order: SshWorkbenchPaneOrder) {
  const reversed = order === "sftp-left";
  return {
    rtl: reversed,
    flexDirection: reversed ? "row-reverse" : "row",
  } as const;
}

/**
 * Resolves the SFTP pane visibility for a restored workbench: the persisted
 * per-workbench flag wins; a fresh workbench falls back to the global
 * "open by default" preference.
 */
export function resolveSftpPaneOpen(state: { sftpPaneOpen?: unknown }, defaultOpen: boolean): boolean {
  return typeof state.sftpPaneOpen === "boolean" ? state.sftpPaneOpen : defaultOpen;
}

/**
 * Parses the persisted global preference. Motty-like default is open:
 * only an explicit `"false"` keeps new workbenches terminal-only.
 */
export function sanitizeSftpPaneDefaultOpen(raw: string | null): boolean {
  return raw !== "false";
}

/** Default pane order when nothing is persisted: SFTP on the left (Motty). */
export function resolvePaneOrder(raw: unknown): SshWorkbenchPaneOrder {
  return raw === "terminal-left" ? "terminal-left" : "sftp-left";
}

export function clampSftpWidthPx(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number.NaN;
  if (!Number.isFinite(n)) return SFTP_WIDTH_DEFAULT_PX;
  return Math.max(SFTP_WIDTH_MIN_PX, Math.min(SFTP_WIDTH_MAX_PX, Math.round(n)));
}

/**
 * Restores SFTP dock width. Prefers `sftpWidthPx`; migrates legacy terminal
 * `splitRatio` (%) once when a container width is known (SFTP was the remainder).
 */
export function resolveSftpWidthPx(
  state: { sftpWidthPx?: unknown; splitRatio?: unknown },
  containerWidthPx?: number,
): number {
  if (typeof state.sftpWidthPx === "number" && Number.isFinite(state.sftpWidthPx)) {
    return clampSftpWidthPx(state.sftpWidthPx);
  }
  const ratio = typeof state.splitRatio === "number" ? state.splitRatio : Number.NaN;
  if (Number.isFinite(ratio) && ratio >= 35 && ratio <= 80 && typeof containerWidthPx === "number" && containerWidthPx > 0) {
    // Legacy: terminal flexBasis = splitRatio%; SFTP took the remainder.
    const sftpPercent = 100 - ratio;
    return clampSftpWidthPx((sftpPercent / 100) * containerWidthPx);
  }
  return SFTP_WIDTH_DEFAULT_PX;
}

export function isSftpDrawerLayout(workbenchWidthPx: number): boolean {
  return Number.isFinite(workbenchWidthPx) && workbenchWidthPx > 0 && workbenchWidthPx < SFTP_DRAWER_BREAKPOINT_PX;
}
