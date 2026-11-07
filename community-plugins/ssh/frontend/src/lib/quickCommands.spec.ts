import { describe, expect, it } from "vitest";
import {
  canAddQuickCommandInScope,
  countQuickCommandsInScope,
  filterQuickCommands,
  groupQuickCommands,
  groupQuickCommandsByConnection,
  normalizeQuickCommands,
  otherScopedQuickCommands,
  quickCommandGroupCount,
  quickCommandText,
  shortenConnectionId,
  upsertQuickCommand,
  visibleQuickCommands,
  type QuickCommand,
} from "./quickCommands";

const LIST: QuickCommand[] = [
  { id: "1", name: "日志", command: "tail -f /var/log/nginx.log" },
  { id: "2", name: "Docker PS", command: "docker ps --format wide" },
  { id: "3", name: "端口", command: "netstat -tlnp | grep :8888" },
];

describe("filterQuickCommands", () => {
  it("returns everything for an empty/blank query", () => {
    expect(filterQuickCommands(LIST, "")).toHaveLength(3);
    expect(filterQuickCommands(LIST, "   ")).toHaveLength(3);
  });

  it("matches name, command, and group case-insensitively", () => {
    expect(filterQuickCommands(LIST, "docker")).toHaveLength(1);
    expect(filterQuickCommands(LIST, "日志")[0]?.id).toBe("1");
    expect(filterQuickCommands(LIST, "8888")[0]?.id).toBe("3");
    const withGroup: QuickCommand[] = [
      ...LIST,
      { id: "4", name: "uptime", command: "uptime", group: "Ops" },
    ];
    expect(filterQuickCommands(withGroup, "ops")[0]?.id).toBe("4");
  });

  it("groups by label with ungrouped first", () => {
    const list: QuickCommand[] = [
      { id: "1", name: "a", command: "echo a", group: "Ops" },
      { id: "2", name: "b", command: "echo b" },
      { id: "3", name: "c", command: "echo c", group: "Ops" },
      { id: "4", name: "d", command: "echo d", group: "DB" },
    ];
    expect(groupQuickCommands(list).map((g) => [g.id, g.commands.map((c) => c.id)])).toEqual([
      ["", ["2"]],
      ["Ops", ["1", "3"]],
      ["DB", ["4"]],
    ]);
    expect(quickCommandGroupCount(list)).toBe(2);
  });

  it("returns [] when nothing matches", () => {
    expect(filterQuickCommands(LIST, "no-such-thing")).toEqual([]);
  });

  it("tolerates an empty list", () => {
    expect(filterQuickCommands([], "x")).toEqual([]);
  });
});

describe("quickCommandText", () => {
  it("preserves multi-line commands as PTY Enter keystrokes and trims", () => {
    expect(quickCommandText("docker ps\n")).toBe("docker ps");
    expect(quickCommandText("systemctl status nginx\r\n")).toBe("systemctl status nginx");
    expect(quickCommandText("  echo a\necho b  ")).toBe("echo a\recho b");
    expect(quickCommandText("echo a\r\necho b\recho c")).toBe("echo a\recho b\recho c");
    expect(quickCommandText(["echo \\", "--flag value"].join("\n"))).toBe("echo \\\r--flag value");
  });
  it("returns empty string for blank input", () => {
    expect(quickCommandText(" \n ")).toBe("");
  });
});

describe("connection-scoped quick commands", () => {
  const mixed: QuickCommand[] = [
    { id: "g1", name: "global", command: "df -h" },
    { id: "a1", name: "pods", command: "kubectl get pods", connectionId: "conn-a" },
    { id: "b1", name: "uptime", command: "uptime", connectionId: "conn-b" },
    { id: "g2", name: "free", command: "free -m" },
  ];

  it("normalizes connectionId and treats missing/invalid as global", () => {
    const list = normalizeQuickCommands([
      { id: "1", name: "a", command: "echo a", connectionId: "  c1  " },
      { id: "2", name: "b", command: "echo b" },
      { id: "3", name: "c", command: "echo c", connectionId: "" },
      { id: "4", name: "d", command: "echo d", connectionId: "x".repeat(81) },
    ]);
    expect(list).toEqual([
      { id: "1", name: "a", command: "echo a", connectionId: "c1" },
      { id: "2", name: "b", command: "echo b" },
      { id: "3", name: "c", command: "echo c" },
      // Oversized connectionId is stripped; entry stays as global.
      { id: "4", name: "d", command: "echo d" },
    ]);
  });

  it("shows global + current connection, connection-scoped first", () => {
    expect(visibleQuickCommands(mixed, "conn-a").map((item) => item.id)).toEqual(["a1", "g1", "g2"]);
    expect(visibleQuickCommands(mixed, "conn-b").map((item) => item.id)).toEqual(["b1", "g1", "g2"]);
    expect(visibleQuickCommands(mixed, "").map((item) => item.id)).toEqual(["g1", "g2"]);
  });

  it("counts and caps per scope", () => {
    expect(countQuickCommandsInScope(mixed, null)).toBe(2);
    expect(countQuickCommandsInScope(mixed, "conn-a")).toBe(1);
    expect(canAddQuickCommandInScope(mixed, "conn-a", 1)).toBe(false);
    expect(canAddQuickCommandInScope(mixed, "conn-a", 2)).toBe(true);

    const capped = Array.from({ length: 2 }, (_, i) => ({
      id: `g${i}`,
      name: `g${i}`,
      command: `echo ${i}`,
    }));
    expect(upsertQuickCommand(capped, { id: "new", name: "n", command: "echo n" }, 2)).toEqual(capped);
    expect(
      upsertQuickCommand(capped, { id: "bound", name: "b", command: "echo b", connectionId: "c1" }, 2),
    ).toHaveLength(3);
  });

  it("groups other-scoped commands for orphan management", () => {
    expect(otherScopedQuickCommands(mixed, "conn-a").map((item) => item.id)).toEqual(["b1"]);
    expect(groupQuickCommandsByConnection(mixed)).toEqual([
      { connectionId: "conn-a", commands: [mixed[1]] },
      { connectionId: "conn-b", commands: [mixed[2]] },
    ]);
    expect(shortenConnectionId("short")).toBe("short");
    expect(shortenConnectionId("abcdefghijklmnop", 8)).toBe("abcdefg…");
  });
});
