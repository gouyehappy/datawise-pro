import { describe, expect, it } from "vitest";
import {
  applyPtyInputLine,
  browseCommandHistory,
  commandInputAction,
  formatHistoryAge,
  historyForScope,
  historyResultBadge,
  isNoiseHistoryLine,
  markHistoryExit,
  markHistoryResult,
  HISTORY_HOST_MAX_LENGTH,
  normalizeHistoryCommand,
  pushCommandHistory,
  removeHistoryEntry,
  resolvePtySubmitCommand,
  sanitizeCommandHistory,
  togglePinHistory,
  truncateHistoryCommand,
} from "./commandHistory";

describe("command input keyboard behavior", () => {
  const base = {
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    selectionStart: 0,
    selectionEnd: 0,
    valueLength: 10,
  };

  it("keeps plain Enter available for multiline commands", () => {
    expect(commandInputAction({ ...base, key: "Enter" })).toBe("none");
    expect(commandInputAction({ ...base, key: "Enter", shiftKey: true })).toBe("none");
  });

  it("uses Ctrl/Cmd+Enter to submit", () => {
    expect(commandInputAction({ ...base, key: "Enter", ctrlKey: true })).toBe("run");
    expect(commandInputAction({ ...base, key: "Enter", metaKey: true })).toBe("run");
    expect(commandInputAction({ ...base, key: "Enter", ctrlKey: true, shiftKey: true })).toBe("none");
  });

  it("only captures history arrows at the editor edges", () => {
    expect(commandInputAction({ ...base, key: "ArrowUp" })).toBe("history-up");
    expect(commandInputAction({ ...base, key: "ArrowDown", selectionStart: 10, selectionEnd: 10 })).toBe("history-down");
    expect(commandInputAction({ ...base, key: "ArrowUp", selectionStart: 4, selectionEnd: 4 })).toBe("none");
  });
});

describe("command history entries", () => {
  it("keeps multiline commands intact for in-session reruns", () => {
    const command = ["llamafactory-cli api \\", "--model_name_or_path ~/.cache/modelscope/hub/models/Qwen/Qwen3/"].join("\n");
    expect(pushCommandHistory([], command).map((e) => e.command)).toEqual([command]);
  });

  it("rejects bastion / histtime noise", () => {
    expect(isNoiseHistoryLine("No PTY requested.")).toBe(true);
    expect(normalizeHistoryCommand("  No PTY requested.  ")).toBeNull();
    expect(pushCommandHistory([{ command: "ls" }], "No PTY requested.")).toEqual([{ command: "ls" }]);
  });

  it("pins stay above recency and survive re-push", () => {
    let history = pushCommandHistory([], "ls");
    history = pushCommandHistory(history, "pwd");
    history = togglePinHistory(history, "ls");
    expect(history[0].command).toBe("ls");
    expect(history[0].pinned).toBe(true);
    history = pushCommandHistory(history, "ls");
    expect(history[0].pinned).toBe(true);
    history = removeHistoryEntry(history, "pwd");
    expect(history.map((e) => e.command)).toEqual(["ls"]);
  });

  it("sanitizes legacy string arrays", () => {
    expect(sanitizeCommandHistory(["ls", "No PTY requested.", "pwd"]).map((e) => e.command)).toEqual(["ls", "pwd"]);
  });

  it("marks failed exits and scopes by connection", () => {
    let history = pushCommandHistory([], "false", 10, { connectionId: "a" });
    history = markHistoryExit(history, "false", 1, "a");
    expect(history[0].failed).toBe(true);
    history = pushCommandHistory(history, "true", 10, { connectionId: "b" });
    expect(historyForScope(history, "connection", "a").map((e) => e.command)).toEqual(["false"]);
    expect(historyForScope(history, "global", "a")).toHaveLength(2);
  });

  it("formats age and truncates long commands", () => {
    const labels = { justNow: "now", minutes: "{n}m", hours: "{n}h", days: "{n}d" };
    expect(formatHistoryAge(Date.now() - 1000, Date.now(), labels)).toBe("now");
    expect(formatHistoryAge(Date.now() - 120_000, Date.now(), labels)).toBe("2m");
    expect(truncateHistoryCommand("a".repeat(100), 20).includes("…")).toBe(true);
  });
});

describe("applyPtyInputLine", () => {
  it("submits the buffered line on Enter and supports backspace", () => {
    expect(applyPtyInputLine("", "ls\r")).toEqual({ line: "", submitted: ["ls"] });
    expect(applyPtyInputLine("lsx", "\u007f\r")).toEqual({ line: "", submitted: ["ls"] });
  });

  it("uses resolveOnSubmit so Tab-completed visible lines win", () => {
    expect(
      applyPtyInputLine("cd /da", "\r", () => resolvePtySubmitCommand("cd /da", "cd /data/logs/")),
    ).toEqual({ line: "", submitted: ["cd /data/logs/"] });
  });
});

