import { describe, expect, it } from "vitest";
import {
  applyPtyInputLine,
  browseCommandHistory,
  commandInputAction,
  formatHistoryAge,
  historyForScope,
  isNoiseHistoryLine,
  markHistoryExit,
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
