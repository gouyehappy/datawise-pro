import { describe, expect, it, vi } from "vitest";
import {
  buildDefaultCardsForIntent,
  isToolAllowed,
  looksDestructiveCommand,
  parseActionCardsFromLlm,
  runToolCard,
  stripActionCardJson,
  toolRisk,
} from "./toolRunner";

describe("tool whitelist", () => {
  it("allows read and confirm tools, blocks multi-exec and profile CRUD", () => {
    expect(isToolAllowed("ssh_metrics")).toBe(true);
    expect(isToolAllowed("sftp_write_file")).toBe(true);
    expect(isToolAllowed("ssh_run_bg")).toBe(true);
    expect(isToolAllowed("ssh_task_status")).toBe(true);
    expect(isToolAllowed("ssh_multi_exec")).toBe(false);
    expect(isToolAllowed("ssh_profile_create")).toBe(false);
  });

  it("marks runInTerminal exec as read risk for template cards", () => {
    expect(toolRisk("ssh_exec", { command: "df -h", runInTerminal: true })).toBe("read");
    expect(toolRisk("ssh_exec", { command: "sudo rm -rf /", runInTerminal: true })).toBe("confirm");
    expect(toolRisk("ssh_exec_sudo", { command: "id" })).toBe("confirm");
    expect(toolRisk("sftp_download", { path: "/a" })).toBe("confirm");
  });
});

describe("buildDefaultCardsForIntent", () => {
  it("covers load / alert / disk-service scenarios with terminal-routed cards", () => {
    const load = buildDefaultCardsForIntent("analyze_load", {});
    expect(load.some((c) => c.tool === "ssh_metrics")).toBe(true);
    expect(load.some((c) => c.args.runInTerminal === true)).toBe(true);
    expect(load.some((c) => c.tool === "ssh_run_bg")).toBe(true);

    const alert = buildDefaultCardsForIntent("alert_triage", {});
    expect(alert.some((c) => c.tool === "ssh_alert_triage")).toBe(true);
    expect(alert.some((c) => c.tool === "ssh_run_bg")).toBe(true);

    const next = buildDefaultCardsForIntent("suggest_next", {});
    expect(next.some((c) => String(c.args.command || "").includes("df"))).toBe(true);
    expect(next.some((c) => String(c.args.command || "").includes("systemctl"))).toBe(true);
  });

  it("adds download card for selected paths", () => {
    const cards = buildDefaultCardsForIntent("explain_selection", {
      selectedPaths: ["/etc/nginx/nginx.conf"],
    });
    expect(cards.some((c) => c.tool === "sftp_download")).toBe(true);
    expect(cards.some((c) => c.tool === "sftp_read_file")).toBe(true);
  });
});

describe("parseActionCardsFromLlm", () => {
  it("filters disallowed tools from fenced JSON", () => {
    const text = `Here are actions:
\`\`\`json
{ "cards": [
  { "id": "1", "title": "Metrics", "tool": "ssh_metrics", "args": {} },
  { "id": "2", "title": "Bad", "tool": "ssh_multi_exec", "args": { "targets": ["a"] } }
] }
\`\`\``;
    const cards = parseActionCardsFromLlm(text);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.tool).toBe("ssh_metrics");
  });

  it("lifts top-level command for ssh_exec cards", () => {
    const text = `\`\`\`json
{ "cards": [ { "id": "cpu", "title": "CPU", "tool": "ssh_exec", "command": "ps aux --sort=-%cpu | head -n 15", "runInTerminal": true, "risk": "read" } ] }
\`\`\``;
    const cards = parseActionCardsFromLlm(text);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.args.command).toContain("ps aux");
    expect(cards[0]?.args.runInTerminal).toBe(true);
  });

  it("drops ssh_exec cards that still have no command after normalize", () => {
    const text = `\`\`\`json
{ "cards": [ { "id": "cpu", "title": "CPU", "tool": "ssh_exec", "args": { "runInTerminal": true }, "risk": "read" } ] }
\`\`\``;
    expect(parseActionCardsFromLlm(text)).toEqual([]);
  });
});


describe("stripActionCardJson", () => {
  it("removes fenced cards JSON and keeps prose", () => {
    const text = `你好，当前会话已连接。\n\n\`\`\`json\n{ "cards": [{ "id": "1", "tool": "ssh_exec", "title": "x", "args": {} }] }\n\`\`\``;
    expect(stripActionCardJson(text)).toBe("你好，当前会话已连接。");
  });

  it("hides incomplete mid-stream fences", () => {
    const text = `Hello\n\n\`\`\`json\n{ "cards": [{ "id": "1"`;
    expect(stripActionCardJson(text)).toBe("Hello");
  });

  it("hides incomplete bare trailing cards object", () => {
    const text = `Prose first\n\n{ "cards": [{ "id": "1", "tool": "ssh_metrics"`;
    expect(stripActionCardJson(text)).toBe("Prose first");
  });
});

describe("looksDestructiveCommand", () => {
  it("flags mutating / privileged patterns", () => {
    expect(looksDestructiveCommand("df -h")).toBe(false);
    expect(looksDestructiveCommand("uptime; free -h")).toBe(false);
    expect(looksDestructiveCommand("sudo systemctl restart nginx")).toBe(true);
    expect(looksDestructiveCommand("rm -rf /var/tmp/x")).toBe(true);
    expect(looksDestructiveCommand("systemctl stop nginx")).toBe(true);
    expect(looksDestructiveCommand("echo hi > /etc/hosts")).toBe(true);
  });
});

describe("runToolCard", () => {
  it("routes runInTerminal exec through sendToTerminal", async () => {
    const sendToTerminal = vi.fn();
    const result = await runToolCard(
      {
        id: "df",
        title: "df",
        tool: "ssh_exec",
        args: { command: "df -h", runInTerminal: true },
        risk: "read",
      },
      {
        sessionId: "sess",
        rpc: vi.fn(),
        sendToTerminal,
        ensureAgentMode: vi.fn(async () => undefined),
      },
    );
    expect(result.ok).toBe(true);
    expect(sendToTerminal).toHaveBeenCalledWith("df -h");
  });

  it("uses downloadPath for sftp_download", async () => {
    const downloadPath = vi.fn(async () => undefined);
    const result = await runToolCard(
      {
        id: "dl",
        title: "Download",
        tool: "sftp_download",
        args: { path: "/tmp/a.log" },
        risk: "confirm",
      },
      { sessionId: "sess", rpc: vi.fn(), downloadPath },
    );
    expect(result.ok).toBe(true);
    expect(downloadPath).toHaveBeenCalledWith("/tmp/a.log");
  });

  it("stages ssh_run_bg via ssh/exec and returns logPath", async () => {
    const rpc = vi.fn(async () => ({
      exitCode: 0,
      output: "PID=4242\nLOG=/tmp/.dw-ssh-tasks/bg-1.log\n",
    }));
    const result = await runToolCard(
      {
        id: "bg",
        title: "bg",
        tool: "ssh_run_bg",
        args: { command: "sleep 1; echo ok" },
        risk: "confirm",
      },
      { sessionId: "sess", rpc, ensureAgentMode: vi.fn(async () => undefined) },
    );
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalled();
    expect((result.raw as { logPath?: string }).logPath).toContain("/tmp/.dw-ssh-tasks/");
  });
});