describe("browseCommandHistory", () => {
  it("walks entry commands", () => {
    const history = [{ command: "ls" }, { command: "pwd" }];
    expect(browseCommandHistory(history, -1, "up").draft).toBe("ls");
    expect(browseCommandHistory(history, 0, "up").draft).toBe("pwd");
  });
});

describe("history result metadata (OSC 633 D)", () => {
  const labels = { exit: "exit {code}", ok: "ok" };

  it("stamps exit code, duration and host on the matching command", () => {
    let history = pushCommandHistory([], "make test", 10, { connectionId: "a" });
    history = markHistoryResult(history, "make test", { exitCode: 2, durationMs: 1234, host: "prod-web" }, "a");
    expect(history[0]).toMatchObject({ exitCode: 2, durationMs: 1234, host: "prod-web", failed: true });
    expect(history[0].command).toBe("make test");
  });

  it("marks a zero exit as successful", () => {
    const history = markHistoryResult([{ command: "ls", failed: true }], "ls", { exitCode: 0 });
    expect(history[0]).toMatchObject({ exitCode: 0, failed: false });
  });

  it("does not erase fields the D frame did not supply", () => {
    let history = markHistoryResult([{ command: "ls" }], "ls", { exitCode: 1, durationMs: 900, host: "db-1" });
    history = markHistoryResult(history, "ls", { exitCode: 0 });
    expect(history[0]).toMatchObject({ exitCode: 0, durationMs: 900, host: "db-1", failed: false });
  });

  it("respects connection scope and leaves unknown / invalid results untouched", () => {
    const original = [{ command: "ls", connectionId: "a" }];
    expect(markHistoryResult(original, "ls", { exitCode: 1 }, "b")).toEqual(original);
    expect(markHistoryResult(original, "missing", { exitCode: 1 }, "a")).toEqual(original);
    expect(markHistoryResult(original, "ls", { exitCode: Number.NaN }, "a")).toEqual(original);
    expect(markHistoryResult(original, "ls", { exitCode: Number.POSITIVE_INFINITY }, "a")).toEqual(original);
    // A D frame without a duration must not record "0ms" (Number(null) === 0).
    expect(markHistoryResult([{ command: "ls" }], "ls", { exitCode: 0, durationMs: null })[0].durationMs).toBeUndefined();
    expect(original).toEqual([{ command: "ls", connectionId: "a" }]);
  });

  it("sanitizes the host label before stamping", () => {
    const history = markHistoryResult([{ command: "ls" }], "ls", {
      exitCode: 0,
      durationMs: -5,
      host: `  web\u0007-${"x".repeat(200)}  `,
    });
    expect(history[0].host).toHaveLength(HISTORY_HOST_MAX_LENGTH);
    expect(history[0].host).not.toMatch(/[\u0000-\u001f\u007f]/);
    expect(history[0].durationMs).toBeUndefined();
  });

  it("keeps the legacy markHistoryExit signature working", () => {
    const history = markHistoryExit([{ command: "false" }], "false", 1, "a");
    expect(history[0]).toMatchObject({ exitCode: 1, failed: true });
    expect(history[0].durationMs).toBeUndefined();
  });

  it("re-running a command carries the last result forward until the next D frame", () => {
    let history = markHistoryResult([{ command: "ls" }], "ls", { exitCode: 0, durationMs: 12, host: "web" });
    history = pushCommandHistory(history, "ls");
    expect(history[0]).toMatchObject({ exitCode: 0, durationMs: 12, host: "web" });
  });

  it("sanitizeCommandHistory reads metadata but rejects poisoned values", () => {
    const entries = sanitizeCommandHistory([
      { command: "ls", exitCode: 0, durationMs: 1500, host: "prod" },
      { command: "pwd", exitCode: "NaN", durationMs: -1, host: 42 },
      "legacy-cmd",
    ]);
    expect(entries[0]).toMatchObject({ exitCode: 0, durationMs: 1500, host: "prod" });
    expect(entries[1].exitCode).toBeUndefined();
    expect(entries[1].durationMs).toBeUndefined();
    expect(entries[1].host).toBeUndefined();
    expect(entries.map((e) => e.command)).toContain("legacy-cmd");
  });

  it("builds a display badge only when result metadata exists", () => {
    expect(historyResultBadge({ command: "ls" }, labels)).toBeNull();
    expect(historyResultBadge({ command: "ls", exitCode: 0 }, labels)).toMatchObject({ tone: "ok", exitText: "ok" });
    expect(historyResultBadge({ command: "ls", exitCode: 127, durationMs: 2500, host: "db-1" }, labels)).toMatchObject({
      tone: "fail",
      exitText: "exit 127",
      durationText: "2.5s",
      hostText: "db-1",
      text: "exit 127 · 2.5s · db-1",
    });
    expect(historyResultBadge({ command: "ls", host: "only-host" }, labels)).toMatchObject({
      tone: "neutral",
      exitText: "",
      text: "only-host",
    });
    expect(
      historyResultBadge({ command: "ls", exitCode: 1 }, { exit: "退出码 {code}", ok: "成功", separator: " | " })?.text,
    ).toBe("退出码 1");
  });
});
