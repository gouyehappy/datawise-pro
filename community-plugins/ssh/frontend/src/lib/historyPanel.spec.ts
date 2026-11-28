import { describe, expect, it } from "vitest";
import {
  applyHistoryFilter,
  clampHistoryIndex,
  coerceHistorySortMode,
  filterHistory,
  HISTORY_ALL_HOSTS,
  HISTORY_SORT_DEFAULT,
  HISTORY_SORT_MODES,
  HISTORY_UNKNOWN_HOST,
  historyEntryFailed,
  historyGroupLabel,
  historyHosts,
  historySuccessBoost,
  HISTORY_SUCCESS_BOOST,
  isHistoryOverlayShortcut,
  mergeRemoteHistory,
  resolveHistoryPanelKey,
  sortHistoryView,
} from "./historyPanel";
import { isBastionMenuContext } from "./bastionContext";

describe("resolveHistoryPanelKey", () => {
  const base = { ctrlKey: false, metaKey: false, altKey: false };
  it("maps arrows, confirm, run, remove, pin and cancel", () => {
    expect(resolveHistoryPanelKey({ ...base, key: "ArrowUp" })).toEqual({ action: "move", delta: 1 });
    expect(resolveHistoryPanelKey({ ...base, key: "ArrowDown" })).toEqual({ action: "move", delta: -1 });
    expect(resolveHistoryPanelKey({ ...base, key: "Enter" })).toEqual({ action: "confirm" });
    expect(resolveHistoryPanelKey({ ...base, key: "Tab" })).toEqual({ action: "confirm" });
    expect(resolveHistoryPanelKey({ ...base, key: "Enter", ctrlKey: true })).toEqual({ action: "confirm-run" });
    expect(resolveHistoryPanelKey({ ...base, key: "Delete" })).toEqual({ action: "remove" });
    expect(resolveHistoryPanelKey({ ...base, key: "p", ctrlKey: true })).toEqual({ action: "pin" });
    expect(resolveHistoryPanelKey({ ...base, key: "Escape" })).toEqual({ action: "cancel" });
    expect(resolveHistoryPanelKey({ ...base, key: "ArrowUp", ctrlKey: true })).toEqual({ action: "ignore" });
  });
});

