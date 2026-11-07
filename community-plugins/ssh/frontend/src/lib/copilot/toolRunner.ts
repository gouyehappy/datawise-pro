import {
  cardCommand,
  looksDestructiveCommand,
  parseActionCardsFromLlm as parseActionCardsFromKit,
  stripActionCardJson,
  type ActionCard,
  type ActionCardRisk,
  type CopilotIntent,
  type SessionContext,
} from "@datawise/community-copilot-kit";

export { stripActionCardJson, looksDestructiveCommand };

const READ_TOOLS = new Set([
  "ssh_session_context",
  "ssh_metrics",
  "ssh_alert_triage",
  "sftp_list_dir",
  "sftp_stat",
  "sftp_pwd",
  "sftp_read_file",
  "sftp_disk_usage",
  "ssh_exec",
  "ssh_task_status",
]);

const CONFIRM_TOOLS = new Set([
  "ssh_exec",
  "ssh_exec_sudo",
  "sftp_write_file",
  "sftp_download",
  "ssh_terminal_input",
  "ssh_run_bg",
]);

const DISABLED_TOOLS = new Set([
  "ssh_multi_exec",
  "known_hosts",
  "ssh_profile_create",
  "ssh_profile_update",
  "ssh_profile_delete",
  "sudo_profile_create",
  "sudo_profile_update",
  "sudo_profile_delete",
]);

export type ToolRunDeps = {
  connectionId?: string;
  sessionId?: string;
  rpc: (method: string, params?: unknown) => Promise<unknown>;
  /** Ensure agent terminal mode is not off before mutating terminal display. */
  ensureAgentMode?: () => Promise<void>;
  /** Send a command line into the interactive PTY (preferred for runInTerminal). */
  sendToTerminal?: (command: string) => void;
  /** Start an SFTP download through the existing UI transfer path. */
  downloadPath?: (path: string) => Promise<void>;
};

export function isToolAllowed(tool: string): boolean {
  const name = tool.trim();
  if (!name || DISABLED_TOOLS.has(name)) return false;
  return READ_TOOLS.has(name) || CONFIRM_TOOLS.has(name);
}

export function toolRisk(tool: string, args?: Record<string, unknown>): ActionCardRisk {
  const name = tool.trim();
  // runInTerminal diagnostics stay read-tier unless the command looks mutating.
  if (name === "ssh_exec" && args?.runInTerminal === true) {
    return looksDestructiveCommand(String(args.command ?? "")) ? "confirm" : "read";
  }
  if (name === "ssh_task_status") return "read";
  if (CONFIRM_TOOLS.has(name) && name !== "ssh_exec") return "confirm";
  if (name === "ssh_exec" || name === "ssh_exec_sudo" || name === "ssh_terminal_input" || name === "ssh_run_bg") {
    return "confirm";
  }
  if (name === "sftp_write_file" || name === "sftp_download") return "confirm";
  return "read";
}

function card(
  id: string,
  title: string,
  tool: string,
  args: Record<string, unknown>,
  description?: string,
): ActionCard {
  return {
    id,
    title,
    tool,
    args,
    risk: toolRisk(tool, args),
    description,
  };
}

