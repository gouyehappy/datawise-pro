import { describe, expect, it } from "vitest";
import appVueSource from "../App.vue?raw";
// vite 的 CSS 插件会拦截 `?raw`，只能直接读磁盘。tsconfig 仅装 vite/client，
// 但 vitest 跑在 node 环境，这两个内置模块运行时可用，故局部压掉类型缺失。
// @ts-ignore -- node:fs
import { readFileSync } from "node:fs";
// @ts-ignore -- node:url
import { fileURLToPath } from "node:url";
import { Osc7DirectoryParser, parseOsc7Path } from "./terminalDirectoryTracking";
import { describeReconnectCountdown, describeReconnectRestoredNotice, isConnectionInactiveError, isSessionGoneError, shouldReattachTerminal, terminalReconnectDelay } from "./terminalReconnect";
import { advanceBatchProgress, batchProgressPercent, createBatchProgress } from "./sftpBatchProgress";
import { sampleTransferSpeed } from "./transferSpeed";
import { DANGEROUS_COMMAND_PATTERNS, buildPasteConfirmation, inspect } from "./dangerousCommands";
import { clampFontSize } from "./terminalZoom";
import { pushPathHistory, sanitizePathHistories } from "./sftpPathHistory";
import { formatBytes, formatRate } from "./format";
import { expandSelection, filterSftpEntries } from "./sftpFileFilters";
import {
  clampSftpWidthPx,
  getSshWorkbenchSplitLayout,
  isSftpDrawerLayout,
  resolvePaneOrder,
  resolveSftpPaneOpen,
  resolveSftpWidthPx,
  sanitizeSftpPaneDefaultOpen,
  SFTP_WIDTH_DEFAULT_PX,
  SFTP_WIDTH_MAX_PX,
  SFTP_WIDTH_MIN_PX,
} from "./workbenchLayout";
import { commandMarkerTooltip, formatCommandDuration, getOsc633ParserState, parseOsc633StreamChunk, runningCommandElapsedMs } from "./terminalCommandMarkers";
import { describeWorkbenchSessionStatus, isUsableSshSession, normalizeSshSessionStatus } from "./sessionStatus";
import { sanitizeCommandOutput, stripCommandEcho, stripHiddenCommandEchoes, stripTerminalControlSequences } from "./terminalOutputText";
import { browseCommandHistory, isPersistableCommand, pushCommandHistory, sanitizeCommandHistory } from "./commandHistory";
import { formatAuthMethodLabel, formatLatency } from "./connectionInfo";
import { normalizeQuickCommands, QUICK_COMMANDS_LIMIT, removeQuickCommand, upsertQuickCommand, type QuickCommand } from "./quickCommands";
import { resolveWorkbenchLocale, workbenchMessage, workbenchMessageTable, type WorkbenchLocale } from "./i18n";
import { commandHintAllowed } from "./commandHintVisibility";

describe("SSH workbench protocol helpers", () => {
  it("parses OSC 7 markers split across terminal frames", () => {
    const parser = new Osc7DirectoryParser();
    expect(parser.push("prompt\u001b]7;file://server/home/us")).toEqual([]);
    expect(parser.push("er%20name\u0007$ ")).toEqual(["/home/user name"]);
    expect(parseOsc7Path("invalid")).toBeNull();
  });

  it("uses bounded reconnect backoff only for the same live session", () => {
    expect([0, 1, 2, 3, 99].map(terminalReconnectDelay)).toEqual([500, 1000, 2000, 5000, 5000]);
    expect(shouldReattachTerminal({ disposed: false, state: "connecting", expectedSessionId: "a", currentSessionId: "a" })).toBe(true);
    expect(shouldReattachTerminal({ disposed: false, state: "connected", expectedSessionId: "a", currentSessionId: "b" })).toBe(false);
  });

  it("computes the reconnect countdown from the scheduled retry timestamp", () => {
    // No retry pending: no countdown to render.
    expect(describeReconnectCountdown({ pending: false, attempt: 1, nextAt: Date.now() + 1000, now: Date.now(), delayMs: 1000 })).toBeNull();
    expect(describeReconnectCountdown({ pending: true, attempt: 1, nextAt: 0, now: Date.now(), delayMs: 1000 })).toBeNull();
    expect(describeReconnectCountdown({ pending: true, attempt: 1, nextAt: 10_000, now: Date.now(), delayMs: 0 })).toBeNull();
    // First retry: 3s of the 5s backoff elapsed -> 2s left, 60% through.
    expect(describeReconnectCountdown({ pending: true, attempt: 1, nextAt: 10_000, now: 8000, delayMs: 5000 })).toEqual({ seconds: 2, attempt: 1, percent: 60 });
    // The last instant clamps at zero instead of going negative.
    expect(describeReconnectCountdown({ pending: true, attempt: 2, nextAt: 10_000, now: 12_500, delayMs: 5000 })).toEqual({ seconds: 0, attempt: 2, percent: 100 });
    // A fraction of a second still rounds up to 1 visible second.
    expect(describeReconnectCountdown({ pending: true, attempt: 1, nextAt: 10_000, now: 9200, delayMs: 2000 })).toEqual({ seconds: 1, attempt: 1, percent: 60 });
  });

  it("shows the restored notice only after a reconnect, with cwd context when known", () => {
    // Normal initial connect: no notice at all.
    expect(describeReconnectRestoredNotice({ wasReconnecting: false, path: "/home/demo" })).toBeNull();
    // Reconnect with a known working directory surfaces the cwd variant.
    expect(describeReconnectRestoredNotice({ wasReconnecting: true, path: "/home/demo" })).toEqual({ key: "reconnectRestored.cwd", values: { path: "/home/demo" } });
    // Whitespace-only path falls back to the plain variant.
    expect(describeReconnectRestoredNotice({ wasReconnecting: true, path: "  " })).toEqual({ key: "reconnectRestored.plain", values: {} });
    expect(describeReconnectRestoredNotice({ wasReconnecting: true, path: "" })).toEqual({ key: "reconnectRestored.plain", values: {} });
  });

  it("aggregates batch progress across succeeded and failed items", () => {
    const initial = createBatchProgress(4);
    expect(initial).toEqual({ total: 4, done: 0, failed: 0, current: "" });
    expect(batchProgressPercent(createBatchProgress(0))).toBe(0);

    let state = advanceBatchProgress(initial, { name: "a.log", ok: true });
    state = advanceBatchProgress(state, { name: "b.log", ok: true });
    expect(state).toEqual({ total: 4, done: 2, failed: 0, current: "b.log" });
    expect(batchProgressPercent(state)).toBe(50);

    // A failed item counts as processed so a failed batch still shows how far
    // it got, and the initial state is never mutated.
    state = advanceBatchProgress(state, { name: "broken", ok: false });
    expect(state).toEqual({ total: 4, done: 2, failed: 1, current: "broken" });
    expect(batchProgressPercent(state)).toBe(75);
    expect(initial).toEqual({ total: 4, done: 0, failed: 0, current: "" });

    // The percentage clamps at 100 for out-of-range bookkeeping.
    expect(batchProgressPercent({ total: 2, done: 5, failed: 0, current: "" })).toBe(100);
    expect(batchProgressPercent(advanceBatchProgress(state, { name: "", ok: true }))).toBe(100);
  });

  it("smooths transfer speed and preserves pane order", () => {
    const initial = sampleTransferSpeed(undefined, 0, 0);
    const sampled = sampleTransferSpeed(initial, 2048, 1000);
    expect(sampled.speed).toBe(2048);
    expect(getSshWorkbenchSplitLayout("sftp-left").flexDirection).toBe("row-reverse");
  });

  it("recognizes the retryable boot race but not the permanent inactive-connection failure", () => {
    // The sidecar's stable open failure: credentials were never delivered, so
    // the boot-restore retry ladder must not cycle on it.
    expect(isConnectionInactiveError(new Error("Connection is not active; reopen it from DataWise"))).toBe(true);
    expect(isConnectionInactiveError("connection is not active")).toBe(true);
    // Everything else (activation races, dial failures) keeps the retry path.
    expect(isConnectionInactiveError(new Error("Plugin backend is not running"))).toBe(false);
    expect(isConnectionInactiveError(new Error("Connection refused by host"))).toBe(false);
    expect(isConnectionInactiveError(undefined)).toBe(false);
    expect(isConnectionInactiveError("")).toBe(false);
  });

  it("classifies the dead-session contract that must resync and reconnect", () => {
    // Both sidecar spellings (session() / write_terminal()) mean the session
    // object is gone: replays can never succeed and input is swallowed.
    expect(isSessionGoneError(new Error("SSH session was not found or expired"))).toBe(true);
    expect(isSessionGoneError("SSH session was not found")).toBe(true);
    // Transient failures keep the plain error banner path.
    expect(isSessionGoneError(new Error("SSH input queue is closed"))).toBe(false);
    expect(isSessionGoneError(new Error("Connection refused by host"))).toBe(false);
    expect(isSessionGoneError(undefined)).toBe(false);
    expect(isSessionGoneError("")).toBe(false);
  });

  it("resolves the SFTP pane visibility from the workbench state or the global default", () => {
    expect(resolveSftpPaneOpen({}, true)).toBe(true);
    expect(resolveSftpPaneOpen({}, false)).toBe(false);
    // The persisted per-workbench flag wins over the global default.
    expect(resolveSftpPaneOpen({ sftpPaneOpen: true }, false)).toBe(true);
    expect(resolveSftpPaneOpen({ sftpPaneOpen: false }, true)).toBe(false);
    // Corrupted values fall back to the default instead of coercing.
    expect(resolveSftpPaneOpen({ sftpPaneOpen: "yes" }, true)).toBe(true);
    expect(resolveSftpPaneOpen({ sftpPaneOpen: 0 }, false)).toBe(false);
  });

  it("parses the persisted SFTP default-open preference defensively", () => {
    // Motty-like default is ON: only explicit "false" keeps new workbenches terminal-only.
    expect(sanitizeSftpPaneDefaultOpen(null)).toBe(true);
    expect(sanitizeSftpPaneDefaultOpen("true")).toBe(true);
    expect(sanitizeSftpPaneDefaultOpen("garbage")).toBe(true);
    expect(sanitizeSftpPaneDefaultOpen("false")).toBe(false);
  });

  it("defaults pane order to SFTP on the left", () => {
    expect(resolvePaneOrder(undefined)).toBe("sftp-left");
    expect(resolvePaneOrder("sftp-left")).toBe("sftp-left");
    expect(resolvePaneOrder("terminal-left")).toBe("terminal-left");
    expect(resolvePaneOrder("nope")).toBe("sftp-left");
  });

  it("clamps and migrates SFTP dock width from legacy splitRatio", () => {
    expect(clampSftpWidthPx(340)).toBe(340);
    expect(clampSftpWidthPx(100)).toBe(SFTP_WIDTH_MIN_PX);
    expect(clampSftpWidthPx(999)).toBe(SFTP_WIDTH_MAX_PX);
    expect(clampSftpWidthPx("x")).toBe(SFTP_WIDTH_DEFAULT_PX);
    expect(resolveSftpWidthPx({ sftpWidthPx: 360 })).toBe(360);
    // Legacy terminal 58% → SFTP ~42% of 1000px ≈ 420.
    expect(resolveSftpWidthPx({ splitRatio: 58 }, 1000)).toBe(420);
    expect(resolveSftpWidthPx({})).toBe(SFTP_WIDTH_DEFAULT_PX);
    expect(isSftpDrawerLayout(899)).toBe(true);
    expect(isSftpDrawerLayout(900)).toBe(false);
  });
});