describe("isHistoryOverlayShortcut", () => {
  it("matches only Motty Ctrl/Cmd+Shift+H", () => {
    expect(isHistoryOverlayShortcut({ key: "h", ctrlKey: true, metaKey: false, altKey: false, shiftKey: true })).toBe(true);
    expect(isHistoryOverlayShortcut({ key: "H", ctrlKey: false, metaKey: true, altKey: false, shiftKey: true })).toBe(true);
    expect(isHistoryOverlayShortcut({ key: "r", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toBe(false);
    expect(isHistoryOverlayShortcut({ key: "h", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toBe(false);
    expect(isHistoryOverlayShortcut({ key: "h", ctrlKey: true, metaKey: false, altKey: true, shiftKey: true })).toBe(false);
  });
});

describe("filter and clamp", () => {
  it("fzf-ranks subsequence hits and clamps arrows", () => {
    const history = [
      { command: "ls" },
      { command: "cd /tmp" },
      { command: "ls -la" },
      { command: "kubectl get pods -A", pinned: true },
    ];
    const lsHits = filterHistory(history, "ls").map((e) => e.command);
    expect(lsHits[0]).toBe("ls");
    expect(lsHits).toContain("ls -la");
    expect(filterHistory(history, "kgp")[0]?.command).toMatch(/kubectl get pods/);
    expect(clampHistoryIndex(3, -1, 1)).toBe(0);
    expect(clampHistoryIndex(0, 0, 1)).toBe(-1);
  });

  it("breaks near-ties toward commands that last succeeded, but never over pinned", () => {
    expect(historySuccessBoost({ command: "ls", exitCode: 0 })).toBe(HISTORY_SUCCESS_BOOST);
    expect(historySuccessBoost({ command: "ls", exitCode: 1 })).toBe(0);
    expect(historySuccessBoost({ command: "ls" })).toBe(0);
    // Both rows score identically for "ls" (same prefix, same tight match).
    const tied = [
      { command: "ls -a", exitCode: 1 },
      { command: "ls -b", exitCode: 0 },
    ];
    expect(filterHistory(tied, "ls")[0]?.command).toBe("ls -b");
    const pinned = [
      { command: "ls -a", exitCode: 0 },
      { command: "ls -b", exitCode: 1, pinned: true },
    ];
    expect(filterHistory(pinned, "ls")[0]?.command).toBe("ls -b");
    // Empty query keeps store order: no metadata-driven reshuffle.
    expect(filterHistory(tied, "  ").map((e) => e.command)).toEqual(["ls -a", "ls -b"]);
  });
});

describe("history result filters (beta.43)", () => {
  const rows = [
    { command: "ls -la", exitCode: 0, host: "prod-web-01" },
    { command: "systemctl restart nginx", exitCode: 5, host: "prod-web-01" },
    { command: "df -h", exitCode: 1, host: "db-primary" },
    { command: "make test", failed: true, host: "ci-runner" },
    { command: "pwd" },
  ];

  it("only treats known non-zero / legacy failed as failures", () => {
    expect(HISTORY_ALL_HOSTS).toBe("");
    expect(historyEntryFailed(rows[0])).toBe(false);
    expect(historyEntryFailed(rows[1])).toBe(true);
    expect(historyEntryFailed(rows[3])).toBe(true);
    expect(historyEntryFailed(rows[4])).toBe(false);
    expect(historyEntryFailed({ command: "x", exitCode: Number.NaN })).toBe(false);
    // The authoritative exitCode wins over a stale legacy failed flag.
    expect(historyEntryFailed({ command: "x", failed: true, exitCode: 0 })).toBe(false);
    expect(historyEntryFailed({ command: "x", failed: false, exitCode: 3 })).toBe(true);
  });

  it("collects distinct, cleaned, sorted host labels", () => {
    const dirty = [
      { command: "a", host: "  prod-web-01  " },
      { command: "b", host: "prod-web-01" },
      { command: "c", host: "\u0007db-primary" },
      { command: "d", host: "   " },
      { command: "e" },
      { command: "f", host: "a".repeat(200) },
    ];
    const hosts = historyHosts(dirty);
    expect(hosts[0]).toBe("a".repeat(80));
    expect(hosts).toContain("prod-web-01");
    expect(hosts).toContain("db-primary");
    expect(hosts.filter((h) => h === "prod-web-01")).toHaveLength(1);
    expect(hosts).toEqual([...hosts].sort((a, b) => a.localeCompare(b)));
  });

  it("applies host / failure filters independently without mutating input", () => {
    expect(applyHistoryFilter(rows)).toHaveLength(5);
    expect(applyHistoryFilter(rows, {})).toHaveLength(5);
    expect(applyHistoryFilter(rows, { failedOnly: true }).map((e) => e.command)).toEqual([
      "systemctl restart nginx", "df -h", "make test",
    ]);
    expect(applyHistoryFilter(rows, { host: "prod-web-01" }).map((e) => e.command)).toEqual([
      "ls -la", "systemctl restart nginx",
    ]);
    expect(applyHistoryFilter(rows, { failedOnly: true, host: "prod-web-01" }).map((e) => e.command)).toEqual([
      "systemctl restart nginx",
    ]);
    // Control characters in the filter value are cleaned the same way as stored hosts.
    expect(applyHistoryFilter(rows, { host: "\u0007db-primary" }).map((e) => e.command)).toEqual(["df -h"]);
    expect(applyHistoryFilter(rows, { host: "" })).toHaveLength(5);
    expect(rows).toHaveLength(5);
  });

  it("filterHistory narrows candidates before scoring and keeps the 2-arg form", () => {
    // "ls" hits the successful row; "nginx" hits the failed one.
    expect(filterHistory(rows, "ls").map((e) => e.command)).toEqual(["ls -la"]);
    expect(filterHistory(rows, "ls", { failedOnly: true })).toEqual([]);
    expect(filterHistory(rows, "nginx").map((e) => e.command)).toEqual(["systemctl restart nginx"]);
    expect(filterHistory(rows, "nginx", { failedOnly: true }).map((e) => e.command)).toEqual([
      "systemctl restart nginx",
    ]);
    expect(filterHistory(rows, "nginx", { host: "db-primary" })).toEqual([]);
    // Empty query + filter still preserves pinned/store order.
    const empty = filterHistory(rows, "  ", { host: "prod-web-01" }).map((e) => e.command);
    expect(empty).toEqual(["ls -la", "systemctl restart nginx"]);
    // A host with no surviving rows yields an empty list, not the whole store.
    expect(filterHistory(rows, "", { host: "no-such-host" })).toEqual([]);
  });
});

describe("history browsing sort / grouping (beta.44)", () => {
  const rows = [
    { command: "fast", durationMs: 120, host: "db-primary" },
    { command: "slow", durationMs: 9800, host: "prod-web-01" },
    { command: "unknown" },
    { command: "medium", durationMs: 800, host: "prod-web-01" },
    { command: "pinned", durationMs: 5, host: "db-primary", pinned: true },
  ];

  it("coerces persisted sort values defensively", () => {
    expect(coerceHistorySortMode("durationDesc")).toBe("durationDesc");
    expect(coerceHistorySortMode("host")).toBe("host");
    expect(coerceHistorySortMode("bogus")).toBe(HISTORY_SORT_DEFAULT);
    expect(coerceHistorySortMode(null)).toBe("recent");
    expect(coerceHistorySortMode(42)).toBe("recent");
    expect(HISTORY_SORT_MODES).toHaveLength(4);
  });

  it("recent keeps store order and never mutates the input", () => {
    const out = sortHistoryView(rows, "recent");
    expect(out.map((e) => e.command)).toEqual(rows.map((e) => e.command));
    expect(out).not.toBe(rows);
    expect(rows.map((e) => e.command)).toEqual(["fast", "slow", "unknown", "medium", "pinned"]);
  });

  it("sorts by measured duration with unknown metadata always last", () => {
    expect(sortHistoryView(rows, "durationDesc").map((e) => e.command)).toEqual([
      "pinned", "slow", "medium", "fast", "unknown",
    ]);
    expect(sortHistoryView(rows, "durationAsc").map((e) => e.command)).toEqual([
      "pinned", "fast", "medium", "slow", "unknown",
    ]);
    // Unknown duration sinks even in ascending mode; NaN / negative are unknown.
    const dirty = [
      { command: "a", durationMs: Number.NaN },
      { command: "b", durationMs: -1 },
      { command: "c", durationMs: 10 },
    ];
    expect(sortHistoryView(dirty, "durationAsc").map((e) => e.command)).toEqual(["c", "a", "b"]);
  });

  it("keeps pinned rows on top in every non-recent mode", () => {
    // `recent` deliberately preserves store order (the store already pins on
    // write); only the explicit sorts need to re-assert the pinned priority.
    for (const mode of HISTORY_SORT_MODES.filter((m) => m !== "recent")) {
      expect(sortHistoryView(rows, mode)[0].command).toBe("pinned");
    }
  });

  it("groups by host in a stable order with unknown host last", () => {
    const grouped = sortHistoryView(rows, "host");
    expect(grouped.map((e) => e.command)).toEqual([
      "pinned", "fast", "slow", "medium", "unknown",
    ]);
    const heads = grouped.map((_, i) => historyGroupLabel(grouped, i, "host"));
    expect(heads).toEqual(["db-primary", null, "prod-web-01", null, HISTORY_UNKNOWN_HOST]);
  });

  it("never emits group headers outside host mode or past the last row", () => {
    expect(historyGroupLabel(rows, 0, "recent")).toBeNull();
    expect(historyGroupLabel(rows, 0, "durationDesc")).toBeNull();
    expect(historyGroupLabel(rows, -1, "host")).toBeNull();
    expect(historyGroupLabel(rows, rows.length, "host")).toBeNull();
    expect(historyGroupLabel([], 0, "host")).toBeNull();
  });

  it("still filters before sorting without losing rows", () => {
    const filtered = filterHistory(rows, "", { host: "prod-web-01" });
    expect(sortHistoryView(filtered, "durationDesc").map((e) => e.command)).toEqual(["slow", "medium"]);
  });
});

describe("mergeRemoteHistory", () => {
  it("dedupes and drops bastion noise", () => {
    expect(
      mergeRemoteHistory([{ command: "ls" }], ["No PTY requested.", "pwd", "#1712345678"], 10).map((e) => e.command),
    ).toEqual(["pwd", "ls"]);
  });
});

describe("isBastionMenuContext", () => {
  it("detects JumpServer menus without a shell prompt", () => {
    expect(isBastionMenuContext("Opt> ")).toBe(true);
    expect(isBastionMenuContext("Welcome to JumpServer\nOpt> ")).toBe(true);
    expect(isBastionMenuContext("root@k8s-121:~# ls")).toBe(false);
  });
});