/** Template ActionCards the Dock can show without waiting for an LLM. */
export function buildDefaultCardsForIntent(intent: CopilotIntent, ctx: SessionContext): ActionCard[] {
  const selected = (ctx.selectedPaths ?? []).filter(Boolean);
  const firstPath = selected[0] || ctx.sftpPath || "";

  switch (intent) {
    case "analyze_load":
      return [
        card("metrics", "Refresh metrics", "ssh_metrics", {}, "Fetch live CPU / memory / disk / network"),
        card(
          "df",
          "Disk usage (df -h)",
          "ssh_exec",
          { command: "df -h", runInTerminal: true },
          "Run df -h in the terminal",
        ),
        card(
          "top",
          "Top processes",
          "ssh_exec",
          { command: "ps aux --sort=-%cpu | head -n 15", runInTerminal: true },
          "CPU-heavy processes in the visible terminal",
        ),
        card(
          "bg-sar",
          "Background load sample (30s)",
          "ssh_run_bg",
          { command: "sleep 2; uptime; free -h; df -h" },
          "Detach a short load snapshot; poll with ssh_task_status",
        ),
      ];
    case "alert_triage":
      return [
        card("triage", "Run alert triage", "ssh_alert_triage", {}, "Classify payload and list diagnostic commands"),
        card(
          "uptime",
          "Load snapshot",
          "ssh_exec",
          { command: "uptime; free -h; df -h", runInTerminal: true },
          "Quick load / memory / disk snapshot",
        ),
        card(
          "journal",
          "Recent journal errors",
          "ssh_exec",
          { command: "journalctl -p err -n 40 --no-pager", runInTerminal: true },
          "Recent error-level journal lines",
        ),
        card(
          "bg-journal",
          "Background journal capture",
          "ssh_run_bg",
          { command: "journalctl -p err -n 80 --no-pager" },
          "Capture errors detached; poll logPath afterward",
        ),
      ];
    case "explain_selection":
      if (!firstPath) {
        return [card("ctx", "Session context", "ssh_session_context", {}, "No path selected — show session context")];
      }
      return [
        card("stat", "Stat selected path", "sftp_stat", { path: firstPath }, firstPath),
        card("read", "Read selected file", "sftp_read_file", { path: firstPath, maxBytes: 64 * 1024 }, firstPath),
        card("download", "Download selected", "sftp_download", { path: firstPath }, firstPath),
      ];
    case "suggest_next":
      return [
        card("ctx", "Session context", "ssh_session_context", {}, "Publish/get live cwd · SFTP · selection"),
        card(
          "disk",
          "Disk & inode pressure",
          "ssh_exec",
          { command: "df -h; df -i", runInTerminal: true },
          "Disk and inode usage",
        ),
        card(
          "svc",
          "Failed systemd units",
          "ssh_exec",
          { command: "systemctl --failed --no-pager", runInTerminal: true },
          "List failed services",
        ),
      ];
    case "explain_output":
      return [
        card(
          "ctx",
          "Session context",
          "ssh_session_context",
          {},
          "Use selection text from the dock prompt",
        ),
        card(
          "svc-status",
          "Service status sample",
          "ssh_exec",
          { command: "systemctl status --no-pager -l | head -n 40", runInTerminal: true },
          "Sample service status for follow-up",
        ),
      ];
    case "custom":
    default:
      return [];
  }
}

/** Extract action cards using the SSH tool allowlist / risk policy. */
export function parseActionCardsFromLlm(text: string): ActionCard[] {
  return parseActionCardsFromKit(text, { isToolAllowed, toolRisk });
}

