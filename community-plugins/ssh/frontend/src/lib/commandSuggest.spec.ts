import { describe, expect, it } from "vitest";
import {
  applyInputToToken,
  COMMON_COMMANDS,
  completionSuffix,
  cursorLineTextBeforeCursor,
  extractCommandPrefix,
  filterCommandSuggest,
  filterPathSuggest,
  filterRedundantExactSuggest,
  figArgsHandoffItem,
  fillSuggestPayload,
  ghostRemainder,
  ghostWordRemainder,
  matchesGhostWordAccept,
  recentHistorySuggestions,
  isCommandName,
  isSafePathPrefix,
  matchesGhostFullAccept,
  mergeSuggestItems,
  normalizePathCandidate,
  parseCommandNames,
  parseSuggestQuery,
  resolveCommandSuggestKey,
  resolveSuggestionTabKey,
  searchLineSuggestions,
  shouldSuppressSuggest,
  overlayPlacement,
} from "./commandSuggest";

describe("parse and filter", () => {
  it("keeps command-like names and ranks recents first", () => {
    expect(isCommandName("ls")).toBe(true);
    expect(isCommandName("12foo")).toBe(false);
    expect(parseCommandNames("ls\nls\nlaravel\nnot a cmd\n")).toEqual(["ls", "laravel"]);
    expect(filterCommandSuggest(["laravel", "ls", "lsblk", "lscpu"], "ls", ["ls"])).toEqual([
      "ls",
      "lsblk",
      "lscpu",
    ]);
    expect(filterCommandSuggest(COMMON_COMMANDS, "ls")[0]).toBe("ls");
  });
});

describe("parseSuggestQuery", () => {
  it("treats the first token as a command and later tokens as paths", () => {
    expect(parseSuggestQuery("root@k8s-121:~# ls")).toEqual({ kind: "command", prefix: "ls" });
    expect(parseSuggestQuery("root@k8s-121:~# ls ")).toEqual({ kind: "path", prefix: "" });
    expect(parseSuggestQuery("root@k8s-121:~# ls /va")).toEqual({ kind: "path", prefix: "/va" });
    expect(extractCommandPrefix("root@host:~# ls -l")).toBe("");
    expect(extractCommandPrefix("Opt> 121")).toBe("121");
  });
});

describe("suppress and placement", () => {
  it("ignores JumpServer option prompts and prefers below", () => {
    expect(shouldSuppressSuggest("Opt> 121")).toBe(true);
    expect(shouldSuppressSuggest("root@k8s-121:~# ls")).toBe(false);
    expect(overlayPlacement(2, 24)).toBe("below");
    expect(overlayPlacement(20, 24)).toBe("above");
  });
});

describe("history fuzzy search", () => {
  it("ranks history and quick commands like fzf subsequence", () => {
    const hits = searchLineSuggestions("k get", {
      history: ["kubectl get pods -A", "ls -la", "kubectl describe node"],
      quickCommands: [{ name: "pods", command: "kubectl get pods" }],
    });
    expect(hits[0]?.command).toMatch(/kubectl get/);
    expect(hits.some((item) => item.source === "quick")).toBe(true);
    expect(mergeSuggestItems(hits, [{ command: "kill", source: "command", indices: [0], score: 0 }]).map((i) => i.command)).toContain("kill");
  });

  it("hides exact-only repeats but keeps history with args", () => {
    const hits = searchLineSuggestions("curl", {
      history: ["curl", "curl -v https://example.com", "curl --help"],
      quickCommands: [],
    });
    const useful = filterRedundantExactSuggest("curl", [
      ...hits,
      { command: "curl", source: "command", indices: [0, 1, 2, 3], score: 0 },
    ]);
    expect(useful.every((item) => item.command.toLowerCase() !== "curl")).toBe(true);
    expect(useful.map((item) => item.command)).toEqual(
      expect.arrayContaining(["curl -v https://example.com", "curl --help"]),
    );
    expect(filterRedundantExactSuggest("curl", [{ command: "curl", source: "history", indices: [], score: 1 }])).toEqual([]);
  });

  it("builds recent-history helpers and a space handoff item (empty prompt stays closed in App)", () => {
    expect(recentHistorySuggestions(["ls", "ls", "pwd"], 2).map((i) => i.command)).toEqual(["ls", "pwd"]);
    const handoff = figArgsHandoffItem("curl");
    expect(handoff.command).toBe("curl ");
    expect(ghostRemainder("curl", handoff)).toBe(" ");
  });
});

