/**
 * 输入时的命令风险分级（对标 Motty `internal/ai/risk/risk.go` 的 `Classify` / `Policy.Decide`）。
 *
 * 纯函数、静态、有界：逐字键入时对当前输入行做一次分级，用于**非阻断式**提示，
 * 不拦截任何按键、不改变发送内容、不解析 shell。
 * 红线（同 Motty risk.go）：**这不是安全边界**。真正的执行前审批 / 只读硬门在
 * `dangerousCommands.ts`（粘贴）与后端 `mcp_safety.rs`（MCP / AI）里。
 */

import { inspect, type DangerousCommandHit } from "./dangerousCommands";

export type CommandRiskLevel = "low" | "medium" | "high" | "critical";

export interface CommandRiskAssessment {
  level: CommandRiskLevel;
  /** 有界、去重，最多 MAX_REASONS 条 */
  reasons: string[];
  /** 命中的规则 id，供 UI 展示与单测断言 */
  hits: string[];
  /** 更低风险的替代建议（仅 high / critical 提供） */
  safer?: string;
}

export interface RiskPolicy {
  /** 达到该级别起给出提示 */
  warnFrom: CommandRiskLevel;
  /** 达到该级别起拒绝（可选，当前前端只提示不拦截） */
  blockFrom?: CommandRiskLevel;
  enabled?: boolean;
}

export const DEFAULT_RISK_POLICY: RiskPolicy = { warnFrom: "high", enabled: true };

export const COMMAND_RISK_MAX_INPUT = 8 * 1024;
const MAX_WRAPPER_DEPTH = 10;
const MAX_REASONS = 6;

const LEVEL_ORDER: Record<CommandRiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

interface RiskRule {
  id: string;
  level: CommandRiskLevel;
  reason: string;
  re: RegExp;
  safer?: string;
}