export async function runToolCard(
  card: ActionCard,
  deps: ToolRunDeps,
): Promise<{ ok: boolean; summary: string; raw?: unknown }> {
  if (!isToolAllowed(card.tool)) {
    return { ok: false, summary: `Tool not allowed: ${card.tool}` };
  }
  const sessionId = deps.sessionId;
  if (!sessionId && card.tool !== "ssh_session_context") {
    return { ok: false, summary: "No active session" };
  }

  try {
    switch (card.tool) {
      case "ssh_session_context": {
        const raw = await deps.rpc("ssh/session/context/get", { sessionId });
        return { ok: true, summary: JSON.stringify(raw, null, 2).slice(0, 4000), raw };
      }
      case "ssh_metrics": {
        const raw = await deps.rpc("ssh/metrics", { sessionId },);
        return { ok: true, summary: summarizeMetrics(raw), raw };
      }
      case "ssh_alert_triage": {
        const payload =
          typeof card.args.payload === "string"
            ? card.args.payload
            : typeof card.args.text === "string"
              ? card.args.text
              : "";
        if (!payload.trim()) return { ok: false, summary: "alert triage needs a payload" };
        const raw = await deps.rpc("ssh/alert/triage", { payload });
        return { ok: true, summary: JSON.stringify(raw, null, 2).slice(0, 4000), raw };
      }
      case "sftp_list_dir": {
        const path = String(card.args.path ?? "/");
        const raw = await deps.rpc("sftp/list", { sessionId, path });
        return { ok: true, summary: JSON.stringify(raw, null, 2).slice(0, 4000), raw };
      }
      case "sftp_stat": {
        const path = String(card.args.path ?? "");
        if (!path) return { ok: false, summary: "path required" };
        const raw = await deps.rpc("sftp/stat", { sessionId, path });
        return { ok: true, summary: JSON.stringify(raw, null, 2).slice(0, 2000), raw };
      }
      case "sftp_pwd": {
        const raw = await deps.rpc("ssh/session/context/get", { sessionId });
        const path =
          raw && typeof raw === "object" && typeof (raw as { sftpPath?: unknown }).sftpPath === "string"
            ? (raw as { sftpPath: string }).sftpPath
            : "";
        return { ok: true, summary: path || "(unknown)", raw };
      }
      case "sftp_read_file": {
        const path = String(card.args.path ?? "");
        if (!path) return { ok: false, summary: "path required" };
        const maxBytes = Math.min(
          Math.max(Number(card.args.maxBytes) || 64 * 1024, 256),
          256 * 1024,
        );
        const raw = (await deps.rpc("sftp/read", {
          sessionId,
          path,
          offset: 0,
          length: maxBytes,
        })) as { dataBase64?: string; truncated?: boolean };
        const text = decodeBase64Preview(raw?.dataBase64 ?? "");
        const note = raw?.truncated ? "\n…(truncated)" : "";
        return { ok: true, summary: text.slice(0, 6000) + note, raw };
      }
      case "sftp_disk_usage": {
        const path = String(card.args.path ?? "/");
        const raw = await deps.rpc("sftp/diskUsage", { sessionId, path });
        return { ok: true, summary: JSON.stringify(raw, null, 2).slice(0, 2000), raw };
      }
      case "ssh_exec": {
        const command = cardCommand(card.args);
        if (!command) return { ok: false, summary: "command required (missing args.command)" };
        if (card.args.runInTerminal === true && deps.sendToTerminal) {
          await deps.ensureAgentMode?.();
          deps.sendToTerminal(command);
          return { ok: true, summary: `Sent to terminal: ${command}` };
        }
        if (card.risk === "confirm") await deps.ensureAgentMode?.();
        const raw = await deps.rpc("ssh/exec", {
          sessionId,
          command,
          timeoutSecs: Number(card.args.timeoutSecs) || 30,
        });
        const output =
          raw && typeof raw === "object" && typeof (raw as { output?: unknown }).output === "string"
            ? (raw as { output: string }).output
            : JSON.stringify(raw);
        return { ok: true, summary: output.slice(0, 6000), raw };
      }
      case "ssh_exec_sudo": {
        const command = cardCommand(card.args);
        if (!command) return { ok: false, summary: "command required (missing args.command)" };
        await deps.ensureAgentMode?.();
        if (deps.sendToTerminal) {
          deps.sendToTerminal(`sudo ${command}`);
          return { ok: true, summary: `Sent to terminal: sudo ${command}` };
        }
        return { ok: false, summary: "terminal channel unavailable for sudo exec" };
      }
      case "ssh_terminal_input": {
        const text = cardCommand(card.args);
        if (!text) return { ok: false, summary: "text required" };
        await deps.ensureAgentMode?.();
        if (!deps.sendToTerminal) return { ok: false, summary: "terminal channel unavailable" };
        deps.sendToTerminal(text.endsWith("\n") || text.endsWith("\r") ? text.replace(/\n$/, "").replace(/\r$/, "") : text);
        return { ok: true, summary: "Sent input to terminal" };
      }
      case "ssh_run_bg": {
        const command = cardCommand(card.args);
        if (!command) return { ok: false, summary: "command required (missing args.command)" };
        await deps.ensureAgentMode?.();
        const stamp = Date.now();
        const taskId = `bg-${stamp}`;
        const escaped = command.replace(/'/g, `'\\''`);
        const remote = [
          `d=/tmp/.dw-ssh-tasks; mkdir -p "$d" || exit 3; f="$d/${taskId}.log"; : > "$f";`,
          `nohup sh -c '${escaped}; s=$?; echo EXIT_$s' >> "$f" 2>&1 & p=$!;`,
          `echo "$p" > "$f.pid"; echo "PID=$p"; echo "LOG=$f"`,
        ].join(" ");
        const raw = (await deps.rpc("ssh/exec", {
          sessionId,
          command: remote,
          timeoutSecs: 20,
        })) as { output?: string; exitCode?: number };
        const output = typeof raw?.output === "string" ? raw.output : "";
        if (raw?.exitCode != null && raw.exitCode !== 0) {
          return { ok: false, summary: `Failed to stage background task: ${output.slice(0, 800)}`, raw };
        }
        const pid = /PID=(\d+)/.exec(output)?.[1] ?? "";
        const logPath = /LOG=(\S+)/.exec(output)?.[1] ?? `/tmp/.dw-ssh-tasks/${taskId}.log`;
        const summary = [
          `Background task staged.`,
          `taskId=${taskId}`,
          pid ? `pid=${pid}` : "",
          `logPath=${logPath}`,
          `Poll with ssh_task_status.`,
        ]
          .filter(Boolean)
          .join("\n");
        return {
          ok: true,
          summary,
          raw: { taskId, pid, logPath, pollWith: "ssh_task_status", output },
        };
      }
      case "ssh_task_status": {
        const logPath = String(card.args.logPath ?? "").trim();
        if (!logPath) return { ok: false, summary: "logPath required" };
        const tailBytes = Math.min(Math.max(Number(card.args.tailBytes) || 4000, 200), 16000);
        const quoted = shellQuote(logPath);
        const remote = [
          `f=${quoted}; if [ ! -f "$f" ]; then echo STATE=MISSING; exit 0; fi;`,
          `if grep -q '^EXIT_[0-9][0-9]*$' "$f" 2>/dev/null; then`,
          `  echo STATE=DONE; echo CODE=$(grep -o '^EXIT_[0-9][0-9]*$' "$f" | tail -1);`,
          `else echo STATE=RUNNING; fi;`,
          `pf="$f.pid"; if [ -f "$pf" ]; then p=$(cat "$pf");`,
          `  kill -0 "$p" 2>/dev/null && echo PID_ALIVE=yes || echo PID_ALIVE=no; fi;`,
          `echo ===TAIL===; tail -c ${tailBytes} "$f"`,
        ].join(" ");
        const raw = (await deps.rpc("ssh/exec", {
          sessionId,
          command: remote,
          timeoutSecs: 20,
        })) as { output?: string };
        const output = typeof raw?.output === "string" ? raw.output : "";
        return { ok: true, summary: output.slice(0, 6000) || "(empty)", raw };
      }
      case "sftp_download": {
        const path = String(card.args.path ?? "").trim();
        if (!path) return { ok: false, summary: "path required" };
        if (!deps.downloadPath) {
          return { ok: false, summary: "download UI path unavailable" };
        }
        await deps.downloadPath(path);
        return { ok: true, summary: `Download started: ${path}` };
      }
      case "sftp_write_file": {
        const path = String(card.args.path ?? "").trim();
        const content = String(card.args.content ?? card.args.text ?? "");
        if (!path) return { ok: false, summary: "path required" };
        await deps.ensureAgentMode?.();
        const raw = await deps.rpc("sftp/write", {
          sessionId,
          remotePath: path,
          dataBase64: btoa(unescape(encodeURIComponent(content))),
        });
        return { ok: true, summary: `Wrote ${path}`, raw };
      }
      default:
        return { ok: false, summary: `Unhandled tool: ${card.tool}` };
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, summary: message };
  }
}

function summarizeMetrics(raw: unknown): string {
  if (!raw || typeof raw !== "object") return String(raw);
  const m = raw as {
    cpu?: { percent?: number; load1?: number };
    memory?: { usedBytes?: number; totalBytes?: number };
    disks?: Array<{ mount: string; percentUsed: number }>;
  };
  const cpu = m.cpu?.percent != null ? `CPU ${Math.round(m.cpu.percent)}%` : "";
  const load = m.cpu?.load1 != null ? `load1 ${m.cpu.load1}` : "";
  let mem = "";
  if (m.memory?.totalBytes && m.memory.totalBytes > 0) {
    mem = `MEM ${Math.round(((m.memory.usedBytes ?? 0) / m.memory.totalBytes) * 100)}%`;
  }
  const disk = m.disks?.[0] ? `DISK ${Math.round(m.disks[0].percentUsed)}% @ ${m.disks[0].mount}` : "";
  return [cpu, load, mem, disk].filter(Boolean).join(" · ") || JSON.stringify(raw).slice(0, 2000);
}

function decodeBase64Preview(dataBase64: string): string {
  if (!dataBase64) return "";
  try {
    const binary = atob(dataBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "(binary)";
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