describe("path candidates", () => {
  it("joins basenames onto the typed directory prefix", () => {
    expect(isSafePathPrefix("/var/l")).toBe(true);
    expect(isSafePathPrefix("/var/l; rm")).toBe(false);
    expect(normalizePathCandidate("/var/l", "log")).toBe("/var/log");
    expect(filterPathSuggest(["/var/log", "/var/lib", "/tmp"], "/var/l")).toEqual(["/var/log", "/var/lib"]);
  });
});

describe("cursor line and typed token", () => {
  it("reads viewportY + cursorY, not the scrollback index", () => {
    const lines = ["old", "root@k8s-121:~# ls"];
    const text = cursorLineTextBeforeCursor({
      viewportY: 10,
      cursorY: 1,
      cursorX: 19,
      getLine(y) {
        return { translateToString: (_trim, start, end) => (lines[y - 10] ?? "").slice(start, end) };
      },
    });
    expect(parseSuggestQuery(text)).toEqual({ kind: "command", prefix: "ls" });
  });

  it("tracks the live token from keystrokes including paths", () => {
    expect(applyInputToToken("", "l")).toBe("l");
    expect(applyInputToToken("l", "s")).toBe("ls");
    expect(applyInputToToken("ls", " ")).toBe("");
    expect(applyInputToToken("/", "v")).toBe("/v");
  });
});

describe("keyboard and fill", () => {
  it("fills on Tab when prefix/armed, never injects Enter, accepts ghost on →", () => {
    expect(completionSuffix("l", "ls")).toBe("s");
    expect(ghostRemainder("kubectl get", { command: "kubectl get pods", source: "history", indices: [], score: 1 })).toBe(" pods");
    expect(ghostRemainder("kg", { command: "kubectl get pods", source: "history", indices: [], score: 1 })).toBe("");
    expect(fillSuggestPayload("k get", { command: "kubectl get pods", source: "history", indices: [], score: 1 })).toBe(
      `${"\u007f".repeat(5)}kubectl get pods`,
    );
    expect(fillSuggestPayload("ls", { command: "lsblk", source: "command", indices: [], score: 0 })).toBe("blk");
    expect(resolveSuggestionTabKey("kubectl get pods", "k get", false)).toBe("shell");
    expect(resolveSuggestionTabKey("kubectl get pods", "kubectl get", false)).toBe("fill");
    expect(resolveSuggestionTabKey("kubectl get pods", "k get", true)).toBe("fill");
    const base = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };
    expect(resolveCommandSuggestKey({ ...base, key: "Tab" })).toEqual({ action: "accept" });
    expect(resolveCommandSuggestKey({ ...base, key: "Enter" })).toEqual({ action: "ignore" });
    expect(matchesGhostFullAccept({ ...base, key: "ArrowRight" })).toBe(true);
    expect(matchesGhostFullAccept({ ...base, ctrlKey: true, key: "f" })).toBe(true);
    expect(matchesGhostFullAccept({ ...base, ctrlKey: true, shiftKey: true, key: "f" })).toBe(false);
    expect(matchesGhostFullAccept({ ...base, metaKey: true, key: "f" })).toBe(false);
    expect(ghostWordRemainder(" pods -A")).toBe(" pods");
    expect(ghostWordRemainder("status")).toBe("status");
    expect(matchesGhostWordAccept({ ...base, key: "ArrowRight", altKey: true })).toBe(true);
    expect(matchesGhostWordAccept({ ...base, key: "ArrowRight", ctrlKey: true })).toBe(true);
    expect(matchesGhostWordAccept({ ...base, key: "ArrowRight" })).toBe(false);
    // Unarmed ↑ yields to shell history; ↓ / armed ↑ navigate the menu.
    expect(resolveCommandSuggestKey({ ...base, key: "ArrowUp" })).toEqual({ action: "passthrough" });
    expect(resolveCommandSuggestKey({ ...base, key: "ArrowUp", menuArmed: true })).toEqual({
      action: "move",
      delta: -1,
    });
    expect(resolveCommandSuggestKey({ ...base, key: "ArrowDown" })).toEqual({ action: "move", delta: 1 });
  });
});