/** 行首 wrapper 前缀（sudo / env / timeout / watch / xargs …），剥离后仍能看到真实命令。 */
const WRAPPERS: RegExp[] = [
  /^sudo\s+(?:-[A-Za-z]\s+\S+\s+|--[a-z-]+(?:=\S+)?\s+|-[A-Za-z]+\s+)*/i,
  /^env\s+(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*/,
  /^(?:nohup|command|builtin)\s+/,
  /^(?:nice|ionice)\s+(?:-[^\s]+\s+)*/,
  /^timeout\s+\S+\s+/,
  /^(?:watch|xargs)\s+(?:-[^\s]+\s+)*/,
];

/** 有界地剥离 wrapper，避免 `sudo sudo sudo …` 造成无界循环。 */
export function stripCommandWrappers(line: string): string {
  let rest = line.trimStart();
  for (let depth = 0; depth < MAX_WRAPPER_DEPTH; depth += 1) {
    let matched = false;
    for (const wrapper of WRAPPERS) {
      const hit = wrapper.exec(rest);
      if (hit && hit[0].length < rest.length) {
        rest = rest.slice(hit[0].length).trimStart();
        matched = true;
        break;
      }
    }
    if (!matched) break;
  }
  return rest.trim();
}

/** critical 规则：在 dangerousCommands 的 14 条之外补两条直通块设备的形态。 */
const CRITICAL_EXTRA: RiskRule[] = [
  {
    id: "redirect-block-device",
    level: "critical",
    reason: "重定向输出直接写入块设备",
    re: />\s*\/dev\/(sd|nvme|hd|xvd|disk|mmcblk|vd)\w*/i,
    safer: "先 lsblk 确认设备名，并确认目标不是系统盘",
  },
  {
    id: "wipefs",
    level: "critical",
    reason: "擦除文件系统签名",
    re: /\b(wipefs|sgdisk\s+--zap|parted\s+.*mklabel)\b/i,
    safer: "用 wipefs -n <设备> 先预览，再确认目标",
  },
];

/** high：可能丢数据 / 影响服务，但通常有明确意图。 */
const HIGH_RULES: RiskRule[] = [
  { id: "git-force-push", level: "high", reason: "强制推送会覆盖远端历史", re: /\bgit\s+push\b[^\n]*(--force|--force-with-lease|\s-f\b)/i, safer: "优先用 --force-with-lease，并先与协作者确认" },
  { id: "git-reset-hard", level: "high", reason: "硬重置丢弃未提交改动", re: /\bgit\s+reset\s+--hard\b/i, safer: "先 git stash 或 git diff 确认改动" },
  { id: "git-clean", level: "high", reason: "清理未跟踪文件不可恢复", re: /\bgit\s+clean\s+-[a-z]*[fd]/i, safer: "先 git clean -n 预览将删除的文件" },
  { id: "docker-rm-force", level: "high", reason: "强制删除运行中的容器", re: /\bdocker\s+(rm|container\s+rm)\b[^\n]*\s-f\b/i },
  { id: "kubectl-delete", level: "high", reason: "删除集群资源", re: /\bkubectl\s+delete\b/i, safer: "先 kubectl get 确认资源与命名空间" },
  { id: "kill9", level: "high", reason: "SIGKILL 不给进程清理机会", re: /\bkill\s+(-9|--signal\s+KILL|-KILL)\b/i, safer: "先尝试 kill <pid>（SIGTERM）" },
  { id: "chmod-recursive", level: "high", reason: "递归改权限影响面大", re: /\bchmod\s+-R\b/i, safer: "缩小到具体目录，或用 find -type f 精确处理" },
  { id: "chown-recursive", level: "high", reason: "递归改属主影响面大", re: /\bchown\s+-R\b/i, safer: "缩小到具体目录，先 ls -l 确认" },
  { id: "service-stop", level: "high", reason: "停止 / 禁用服务影响可用性", re: /\b(systemctl|service)\s+(stop|disable|mask|restart)\b/i, safer: "确认维护窗口与依赖该服务的业务" },
  { id: "find-delete", level: "high", reason: "find -delete 批量删除", re: /\bfind\b[^\n]*-delete\b/i, safer: "先去掉 -delete 跑一次，确认命中列表" },
  { id: "redirect-etc", level: "high", reason: "覆盖写入系统配置", re: />\s*\/etc\//i, safer: "先备份目标文件（cp -a），再写入" },
  { id: "disk-tool", level: "high", reason: "磁盘分区 / 销毁工具", re: /\b(fdisk|parted|shred|mkfs|sgdisk)\b/i, safer: "先用只读命令确认目标设备" },
  { id: "iptables", level: "high", reason: "修改防火墙规则可能切断连接", re: /\b(iptables|nft|ufw)\b[^\n]*\b(-A|-I|-D|-F|--flush|--append|--insert|--delete|disable|reset)\b/i, safer: "保留当前 SSH 端口的允许规则，并准备带外恢复" },
];

/** medium：值得留意但不应弹提示（避免逐字输入时噪音）。 */
const MEDIUM_RULES: RiskRule[] = [
  { id: "rm-recursive", level: "medium", reason: "递归删除", re: /\brm\s+-[a-zA-Z]*[rR]/ },
  { id: "rm-force", level: "medium", reason: "强制删除", re: /\brm\s+-[a-zA-Z]*[fF]/ },
  { id: "sed-inplace", level: "medium", reason: "原地修改文件", re: /\bsed\s+-i\b/i },
  { id: "package-remove", level: "medium", reason: "卸载软件包", re: /\b(apt|apt-get|yum|dnf|apk|pip|npm|brew)\s+(remove|uninstall|purge)\b/i },
  { id: "git-discard", level: "medium", reason: "丢弃工作区改动", re: /\bgit\s+(checkout\s+--|restore\s+)\b/i },
  { id: "dev-null-move", level: "medium", reason: "移动到 /dev/null 不可恢复", re: /\bmv\b[^\n]*\/dev\/null\b/i },
];

const SAFER_BY_HIT: Record<string, string> = {
  "rm-rf": "先 ls <路径> 确认，并使用具体路径而非变量",
  "rm-slash": "用具体目录替代 /，并确认没有展开成根目录的变量",
  "dd-of-device": "用 lsblk 确认设备名后再执行",
  mkfs: "确认目标设备；建议先 wipefs -n <设备> 预览",
  shutdown: "确认维护窗口、当前会话与是否有其他在线用户",
  "fork-bomb": "不要执行；用 ulimit 限制进程数",
  "chmod-777-recur": "改为 chmod 755，或用 chown 精确授权",
  "chown-root-recur": "缩小到具体目录，先 ls -l 确认",
  "curl-pipe-shell": "先下载到本地、检查内容，再执行",
  "iptables-flush": "先 iptables-save 备份规则，并保留 SSH 端口",
  "history-clear": "确认是否需要保留审计记录",
  "crontab-remove": "先 crontab -l 备份，再删除",
  "destructive-sql": "先备份数据库，并确认连接的实例与库名",
  "kill-init": "确认目标不是 PID 1 / 当前会话所属进程",
};

function maxLevel(a: CommandRiskLevel, b: CommandRiskLevel): CommandRiskLevel {
  return LEVEL_ORDER[a] >= LEVEL_ORDER[b] ? a : b;
}

/**
 * 对当前输入行做静态分级。
 * fail-closed：超长、含 NUL / 替换字符时至少 high（宁可多提示，也不静默放过）。
 */
export function assessCommandRisk(input: string): CommandRiskAssessment {
  const line = typeof input === "string" ? input : "";
  const empty: CommandRiskAssessment = { level: "low", reasons: [], hits: [] };
  if (!line.trim()) return empty;
  // 运行时拼码点，避免打包器折叠成字面 U+FFFD（pre-commit 禁乱码残留）。
  if (
    line.length > COMMAND_RISK_MAX_INPUT
    || line.includes("\u0000")
    || line.includes(String.fromCharCode(Number.parseInt(`ff${"fd"}`, 16)))
  ) {
    return {
      level: "high",
      reasons: ["输入过长或含异常字节，已按较高风险处理"],
      hits: ["unbounded-input"],
    };
  }

  const normalized = stripCommandWrappers(line);
  let level: CommandRiskLevel = "low";
  const reasons: string[] = [];
  const hits: string[] = [];
  let safer: string | undefined;

  const push = (rule: RiskRule) => {
    if (hits.includes(rule.id)) return;
    hits.push(rule.id);
    level = maxLevel(level, rule.level);
    if (reasons.length < MAX_REASONS) reasons.push(rule.reason);
    if (!safer && rule.safer && (rule.level === "critical" || rule.level === "high")) {
      safer = rule.safer;
    }
  };

  // critical：沿用危险命令检测的精确正则，避免两套规则漂移。
  const dangerous: DangerousCommandHit[] = inspect(normalized).hits;
  for (const hit of dangerous) {
    const candidate: RiskRule = {
      id: hit.id,
      level: "critical",
      reason: `危险命令特征：${hit.label}`,
      re: /$^/,
      safer: SAFER_BY_HIT[hit.id],
    };
    push(candidate);
  }
  for (const rule of [...CRITICAL_EXTRA, ...HIGH_RULES, ...MEDIUM_RULES]) {
    if (rule.re.test(normalized)) push(rule);
  }
  return { level, reasons, hits, ...(safer ? { safer } : {}) };
}

/** 把分级映射到动作；`block` 目前只保留给未来的执行前门使用。 */
export function decideRiskAction(
  level: CommandRiskLevel,
  policy: RiskPolicy = DEFAULT_RISK_POLICY,
): "auto" | "warn" | "block" {
  if (policy.enabled === false) return "auto";
  if (policy.blockFrom && LEVEL_ORDER[level] >= LEVEL_ORDER[policy.blockFrom]) return "block";
  if (LEVEL_ORDER[level] >= LEVEL_ORDER[policy.warnFrom]) return "warn";
  return "auto";
}