describe("workbench localization", () => {
  const locales: WorkbenchLocale[] = ["en", "zh-CN"];
  const requiredKeys = ["connecting", "reconnect", "upload", "uploaded", "downloaded", "newFolder", "delete", "deleteTitle", "deleted", "name", "size", "modified", "permissions", "transfers", "terminalCopy", "terminalPaste", "zmodemUpload", "terminalSearch.open", "terminalPasteConfirm.title", "terminalDanger.title", "terminalZoom.fontSize", "terminalCommand.running", "terminalCommand.finished", "terminalCommand.hint", "sessionStatus.connecting", "sessionStatus.connected", "sessionStatus.reconnecting", "sessionStatus.disconnected", "sessionStatus.error"];

  it("resolves every supported locale and falls back to Simplified Chinese", () => {
    expect(resolveWorkbenchLocale("zh-HK")).toBe("zh-CN");
    expect(resolveWorkbenchLocale("en-US")).toBe("en");
    expect(resolveWorkbenchLocale("fr-FR")).toBe("zh-CN");
    for (const locale of locales) {
      for (const key of requiredKeys) expect(workbenchMessage(locale, key)).not.toBe(key);
    }
  });

  it("translates the batch-3 sftp panel keys for every locale", () => {
    const sftpKeys = [
      "sftpSearch.placeholder",
      "sftpSearch.footerMatch",
      "sftpFilter.all",
      "sftpBatch.delete",
      "sftpNewFile.action",
      "sftpAttrs.action",
      "sftpAttrs.kind.directory",
      "sftpPathHistory.title",
      "sftpQuickPath.title",
      "sftpCopy.copy",
      "sftpPaste.action",
      "connectionInactive",
      "sftpPane.title",
      "sftpPane.open",
      "sftpPane.close",
      "sftpPane.defaultOpen",
      "sftpPane.defaultOpenHint",
    ];
    for (const locale of locales) {
      for (const key of sftpKeys) expect(workbenchMessage(locale, key)).not.toBe(key);
    }
    // 中文块必须是真实翻译而不是英文回退。
    expect(workbenchMessage("zh-CN", "sftpNewFile.action")).not.toBe(workbenchMessage("en", "sftpNewFile.action"));
    expect(workbenchMessage("zh-CN", "sftpBatch.delete")).not.toBe(workbenchMessage("en", "sftpBatch.delete"));
  });

  it("keeps every message key present in en and zh-CN", () => {
    const enTable = workbenchMessageTable("en");
    const enKeys = Object.keys(enTable);
    expect(enKeys.length).toBeGreaterThan(200);
    for (const locale of locales.filter((candidate) => candidate !== "en")) {
      const table = workbenchMessageTable(locale);
      const missing = enKeys.filter((key) => !(key in table));
      const extra = Object.keys(table).filter((key) => !(key in enTable));
      expect(missing, `${locale} is missing keys: ${missing.join(", ")}`).toEqual([]);
      expect(extra, `${locale} has extra keys: ${extra.join(", ")}`).toEqual([]);
      for (const [key, value] of Object.entries(table)) {
        expect(value.length, `${locale}.${key} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it("keeps template placeholders aligned with the English source", () => {
    const enTable = workbenchMessageTable("en");
    for (const locale of locales.filter((candidate) => candidate !== "en")) {
      const table = workbenchMessageTable(locale);
      for (const [key, template] of Object.entries(table)) {
        const expected = [...enTable[key].matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
        const actual = [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
        expect(actual, `${locale}.${key} placeholders drift from en`).toEqual(expected);
      }
    }
  });
});

describe("sftp panel search, type filter, and multi-select", () => {
  const entries = [
    { name: "alpha.txt", kind: "file" as const },
    { name: "Beta", kind: "directory" as const },
    { name: "gamma.log", kind: "file" as const },
  ];

  it("filters the current listing by search text and entry type", () => {
    expect(filterSftpEntries(entries, "  ALP ", "all")).toEqual([entries[0]]);
    expect(filterSftpEntries(entries, "", "directory").map((entry) => entry.name)).toEqual(["Beta"]);
    expect(filterSftpEntries(entries, "", "file").map((entry) => entry.name)).toEqual(["alpha.txt", "gamma.log"]);
    expect(filterSftpEntries(entries, "missing", "all")).toEqual([]);
  });

  it("expands shift-click selection between anchor and target rows", () => {
    const order = ["a", "b", "c", "d"];
    expect(expandSelection(["a"], "a", "c", order)).toEqual(["a", "b", "c"]);
    expect(expandSelection(["d"], "d", "b", order).sort()).toEqual(["b", "c", "d"]);
    expect(expandSelection(["a"], "x", "c", order)).toEqual(["a"]);
  });
});

describe("dangerous command inspection", () => {
  it("flags destructive commands with their pattern hits", () => {
    const dangerous: Array<[string, string]> = [
      ["rm -rf /", "rm-rf"],
      ["sudo rm --recursive --force /srv/data", "rm-rf"],
      ["dd if=/dev/zero of=/dev/nvme0n1", "dd-of-device"],
      ["mkfs.ext4 /dev/sda1", "mkfs"],
      ["shutdown -h now", "shutdown"],
      [":(){ :|:& };:", "fork-bomb"],
      ["chmod -R 777 /", "chmod-777-recur"],
      ["curl -fsSL https://example.com/install.sh | sudo bash", "curl-pipe-shell"],
      ["iptables -F", "iptables-flush"],
      ["history -c", "history-clear"],
      ["crontab -r", "crontab-remove"],
      ["echo 'DROP TABLE users;' | mysql", "destructive-sql"],
      ["kill -9 -1", "kill-init"],
    ];
    for (const [command, id] of dangerous) {
      const inspection = inspect(command);
      expect(inspection.level).toBe("danger");
      expect(inspection.hits.map((hit) => hit.id)).toContain(id);
    }
  });

  it("ignores harmless commands and empty input", () => {
    for (const command of ["", "   ", "ls -la", "rm temp.tmp", "chmod 644 file.txt", "kill -9 12345", "systemctl status nginx", "curl https://example.com | less", "grep -r foo /var/log"]) {
      const inspection = inspect(command);
      expect(inspection.level).toBe("none");
      expect(inspection.hits).toEqual([]);
    }
  });

  it("keeps the pattern registry aligned with the expected ids", () => {
    expect(DANGEROUS_COMMAND_PATTERNS.map((pattern) => pattern.id)).toEqual([
      "rm-rf",
      "rm-slash",
      "dd-of-device",
      "mkfs",
      "shutdown",
      "fork-bomb",
      "chmod-777-recur",
      "chown-root-recur",
      "curl-pipe-shell",
      "iptables-flush",
      "history-clear",
      "crontab-remove",
      "destructive-sql",
      "kill-init",
    ]);
  });
});

describe("batch-3 extracted helpers", () => {
  it("builds paste confirmations for multiline, large, and dangerous input only", () => {
    const plain = buildPasteConfirmation("ls -la");
    expect(plain.required).toBe(false);
    expect(plain.danger).toBe(false);
    expect(plain.hits).toEqual([]);

    const multiline = buildPasteConfirmation("echo one\necho two\recho three\r\nexit");
    expect(multiline.required).toBe(true);
    expect(multiline.danger).toBe(false);
    expect(multiline.lines).toBe(4);

    expect(buildPasteConfirmation("a".repeat(199)).required).toBe(false);
    const large = buildPasteConfirmation("b".repeat(200));
    expect(large.required).toBe(true);
    expect(large.chars).toBe(200);

    const dangerous = buildPasteConfirmation("rm -rf /tmp/scratch");
    expect(dangerous.required).toBe(true);
    expect(dangerous.danger).toBe(true);
    expect(dangerous.hits.map((hit) => hit.id)).toContain("rm-rf");
  });

  it("truncates the paste preview at 400 characters with an ellipsis", () => {
    const exact = buildPasteConfirmation("x".repeat(400));
    expect(exact.preview).toBe("x".repeat(400));
    const overflow = buildPasteConfirmation(`y${"z".repeat(400)}`);
    expect(overflow.preview).toBe(`y${"z".repeat(399)}…`);
    expect(overflow.preview.length).toBe(401);
  });

  it("clamps terminal font zoom between 8 and 32", () => {
    expect(clampFontSize(13, 1)).toBe(14);
    expect(clampFontSize(13, -3)).toBe(10);
    expect(clampFontSize(8, -5)).toBe(8);
    expect(clampFontSize(32, 5)).toBe(32);
    expect(clampFontSize(13, 100)).toBe(32);
    expect(clampFontSize(13, 0)).toBe(13);
  });

  it("keeps per-connection path histories deduplicated, newest first, and bounded", () => {
    expect(pushPathHistory({}, "c1", "/var/log")).toEqual({ c1: ["/var/log"] });

    const histories = { c1: ["/a", "/b", "/c"] };
    expect(pushPathHistory(histories, "c1", "/b")).toEqual({ c1: ["/b", "/a", "/c"] });

    const rotated = { c1: ["/1", "/2", "/3", "/4", "/5", "/6", "/7", "/8", "/9", "/10"] };
    expect(pushPathHistory(rotated, "c1", "/11")["c1"]).toHaveLength(10);
    expect(pushPathHistory(rotated, "c1", "/11")["c1"][0]).toBe("/11");

    expect(pushPathHistory(histories, "", "/x")).toEqual(histories);
    expect(pushPathHistory(histories, "c1", "")).toEqual(histories);
    expect(pushPathHistory({ c1: ["/a"] }, "c2", "/y", 2)).toEqual({ c1: ["/a"], c2: ["/y"] });
    expect(pushPathHistory({ c2: ["/y", "/z"] }, "c2", "/w", 2)).toEqual({ c2: ["/w", "/y"] });
  });

  it("sanitizes corrupted persisted path histories instead of trusting them", () => {
    // Well-formed input survives unchanged.
    expect(sanitizePathHistories({ c1: ["/a", "/b"] })).toEqual({ c1: ["/a", "/b"] });
    // Non-objects (arrays, primitives, null, garbage JSON) collapse to {}.
    expect(sanitizePathHistories(["/a"])).toEqual({});
    expect(sanitizePathHistories("junk")).toEqual({});
    expect(sanitizePathHistories(42)).toEqual({});
    expect(sanitizePathHistories(null)).toEqual({});
    expect(sanitizePathHistories(undefined)).toEqual({});
    // Per-connection values that are not string arrays are dropped; string
    // entries are kept, non-string elements filtered, and length re-capped.
    expect(
      sanitizePathHistories({
        ok: ["/keep", 5, null, "/also-kept"],
        broken: "not-an-array",
        numeric: 7,
        empty: [],
      }),
    ).toEqual({ ok: ["/keep", "/also-kept"] });
    expect(
      sanitizePathHistories({ c1: ["/1", "/2", "/3", "/4", "/5", "/6", "/7", "/8", "/9", "/10", "/11"] }, 10)["c1"],
    ).toHaveLength(10);
  });

  it("formats byte sizes and transfer rates", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KiB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MiB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.00 GiB");
    expect(formatBytes(2 * 1024 ** 4)).toBe("2.00 TiB");

    expect(formatRate(0)).toBe("0 B/s");
    expect(formatRate(-5)).toBe("0 B/s");
    expect(formatRate(Number.NaN)).toBe("0 B/s");
    expect(formatRate(2048.6)).toBe("2.0 KiB/s");
  });
});

describe("OSC 633 command markers (ported from tiny-rdm)", () => {
  const OSC = "\u001b]633;";
  const BEL = "\u0007";
  const ST = "\u001b\\";

  it("handles Cwd frames split across chunks", () => {
    const state = getOsc633ParserState();
    const first = parseOsc633StreamChunk(`before ${OSC}P;Cwd=/project`, state);
    expect(first.clean).toBe("before ");
    expect(first.updates.cwd).toBeUndefined();
    expect(state.carry).toBe(`${OSC}P;Cwd=/project`);

    const second = parseOsc633StreamChunk(`/src${BEL} after`, state);
    expect(second.clean).toBe(" after");
    expect(second.updates.cwd).toBe("/project/src");
    expect(state.carry).toBe("");
  });

  it("keeps unknown OSC 633 payloads in visible output", () => {
    const state = getOsc633ParserState();
    const output = `x${OSC}P;Foo=abc${BEL}y`;
    const result = parseOsc633StreamChunk(output, state);
    expect(result.updates).toEqual({});
    expect(result.clean).toBe(output);
    expect(state.carry).toBe("");
  });

  it("parses both BEL and ST terminators", () => {
    const state = getOsc633ParserState();
    const result = parseOsc633StreamChunk(`a${OSC}P;Cwd=/home${BEL}b${OSC}P;Shell=/bin/zsh${ST}c`, state);
    expect(result.clean).toBe("abc");
    expect(result.updates.cwd).toBe("/home");
    expect(result.updates.shell).toBe("/bin/zsh");
  });

  it("tracks the full command cycle A/E/C/D with exit codes", () => {
    const state = getOsc633ParserState();
    const result = parseOsc633StreamChunk(`${OSC}A${BEL}${OSC}E;git status${BEL}prefix ${OSC}C${BEL}${OSC}D;2${BEL}suffix`, state);
    expect(result.clean).toBe("prefix suffix");
    expect(result.updates.command).toBe("git status");
    expect(result.updates.commandActive).toBe(false);
    expect(result.updates.lastExitCode).toBe(2);
    expect(result.updates.commandPhase).toBe("completed");
    expect(result.updates.shellIntegrationInstalled).toBe(true);
  });

  it("supports split ST terminator bytes", () => {
    const state = getOsc633ParserState();
    const first = parseOsc633StreamChunk(`${OSC}D;9\u001b`, state);
    expect(first.updates.commandActive).toBeUndefined();
    expect(first.updates.lastExitCode).toBeUndefined();

    const second = parseOsc633StreamChunk("\\", state);
    expect(second.updates.commandActive).toBe(false);
    expect(second.updates.lastExitCode).toBe(9);
    expect(second.updates.commandPhase).toBe("completed");
    expect(state.carry).toBe("");
  });

  it("does not hold ordinary ANSI escapes in carry", () => {
    const state = getOsc633ParserState();
    const first = parseOsc633StreamChunk("text\u001b[", state);
    expect(first.clean).toBe("text\u001b[");
    expect(first.updates).toEqual({});
    expect(state.carry).toBe("");

    const second = parseOsc633StreamChunk("31mred\u001b]", state);
    expect(second.clean).toBe("31mred");
    expect(state.carry).toBe("\u001b]");
  });

  it("closes an active command on the next prompt when D is missing", () => {
    const state = getOsc633ParserState();
    const result = parseOsc633StreamChunk(`${OSC}E;sleep 1${BEL}${OSC}A${BEL}`, state);
    expect(result.updates.command).toBe("sleep 1");
    expect(result.updates.commandActive).toBe(false);
    expect(result.updates.commandPhase).toBe("prompt");
    expect(result.updates.lastCommandStartAt).toBeGreaterThan(0);
    expect(result.updates.lastCommandEndAt).toBeGreaterThanOrEqual(result.updates.lastCommandStartAt ?? 0);
    expect(result.updates.lastCommandDuration).toBeGreaterThanOrEqual(0);
  });

  it("formats command durations for the marker strip", () => {
    expect(formatCommandDuration(null)).toBe("0ms");
    expect(formatCommandDuration(-3)).toBe("0ms");
    expect(formatCommandDuration(850)).toBe("850ms");
    expect(formatCommandDuration(1200)).toBe("1.2s");
    expect(formatCommandDuration(125_000)).toBe("2m05s");
  });

  it("ticks the running marker duration only while a command is active", () => {
    expect(runningCommandElapsedMs(null, 1000)).toBeNull();
    expect(runningCommandElapsedMs(undefined, 1000)).toBeNull();
    expect(runningCommandElapsedMs(0, 1000)).toBeNull();
    // Clock skew between frames must not render a negative duration.
    expect(runningCommandElapsedMs(2000, 1000)).toBeNull();
    expect(runningCommandElapsedMs(1000, 1000)).toBe(0);
    expect(runningCommandElapsedMs(1000, 1500)).toBe(500);
    expect(runningCommandElapsedMs(1000, 4250)).toBe(3250);
  });

  it("composes the marker hover tooltip from available parts only", () => {
    const labels = { command: "Command", exitCode: "Exit code", duration: "Duration", directory: "Directory" };
    expect(commandMarkerTooltip({ command: "git status", exitCode: 0, durationMs: 1200, cwd: "/repo" }, labels)).toBe(
      "Command: git status\nExit code: 0\nDuration: 1.2s\nDirectory: /repo",
    );
    // A still-running command falls back to the live tick for the duration
    // and omits the exit code line entirely.
    expect(commandMarkerTooltip({ command: "sleep 5", elapsedMs: 850 }, labels)).toBe("Command: sleep 5\nDuration: 850ms");
    // Missing parts are omitted instead of rendering placeholder noise.
    expect(commandMarkerTooltip({}, labels)).toBe("");
    expect(commandMarkerTooltip({ command: "  ", exitCode: null, durationMs: null, cwd: "" }, labels)).toBe("");
    // Whitespace-only commands and directories are trimmed away.
    expect(commandMarkerTooltip({ command: " ls -l", exitCode: 3, cwd: " /var/log " }, labels)).toBe(
      "Command: ls -l\nExit code: 3\nDirectory: /var/log",
    );
  });
});

describe("session status semantics (ported from tiny-rdm)", () => {
  it("normalizes disconnected-like and error-like statuses", () => {
    expect(normalizeSshSessionStatus("closed")).toBe("disconnected");
    expect(normalizeSshSessionStatus("disconnected")).toBe("disconnected");
    expect(normalizeSshSessionStatus("stopped")).toBe("disconnected");
    expect(normalizeSshSessionStatus("timeout")).toBe("error");
    expect(normalizeSshSessionStatus("failed")).toBe("error");
    expect(normalizeSshSessionStatus("pending")).toBe("connecting");
    expect(normalizeSshSessionStatus("")).toBe("disconnected");
  });

  it("treats connected, connecting, and idle sessions as usable", () => {
    expect(isUsableSshSession({ status: "connected" })).toBe(true);
    expect(isUsableSshSession({ status: "connecting" })).toBe(true);
    expect(isUsableSshSession({ status: "idle" })).toBe(true);
    expect(isUsableSshSession({ status: "closed" })).toBe(false);
  });

  it("surfaces the workbench reconnecting phase between attach retries", () => {
    expect(describeWorkbenchSessionStatus("connecting")).toBe("connecting");
    expect(describeWorkbenchSessionStatus("connecting", { reattaching: true })).toBe("reconnecting");
    expect(describeWorkbenchSessionStatus("connected")).toBe("connected");
    expect(describeWorkbenchSessionStatus("disconnected")).toBe("disconnected");
    expect(describeWorkbenchSessionStatus("error")).toBe("error");
    // Robust against odd strings coming from host or sidecar events.
    expect(describeWorkbenchSessionStatus("dialing")).toBe("connecting");
    expect(describeWorkbenchSessionStatus("still-alive")).toBe("disconnected");
  });
});

describe("terminal output text sanitization (ported from tiny-rdm)", () => {
  const BEL = "\u0007";

  it("strips title OSC and CSI sequences for plain text", () => {
    expect(stripTerminalControlSequences(`\u001b]0;root@vagrant: ~${BEL}\u001b[Kroot@vagrant:~# `)).toBe("root@vagrant:~# ");
    expect(stripTerminalControlSequences("plain output")).toBe("plain output");
    expect(stripTerminalControlSequences("")).toBe("");
  });

  it("removes the echoed command line and queues unseen commands for later chunks", () => {
    const command = "systemctl status nginx";
    const echoed = `root@host:~# ${command}\r\nreal output\r\n`;
    expect(stripCommandEcho(echoed, command)).toBe("real output\r\n");

    const result = stripHiddenCommandEchoes("visible output\r\n", [command]);
    expect(result.output).toBe("visible output\r\n");
    expect(result.remainingCommands).toEqual([command]);
  });

  it("renders exec output as plain text with trailing control noise removed", () => {
    expect(sanitizeCommandOutput("\u001b[32mOK\u001b[0m\n\u001b]633;D;0\u0007\r\n")).toBe("OK");
    expect(sanitizeCommandOutput(undefined)).toBe("");
    expect(sanitizeCommandOutput("value \u0000")).toBe("value");
  });
});

describe("command history ring buffer (command dialog)", () => {
  it("deduplicates, keeps newest first and clamps to the limit", () => {
    let history = pushCommandHistory([], "ls -la", 3);
    history = pushCommandHistory(history, "df -h", 3);
    // Re-running an older command moves it to the top instead of duplicating.
    history = pushCommandHistory(history, "ls -la", 3);
    expect(history.map((e) => e.command)).toEqual(["ls -la", "df -h"]);
    history = pushCommandHistory(history, "uptime", 3);
    history = pushCommandHistory(history, "free -m", 3);
    expect(history.map((e) => e.command)).toEqual(["free -m", "uptime", "ls -la"]);
    // Blank commands never enter the history.
    expect(pushCommandHistory(history, "   ", 3)).toEqual(history);
    expect(pushCommandHistory(history, "", 3)).toEqual(history);
  });

  it("browses history with ↑↓ and restores the draft past the newest entry", () => {
    const history = [{ command: "tail -f app.log" }, { command: "df -h" }, { command: "ls" }];
    // ↑ from the draft goes to the newest command.
    expect(browseCommandHistory(history, -1, "up", "tail")).toEqual({ index: 0, draft: "tail -f app.log" });
    expect(browseCommandHistory(history, 0, "up", "tail")).toEqual({ index: 1, draft: "df -h" });
    // Clamped at the oldest entry.
    expect(browseCommandHistory(history, 2, "up", "tail")).toEqual({ index: 2, draft: "ls" });
    // ↓ walks back down and eventually restores the backed-up draft.
    expect(browseCommandHistory(history, 2, "down", "tail")).toEqual({ index: 1, draft: "df -h" });
    expect(browseCommandHistory(history, 0, "down", "tail")).toEqual({ index: -1, draft: "tail" });
    expect(browseCommandHistory(history, -1, "down", "tail")).toEqual({ index: -1, draft: "tail" });
    // Empty history is a no-op that keeps the draft.
    expect(browseCommandHistory([], -1, "up", "draft")).toEqual({ index: -1, draft: "draft" });
  });

  it("keeps secret-like, oversized and multiline commands out of persistence", () => {
    expect(isPersistableCommand("systemctl status nginx")).toBe(true);
    expect(isPersistableCommand("echo password=hunter2 > /dev/null")).toBe(false);
    expect(isPersistableCommand("curl -H 'X-API-Key: abc' https://host")).toBe(false);
    expect(isPersistableCommand("export TOKEN=abc123")).toBe(false);
    expect(isPersistableCommand("echo one\ntwo")).toBe(false);
    expect(isPersistableCommand("x".repeat(201))).toBe(false);
    expect(isPersistableCommand("   ")).toBe(false);
  });

  it("sanitizes persisted history read back from localStorage", () => {
    const raw = ["ok cmd", 42, "echo password=x", "ok cmd", "   ", "multi\nline", `x`.repeat(300), "second"];
    expect(sanitizeCommandHistory(raw, 100).map((e) => e.command)).toEqual(["ok cmd", "second"]);
    expect(sanitizeCommandHistory(raw, 1).map((e) => e.command)).toEqual(["ok cmd"]);
    expect(sanitizeCommandHistory(null)).toEqual([]);
    expect(sanitizeCommandHistory("not an array")).toEqual([]);
  });
});

describe("quick commands CRUD (toolbar dropdown)", () => {
  const qc = (id: string, name: string, command: string, connectionId?: string): QuickCommand =>
    connectionId ? { id, name, command, connectionId } : { id, name, command };

  it("normalizes persisted entries: drops invalid, dedupes ids, keeps connectionId", () => {
    const raw = [
      qc("a", "Disk", "df -h"),
      { id: "b", command: "uptime" }, // name falls back to the command
      qc("a", "Dup", "echo dup"), // duplicate id dropped
      { id: "", command: "echo no-id" }, // invalid id dropped
      { id: "c", name: "No command" }, // empty command dropped
      qc("d", "Bound", "kubectl get pods", "conn-1"),
      "not an object",
      ...Array.from({ length: 25 }, (_, i) => qc(`fill-${i}`, `n${i}`, `cmd ${i}`)),
    ];
    const list = normalizeQuickCommands(raw);
    // Soft store ceiling is high; per-scope cap is enforced on save, not normalize.
    expect(list.length).toBeGreaterThan(20);
    expect(list[0]).toEqual({ id: "a", name: "Disk", command: "df -h" });
    expect(list[1]).toEqual({ id: "b", name: "uptime", command: "uptime" });
    expect(list.find((item) => item.id === "d")).toEqual({
      id: "d",
      name: "Bound",
      command: "kubectl get pods",
      connectionId: "conn-1",
    });
    expect(normalizeQuickCommands(null)).toEqual([]);
  });

  it("upserts in place, appends new entries and refuses adds beyond the per-scope limit", () => {
    const list = [qc("a", "A", "cmd a"), qc("b", "B", "cmd b")];
    // Update in place.
    expect(upsertQuickCommand(list, qc("a", "A2", "cmd a2"))).toEqual([qc("a", "A2", "cmd a2"), qc("b", "B", "cmd b")]);
    // Append at the end; name defaults to the command.
    expect(upsertQuickCommand(list, qc("c", "  ", "cmd c"))).toEqual([qc("a", "A", "cmd a"), qc("b", "B", "cmd b"), qc("c", "cmd c", "cmd c")]);
    // Blank command is a no-op.
    expect(upsertQuickCommand(list, qc("d", "D", "   "))).toEqual(list);
    // Full global scope rejects another global entry but still allows a bound one.
    const full = Array.from({ length: QUICK_COMMANDS_LIMIT }, (_, i) => qc(`k${i}`, `n${i}`, `cmd ${i}`));
    expect(upsertQuickCommand(full, qc("new", "New", "cmd new"))).toEqual(full);
    expect(upsertQuickCommand(full, qc("bound", "Bound", "cmd bound", "conn-x"))).toHaveLength(QUICK_COMMANDS_LIMIT + 1);
    // The input list is never mutated.
    expect(list).toEqual([qc("a", "A", "cmd a"), qc("b", "B", "cmd b")]);
  });

  it("removes by id and leaves unknown ids untouched", () => {
    const list = [qc("a", "A", "cmd a"), qc("b", "B", "cmd b")];
    expect(removeQuickCommand(list, "a")).toEqual([qc("b", "B", "cmd b")]);
    expect(removeQuickCommand(list, "missing")).toEqual(list);
  });
});

describe("connection info latency formatting", () => {
  it("formats round-trip latency for the info panel", () => {
    expect(formatLatency(null)).toBe("–");
    expect(formatLatency(undefined)).toBe("–");
    expect(formatLatency(Number.NaN)).toBe("–");
    expect(formatLatency(-5)).toBe("–");
    expect(formatLatency(0.2)).toBe("<1 ms");
    expect(formatLatency(12.4)).toBe("12 ms");
    expect(formatLatency(999)).toBe("999 ms");
    expect(formatLatency(1250)).toBe("1.3 s");
  });
});

describe("connection info auth method label", () => {
  const translate = (method: string) => ({ password: "密码", agent: "SSH 代理" })[method] || method;
  it("localizes known method names from ssh/sessions/list", () => {
    expect(formatAuthMethodLabel("password", translate)).toBe("密码");
    expect(formatAuthMethodLabel("private-key-password", translate)).toBe("private-key-password");
    expect(formatAuthMethodLabel("none", translate)).toBe("none");
  });
  it("shows unknown methods verbatim and missing values as a placeholder", () => {
    expect(formatAuthMethodLabel("external-sso", translate)).toBe("external-sso");
    expect(formatAuthMethodLabel("", translate)).toBe("–");
    expect(formatAuthMethodLabel(null, translate)).toBe("–");
    expect(formatAuthMethodLabel(undefined, translate, "n/a")).toBe("n/a");
  });
});

// ---------------------------------------------------------------------------
// App.vue 弹层接入结构防线（round2）：UI 扫描六轮收敛后新增弹层已三次漏接入
// 收口机制（highlight/agentMode 漏 Esc 链、alertTriage 漏焦点表 + Esc 链）。
// 本组用例从 App.vue 源码反向提取模板中所有 modal/popover 的守卫状态 ref，
// 断言每个 ref 至少被 modalOpenStates（焦点管理）/ onDocumentKeydown（Esc
// 关闭链）/ closeToolbarPopovers（互斥族）之一覆盖，防"新增弹层漏接入"复发。
// ---------------------------------------------------------------------------

// App.vue 的 SFC 块序为 script → template → style（对两种块序都稳健地按块
// 边界切分，而非假定顺序）：模板 = <template> 起点至 <style> 前最后一个
// </template>（嵌套 template 元素的闭合符在行内，不会命中行首最后一个）。
const appStyleIndex = appVueSource.indexOf("<style");
const appTemplate = appVueSource.slice(appVueSource.indexOf("<template>"), appVueSource.lastIndexOf("</template>", appStyleIndex));
const appScript = appVueSource.slice(appVueSource.indexOf("<script"), appVueSource.indexOf("</script>"));
const styleCssSource: string = readFileSync(fileURLToPath(new URL("../style.css", import.meta.url)), "utf8");
const settingsDialogSource: string = readFileSync(fileURLToPath(new URL("../components/SettingsDialog.vue", import.meta.url)), "utf8");
const interactionPrefsSource: string = readFileSync(fileURLToPath(new URL("./interactionPrefs.ts", import.meta.url)), "utf8");
const i18nSource: string = readFileSync(fileURLToPath(new URL("./i18n.ts", import.meta.url)), "utf8");

/** 模板中 class 含 marker 且由 v-if 守卫的元素 → 守卫表达式的状态 ref 基名。
 *  reka Popover 面板（Phase 5）无 v-if：内容 portal、由包裹的 <Popover :open="ref">
 *  受控，向回找最近的 Popover 根提取守卫 ref。Phase 6 的 Dialog 同理：弹窗壳是
 *  <Dialog :open="ref"><DialogContent class="modal …">，marker 命中 DialogContent
 *  的 class，向回找最近的 Dialog 根（open 表达式可带 !! 前缀或 === 比较）。 */
function templateGuardRefs(classMarker: string): string[] {
  const refs = new Set<string>();
  const marker = new RegExp(`class="[^"]*${classMarker}`, "g");
  for (let hit = marker.exec(appTemplate); hit; hit = marker.exec(appTemplate)) {
    const tagStart = appTemplate.lastIndexOf("<", hit.index);
    const guard = appTemplate.slice(tagStart, hit.index).match(/v-if="([A-Za-z_$][\w$]*)/);
    if (guard) {
      refs.add(guard[1]);
      continue;
    }
    // 无 v-if 守卫（portal 受控面板）：取最近的 Popover/Dialog 根（两者索引较大者
    // 才是当前面板的包裹根，取错会把弹窗误归给更早的 popover）。
    let bestStart = -1;
    let bestMatch: RegExpMatchArray | null = null;
    for (const rootTag of ["Popover", "Dialog"]) {
      const rootStart = appTemplate.lastIndexOf(`<${rootTag} :open="`, tagStart);
      if (rootStart <= bestStart) continue;
      const root = appTemplate.slice(rootStart).match(new RegExp(`<${rootTag} :open="!*([A-Za-z_$][\\w$]*)`));
      if (root) {
        bestStart = rootStart;
        bestMatch = root;
      }
    }
    if (bestMatch) refs.add(bestMatch[1]);
  }
  return [...refs];
}

/** 脚本中 startMarker 起到 endMarker 止的代码块内出现过的 `.value` 状态名。 */
function scriptBlockRefs(startMarker: string, endMarker: string): Set<string> {
  const start = appScript.indexOf(startMarker);
  const body = start >= 0 ? appScript.slice(start, appScript.indexOf(endMarker, start)) : "";
  return new Set([...body.matchAll(/([A-Za-z_$][\w$]*)\.value/g)].map((match) => match[1]));
}

describe("App.vue popover/modal wiring structural guard", () => {
  const popoverRefs = templateGuardRefs("popover");
  // Phase 6：弹窗壳为 <Dialog :open="ref"><DialogContent class="modal …>，
  // marker 取 "modal "（尾空格）以排除 replay-modal/-modal 变体类的误命中。
  const modalRefs = templateGuardRefs("modal ");
  // FolderPickerDialog 内部已迁 reka Dialog，App 侧仍是组件标签上的 v-if 守卫。
  const folderPickerGuard = appTemplate.match(/<FolderPickerDialog\s+v-if="([A-Za-z_$][\w$]*)/);
  if (folderPickerGuard) modalRefs.push(folderPickerGuard[1]);
  const focusTableRefs = scriptBlockRefs("const modalOpenStates = computed(() => [", "]);");
  const escChainRefs = scriptBlockRefs("function onDocumentKeydown(event: KeyboardEvent)", "\nfunction ");
  const familyRefs = scriptBlockRefs("function closeToolbarPopovers()", "\nfunction ");
  // 模板中所有受控 Popover 根（兼容多行属性写法），用于反查提取逻辑是否漏项。
  const declaredPopoverRoots = [...appTemplate.matchAll(/<Popover\b[^>]*?:open="!*([A-Za-z_$][\w$]*)"/g)].map((match) => match[1]);

  it("extracts a non-empty template inventory (guards against vacuous regex passes)", () => {
    // 清单按当前真实架构维护：quick-commands / agent-mode / highlight-rules /
    // columns 早已从 App.vue 抽到独立组件或移除，仍硬编码进 App 模板清单会让
    // 守卫长期红灯，反而掩盖真实回归（本轮修复的基线问题）。
    expect(popoverRefs.length, "popover 提取结果为空，regex 可能已失效").toBeGreaterThanOrEqual(5);
    for (const ref of ["connectionInfoOpen", "transferPanelOpen", "bookmarkSaveOpen", "pathHistoryOpen"]) {
      expect(popoverRefs, `popover 提取丢失 ${ref}`).toContain(ref);
    }
    expect(declaredPopoverRoots.length, "受控 Popover 根提取为空").toBeGreaterThanOrEqual(5);
    // settingsDialog 抽出独立组件后，settingsOpen/profilesOpen 的 Dialog 模板
    // 不在 App.vue 里，modal 清单只剩 App 内联弹窗；两个 open ref 仍在
    // modalOpenStates（Esc 链）里覆盖。
    for (const ref of ["alertTriageOpen", "hostKeyPrompt", "folderPickerTarget"]) {
      expect(modalRefs, `modal 提取丢失 ${ref}`).toContain(ref);
    }
  });

  it("wires every modal/popover state ref into at least one close mechanism", () => {
    const covered = (ref: string) => focusTableRefs.has(ref) || escChainRefs.has(ref) || familyRefs.has(ref);
    const missing = [...popoverRefs, ...modalRefs].filter((ref) => !covered(ref));
    expect(missing, `状态 ref 未接入任何收口机制（modalOpenStates / Esc 链 / closeToolbarPopovers）: ${missing.join(", ")}`).toEqual([]);
  });

  it("keeps every controlled Popover root covered by a close mechanism", () => {
    // 泛化防线：不依赖手写清单。新增 <Popover :open="x"> 却忘了接入
    // closeToolbarPopovers / Esc 链 / modalOpenStates 时，这里立即失败。
    // uploadFilesOpen 曾长期漏接，表现为「上传文件列表浮层打开后，点开别的
    // 工具栏面板仍叠在上层、Esc 也收不掉」。
    const covered = (ref: string) => focusTableRefs.has(ref) || escChainRefs.has(ref) || familyRefs.has(ref);
    const missing = [...new Set(declaredPopoverRoots)].filter((ref) => !covered(ref));
    expect(missing, `受控 Popover 未接入任何收口机制: ${missing.join(", ")}`).toEqual([]);
  });

  it("keeps every Dialog modal ref inside modalOpenStates (focus trap table)", () => {
    // modalOpenStates 驱动弹层焦点进入 / Tab 陷阱 / 触发元素归还（R3-P1-2）；
    // alertTriage 曾因不在表内导致打开不聚焦、Esc 关不掉（round1 P1-1）。
    const missing = modalRefs.filter((ref) => !focusTableRefs.has(ref));
    expect(missing, `modal 未进 modalOpenStates（焦点管理失效）: ${missing.join(", ")}`).toEqual([]);
  });

  it("routes every toolbar popover toggle through closeToolbarPopovers", () => {
    // 与模板中真实存在的互斥族 toggle 对齐；已抽离/移除的 quick-menu /
    // agent-mode / highlight / columns 不再列在这里。
    for (const name of ["toggleBookmarkSave", "toggleConnectionInfo", "toggleTransferPanel", "togglePathHistoryMenu"]) {
      const start = appScript.indexOf(`function ${name}(`);
      expect(start, `缺少 toggle 函数 ${name}()`).toBeGreaterThanOrEqual(0);
      const body = appScript.slice(start, appScript.indexOf("\n}", start));
      expect(body, `${name}() 未走 closeToolbarPopovers 统一收口`).toContain("closeToolbarPopovers()");
    }
  });

  it("keeps SFTP virtual-scroll spacers out of the v-else chain (issue #151)", () => {
    const forIdx = appTemplate.indexOf('v-for="entry in windowedEntries"');
    const padTopIdx = appTemplate.indexOf("virtualFileWindow.padTop");
    const padBottomIdx = appTemplate.indexOf("virtualFileWindow.padBottom");
    expect(forIdx, "文件行未使用窗口化切片").toBeGreaterThanOrEqual(0);
    expect(padTopIdx, "缺少上方 spacer").toBeGreaterThanOrEqual(0);
    expect(padTopIdx).toBeLessThan(forIdx);
    expect(padBottomIdx, "缺少下方 spacer").toBeGreaterThan(forIdx);
    // 行列表绝不能带 v-else：它会绑定到紧邻的 padTop spacer，滚动过前几行后
    // 整个行列表不再渲染，大目录表现为「滚动失效、列表展示不全」。
    const rowTag = appTemplate.slice(appTemplate.lastIndexOf("<button", forIdx), forIdx + 60);
    expect(rowTag).not.toContain("v-else");
    // beta.42：加载态改绝对定位浮层，行列表始终渲染，不再被 v-if/v-else
    // 整块替换（否则换目录闪空、滚动位置丢失、虚拟窗口被重置）。
    expect(appTemplate).toContain('v-if="loadingFiles" class="file-loading-overlay"');
    expect(appTemplate).not.toContain('<div v-if="loadingFiles" class="empty"');
    expect(appTemplate.slice(Math.max(0, padTopIdx - 200), padTopIdx)).not.toContain("<template v-else>");
  });

  it("keeps SFTP search debounced and the scroll container wired", () => {
    // 大目录里每个按键触发 O(n) 过滤 + 全量行 diff 会明显掉帧；输入必须绑
    // draft，由 150ms 防抖写入真正的过滤条件。
    expect(appTemplate).toContain('v-model="sftpSearchDraft"');
    expect(appTemplate).not.toContain('v-model="sftpSearch"');
    expect(appTemplate).toContain('@click.prevent="clearSftpSearch()"');
    expect(appTemplate).toContain('ref="fileRowsEl"');
    expect(appTemplate).toContain('@scroll="onFileRowsScroll"');
    expect(appScript).toContain("const windowedEntries = computed(() => visibleEntries.value.slice(virtualFileWindow.value.start, virtualFileWindow.value.end))");
  });

  it("beta.43: 2000 行 DOM 上界 / 历史过滤 / 远端 help 安全门", () => {
    // 模板不得退回全量 visibleEntries 渲染，否则 2000 行滚动夹具的前提不成立。
    expect(appTemplate).not.toContain('v-for="entry in visibleEntries"');
    expect(appTemplate).toContain('v-for="entry in windowedEntries"');
    // 历史 host / 失败过滤条挂在面板头之后、列表之前。
    expect(appTemplate).toContain('class="history-filter-bar"');
    expect(appTemplate).toContain("historyHostOptions");
    expect(appTemplate).toContain("onHistoryHostChange");
    expect(appTemplate).toContain("toggleHistoryFailedOnly");
    // 远端 --help 只由显式按钮触发，不注册按键、不自动发 IPC。
    expect(appTemplate).toContain('class="command-arg-hint command-arg-hint-remote"');
    expect(appTemplate).toContain('@click.stop="loadRemoteHelp"');
    expect(appScript).toContain("helpSpecCommand(command)");
    expect(appScript).toContain("sudo: false");
    expect(appScript).toContain("timeoutSecs: HELP_SPEC_TIMEOUT_SECS");
    // 仲裁器第 9 浮层同时覆盖体检 / 静态 hint / 远端 help（Esc 单一 owner）。
    // beta.48：乘上同一个显示门，隐藏时 Esc 不被看不见的提示条吞掉。
    expect(appScript).toContain("argumentHintVisible: commandHintsAllowed.value");
    expect(appScript).toContain("&& (argHintVisible.value || remoteHelpVisible.value || lintHintVisible.value)");
  });

  it("beta.44: 输入体检槽位 / 历史分组 / help 持久化", () => {
    // 左下角单一提示槽：体检优先，参数提示与远端 help 退为 v-else-if。
    expect(appTemplate).toContain('v-if="lintHintVisible" class="command-lint-hint"');
    expect(appTemplate).toContain('v-else-if="argHintVisible && liveArgumentHint"');
    expect(appTemplate).toContain('v-else-if="remoteHelpVisible"');
    expect(appTemplate).toContain("liveLintIssues");
    expect(appScript).toContain("lintShellLine(liveRiskLine.value");
    // 历史分组头只在 template v-for 内插入，扁平导航索引不变。
    expect(appTemplate).toContain('<template v-for="(item, index) in filteredHistory"');
    expect(appTemplate).toContain('v-if="historyGroupHead(index)" class="history-group-head"');
    expect(appTemplate).toContain('@change="onHistorySortChange"');
    expect(appScript).toContain("sortHistoryView(filtered, historySortMode.value)");
    // help spec 持久化：只存解析结构，remount 恢复，scope 切换保留。
    expect(appScript).toContain("HELP_SPEC_CACHE_KEY");
    expect(appScript).toContain("restoreHelpSpecCache(uiStorage.getItem(HELP_SPEC_CACHE_KEY))");
    expect(appScript).toContain("serializeHelpSpecCache(helpScheduler.snapshot())");
    expect(appScript).toContain("restoreHelpSpecs();");
    expect(appScript).toContain("persistHelpSpecs();");
    expect(appScript).toContain("helpScheduler.seed(helpSpecCacheSeed)");
  });

  it("beta.45/47: 四条提示统一收进悬浮容器，主规则不覆盖输入行", () => {
    expect(appTemplate).toContain('class="command-hint-dock"');
    expect(appTemplate).toContain('ref="commandHintDockEl"');
    expect(appTemplate).toContain(':style="commandHintDockStyle"');
    expect(appTemplate).toContain("'command-hint-open': anyCommandHintVisible");
    expect(appScript).toContain(
      "riskHintVisible.value || lintHintVisible.value || argHintVisible.value || remoteHelpVisible.value",
    );
    expect(styleCssSource).toContain(".command-hint-dock {");
    // 提示条本体绝不能再退回 absolute + bottom:8px 压在 xterm 画布上。
    for (const cls of [".command-risk-hint", ".command-lint-hint", ".command-arg-hint"]) {
      const rule = styleCssSource.split("\n").find((line) => line.startsWith(`${cls} {`));
      expect(rule).toBeTruthy();
      expect(rule).not.toContain("position: absolute");
      expect(rule).not.toContain("bottom: 8px");
    }
    expect(styleCssSource).not.toContain("batch-bar-open .command-arg-hint { bottom: 56px; }");
  });

  it("beta.47: 提示浮层锚定到 xterm 光标行（焦点上方）且不参与布局", () => {
    const start = styleCssSource.indexOf(".command-hint-dock {");
    const end = styleCssSource.indexOf(".command-risk-hint {", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = styleCssSource.slice(start, end);
    // absolute 浮层：不占 flex 高度，出现/消失不改变 terminal-shells 尺寸，
    // ResizeObserver 不触发 FitAddon.fit()，终端行数恒定 → 零页面跳动。
    expect(block).toContain("position: absolute");
    expect(block).not.toContain("flex: 0 0 auto");
    expect(block).not.toContain("margin-bottom");
    expect(block).toContain("pointer-events: none");
    // 静态经验值已删除：位置改由实测光标坐标决定，batch / 字号 / 行数自动吸收。
    expect(styleCssSource).not.toContain("--ssh-hint-lift");
    expect(styleCssSource).not.toContain("--ssh-batch-reserve");
    expect(styleCssSource).toContain(".terminal-pane.command-hint-open .command-hint-dock { max-width: calc(100% - 16px); }");
    expect(styleCssSource).toContain(
      ".command-hint-dock > .command-risk-hint, .command-hint-dock > .command-lint-hint, .command-hint-dock > .command-arg-hint { pointer-events: auto; }",
    );
    // 关键防线：不得再出现 beta.45 那两条改终端尺寸的布局覆盖规则。
    expect(styleCssSource).not.toContain(".terminal-pane.command-hint-open .terminal-shells { margin-bottom: 0; }");
    expect(styleCssSource).not.toContain(".terminal-pane.command-hint-open.batch-bar-open .terminal-host { inset: auto; }");
    // 光标锚定：复用 overlayPlacement 纯函数 + 实测 cell 尺寸；
    // 提示出现（watch）/ 光标移动 / 重绘时刷新，值不变不写 ref。
    expect(appScript).toContain("function updateCommandHintAnchor()");
    expect(appScript).toContain("function scheduleCommandHintAnchor()");
    expect(appScript).toContain("flippedOverlayBottom(cursorTop, paneRect.height)");
    expect(appScript).toContain("overlayLeft(cursorLeft, cellW)");
    expect(appScript).toContain('overlayMaxHeight("above", cursorTop, cellH, paneRect.height)');
    expect(appScript).toContain("readXtermCssCellSize(terminal)");
    expect(appScript).toContain("maxWidth: `calc(100% - ${a.left}px - 8px)`");
    expect(appScript).toContain("watch(anyCommandHintVisible");
    expect(appScript).toContain("if (anyCommandHintVisible.value) scheduleCommandHintAnchor();");
    expect(appScript).toContain("&& anyCommandHintVisible.value) scheduleCommandHintAnchor();");
  });

  it("beta.48: 参数提示有设置开关，且与历史/命令选择浮层相斥", () => {
    // ① 设置项模型：默认开（不回归），显式 false 才关，坏值不误关。
    expect(interactionPrefsSource).toContain("commandHintsEnabled: boolean;");
    expect(interactionPrefsSource).toContain("commandHintsEnabled: true,");
    expect(interactionPrefsSource).toContain("commandHintsEnabled: o.commandHintsEnabled !== false");
    // ② 设置面板：「历史与补全」卡片里有开关，emit 走既有 interactionPrefs 通道。
    expect(settingsDialogSource).toContain('data-settings-anchor="command-hints"');
    expect(settingsDialogSource).toContain(":model-value=\"interactionPrefs.commandHintsEnabled\"");
    expect(settingsDialogSource).toContain("emit('update:interactionPrefs', { commandHintsEnabled: value === true })");
    // 设置搜索能找到这个新开关。
    expect(settingsDialogSource).toContain('labelKey: "interactionPrefs.commandHints"');
    // ③ 中英文案齐全（含「互斥」说明）。
    expect(i18nSource).toContain('"interactionPrefs.commandHints":');
    expect(i18nSource).toContain('"interactionPrefs.commandHintsHint":');
    expect(i18nSource).toContain("Auto-hides while a history or completion picker is open");
    expect(i18nSource).toContain("历史或补全候选框打开时自动隐藏");
    // ④ App.vue 接线：纯函数显示门 + 五个选择浮层喂状态。
    expect(appScript).toContain('from "./lib/commandHintVisibility"');
    expect(appScript).toContain("const commandHintsAllowed = computed(() => commandHintAllowed({");
    expect(appScript).toContain("enabled: interactionPrefs.value.commandHintsEnabled");
    expect(appScript).toContain("suggestionListVisible: commandSuggestListVisible.value");
    expect(appScript).toContain("completionVisible: completionOpen.value");
    expect(appScript).toContain("historyPanelVisible: historyPanelOpen.value");
    expect(appScript).toContain("quickPaletteVisible: quickPaletteOpen.value");
    expect(appScript).toContain("commandPaletteVisible: commandPaletteOpen.value");
    // ⑤ 显示门同时管 dock 渲染与 Esc 仲裁（隐藏时不吞 Esc）。
    expect(appScript).toContain("commandHintsAllowed.value\n  && (riskHintVisible.value");
    expect(appScript).toContain("argumentHintVisible: commandHintsAllowed.value");
    // ⑥ 行为钉死：开关关 / 任一选择浮层开 → 一律不显示，关掉自动回来。
    const idle = {
      enabled: true,
      suggestionListVisible: false,
      completionVisible: false,
      historyPanelVisible: false,
      quickPaletteVisible: false,
      commandPaletteVisible: false,
    };
    expect(commandHintAllowed(idle)).toBe(true);
    expect(commandHintAllowed({ ...idle, enabled: false })).toBe(false);
    expect(commandHintAllowed({ ...idle, suggestionListVisible: true })).toBe(false);
    expect(commandHintAllowed({ ...idle, historyPanelVisible: true })).toBe(false);
    expect(commandHintAllowed({ ...idle, completionVisible: true, quickPaletteVisible: true })).toBe(false);
    expect(commandHintAllowed(idle)).toBe(true);
  });

  it("beta.49: connected 声明早于所有 setup 期间会求值它的位置（杜绝 TDZ）", () => {
    // 根因：watch(anyCommandHintVisible) 在 setup 期间同步求值 computed 链，
    // 链上 riskHintVisible / argHintBaseVisible 会读 connected；若 connected 用
    // const 声明在这些位置之后，运行时抛 `Cannot access 'X' before
    // initialization`，Vue errorHandler 吞掉错误、UI 看似可用但提示全失效。
    const decl = appScript.indexOf("const connected = computed(");
    expect(decl).toBeGreaterThan(-1);
    // 必须紧随 terminalState / session（它的依赖），且早于所有引用点。
    const terminalStateDecl = appScript.indexOf('const terminalState = ref<"connecting"');
    const sessionDecl = appScript.indexOf("const session = ref<SessionInfo>();");
    expect(terminalStateDecl).toBeGreaterThan(-1);
    expect(sessionDecl).toBeGreaterThan(terminalStateDecl);
    expect(decl).toBeGreaterThan(sessionDecl);
    // 所有会在 setup 期间或渲染期读 connected.value 的位置都必须在声明之后。
    // 用完整调用签名做锚点，避免注释里的同名字符串提前命中。
    for (const use of [
      "if (!connected.value || historyPanelOpen.value",
      "if (!assessment || !connected.value) return false;",
      "if (!connected.value) return false;",
      "watch(anyCommandHintVisible, (visible) => {",
    ]) {
      const at = appScript.indexOf(use);
      expect(at).toBeGreaterThan(-1);
      expect(decl).toBeLessThan(at);
    }
    // 只允许一处声明（避免搬移时留旧定义造成重复 const）。
    expect(appScript.split("const connected = computed(").length - 1).toBe(1);
  });

  it("beta.49: prefsReady 声明早于 immediate watch 触发的 reloadSettings（杜绝 TDZ）", () => {
    // 根因：watch(() => props.open, ..., { immediate: true }) 在 setup 期间
    // 立即调用 reloadSettings()，其第一行写 prefsReady.value；声明晚于此会
    // 抛 `Uncaught (in promise) ReferenceError: Cannot access 'X' before
    // initialization`，设置面板状态半初始化。
    const decl = settingsDialogSource.indexOf("const prefsReady = ref(false);");
    expect(decl).toBeGreaterThan(-1);
    const reloadSettings = settingsDialogSource.indexOf("async function reloadSettings()");
    expect(reloadSettings).toBeGreaterThan(-1);
    expect(decl).toBeLessThan(reloadSettings);
    const immediateWatch = settingsDialogSource.indexOf("}, { immediate: true });", reloadSettings);
    expect(immediateWatch).toBeGreaterThan(reloadSettings);
    expect(decl).toBeLessThan(immediateWatch);
    expect(settingsDialogSource.split("const prefsReady = ref(false);").length - 1).toBe(1);
  });

  it("beta.49: 命令提示 computed 链上的状态声明全部早于 watch 求值时点", () => {
    // 通用防线：anyCommandHintVisible 的依赖闭包里若还有别的晚声明 const，
    // setup 期间的 watch 初始化仍会 TDZ。逐个钉死「声明 < watch」。
    const watchAt = appScript.indexOf("watch(anyCommandHintVisible, (visible) => {");
    expect(watchAt).toBeGreaterThan(-1);
    const names = [
      "const interactionPrefs = ref<InteractionPrefs>",
      "const commandSuggestListVisible = computed(",
      "const completionOpen = ref(false);",
      "const historyPanelOpen = ref(false);",
      "const quickPaletteOpen = ref(false);",
      "const commandPaletteOpen = ref(false);",
      "const liveRiskLine = ref(",
      "const liveCommandRisk = ref<",
      "const liveLintIssues = computed<",
      "const argHintBaseVisible = computed(",
      "const riskHintVisible = computed(",
      "const commandHintsAllowed = computed(",
      "const anyCommandHintVisible = computed(",
      "const connected = computed(",
    ];
    for (const name of names) {
      const at = appScript.indexOf(name);
      expect(at, name).toBeGreaterThan(-1);
      expect(at, name).toBeLessThan(watchAt);
    }
  });
});
