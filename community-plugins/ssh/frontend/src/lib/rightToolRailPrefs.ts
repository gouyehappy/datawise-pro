/**
 * X-TOOLBAR: Motty-lite right tool rail — show/hide + order (no drag chrome).
 * Persisted via uiStorage; rail open/closed stays on the existing RIGHT_RAIL_KEY.
 */

import { uiStorage } from "./uiStorage";

export type RightRailItemId =
  | "monitor"
  | "copilot"
  | "forwards"
  | "assets"
  | "docker"
  | "history"
  | "otp"
  | "command"
  | "batch"
  | "record"
  | "recordings";

/** Default Motty-ish groups (separators render between non-empty groups). */
export const RIGHT_RAIL_GROUPS: readonly (readonly RightRailItemId[])[] = [
  ["monitor", "copilot"],
  ["forwards", "assets", "docker", "history", "otp"],
  ["command", "batch", "record", "recordings"],
] as const;

export const RIGHT_RAIL_DEFAULT_ORDER: readonly RightRailItemId[] = RIGHT_RAIL_GROUPS.flat();

export type RightToolRailPrefs = {
  order: RightRailItemId[];
  /** Explicitly hidden ids (missing from hidden = visible). */
  hidden: RightRailItemId[];
};

export const RIGHT_TOOL_RAIL_PREFS_KEY = "ssh-right-tool-rail-prefs";

export const DEFAULT_RIGHT_TOOL_RAIL_PREFS: RightToolRailPrefs = {
  order: [...RIGHT_RAIL_DEFAULT_ORDER],
  hidden: [],
};

const ALL_IDS = new Set<string>(RIGHT_RAIL_DEFAULT_ORDER);

export function sanitizeRightRailItemId(raw: unknown): RightRailItemId | null {
  return typeof raw === "string" && ALL_IDS.has(raw) ? (raw as RightRailItemId) : null;
}

export function sanitizeRightToolRailPrefs(raw: unknown): RightToolRailPrefs {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const orderRaw = Array.isArray(o.order) ? o.order : [];
  const seen = new Set<string>();
  const order: RightRailItemId[] = [];
  for (const item of orderRaw) {
    const id = sanitizeRightRailItemId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }
  for (const id of RIGHT_RAIL_DEFAULT_ORDER) {
    if (!seen.has(id)) order.push(id);
  }
  const hiddenRaw = Array.isArray(o.hidden) ? o.hidden : [];
  const hidden: RightRailItemId[] = [];
  for (const item of hiddenRaw) {
    const id = sanitizeRightRailItemId(item);
    if (!id || hidden.includes(id)) continue;
    hidden.push(id);
  }
  return { order, hidden };
}

export function loadRightToolRailPrefs(storage: Pick<Storage, "getItem"> = uiStorage): RightToolRailPrefs {
  try {
    const raw = storage.getItem(RIGHT_TOOL_RAIL_PREFS_KEY);
    if (!raw) return { ...DEFAULT_RIGHT_TOOL_RAIL_PREFS, order: [...RIGHT_RAIL_DEFAULT_ORDER], hidden: [] };
    return sanitizeRightToolRailPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_RIGHT_TOOL_RAIL_PREFS, order: [...RIGHT_RAIL_DEFAULT_ORDER], hidden: [] };
  }
}

export function persistRightToolRailPrefs(
  prefs: RightToolRailPrefs,
  storage: Pick<Storage, "setItem"> = uiStorage,
): void {
  try {
    storage.setItem(RIGHT_TOOL_RAIL_PREFS_KEY, JSON.stringify(sanitizeRightToolRailPrefs(prefs)));
  } catch {
    // Opaque origin / quota: keep in-memory only.
  }
}

/** Visible ids in preference order, optionally filtered by a predicate (e.g. JumpServer-only assets). */
export function visibleRailItems(
  prefs: RightToolRailPrefs,
  options?: { include?: (id: RightRailItemId) => boolean },
): RightRailItemId[] {
  const hidden = new Set(prefs.hidden);
  return prefs.order.filter((id) => {
    if (hidden.has(id)) return false;
    if (options?.include && !options.include(id)) return false;
    return true;
  });
}

/**
 * Group visible items using the default group membership, ordered by prefs.order.
 * Empty groups are dropped so separators only appear between populated groups.
 */
export function groupedVisibleRailItems(
  prefs: RightToolRailPrefs,
  options?: { include?: (id: RightRailItemId) => boolean },
): RightRailItemId[][] {
  const visible = visibleRailItems(prefs, options);
  const rank = new Map(visible.map((id, index) => [id, index]));
  const groups: RightRailItemId[][] = [];
  for (const group of RIGHT_RAIL_GROUPS) {
    const items = group
      .filter((id) => rank.has(id))
      .sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
    if (items.length) groups.push(items);
  }
  return groups;
}

export function moveRailItem(order: readonly RightRailItemId[], id: RightRailItemId, delta: -1 | 1): RightRailItemId[] {
  const next = [...order];
  const index = next.indexOf(id);
  if (index < 0) return next;
  const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  const tmp = next[index]!;
  next[index] = next[target]!;
  next[target] = tmp;
  return next;
}

export function toggleRailItemHidden(hidden: readonly RightRailItemId[], id: RightRailItemId): RightRailItemId[] {
  return hidden.includes(id) ? hidden.filter((item) => item !== id) : [...hidden, id];
}

/** i18n label key for settings rows. */
export function rightRailItemLabelKey(id: RightRailItemId): string {
  switch (id) {
    case "monitor":
      return "monitorDock.toggle";
    case "copilot":
      return "copilot.openDock";
    case "forwards":
      return "forwards.title";
    case "assets":
      return "jumpserver.title";
    case "docker":
      return "docker.title";
    case "history":
      return "historyPanel.titleShortcut";
    case "otp":
      return "otp.title";
    case "command":
      return "commandTitle";
    case "batch":
      return "batchSendTitle";
    case "record":
      return "recordingTitle";
    case "recordings":
      return "recordingsTitle";
    default:
      return id;
  }
}
