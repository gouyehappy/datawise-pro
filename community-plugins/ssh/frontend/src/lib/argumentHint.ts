/**
 * 终端「参数即时提示」：根据影子输入行给出当前命令的用法与常用选项。
 *
 * 设计红线（承接 beta.40 的「准」侧原则）：
 *  - 纯静态 spec，零 IPC、零进程、零定时器；不改写一个字节、不吞一个按键；
 *  - 只做显示，命令名必须精确命中 spec 才提示，避免逐字输入时的噪音；
 *  - 引号 / heredoc / 命令替换 / 控制字符等歧义上下文一律放弃；
 *  - 行长度、token 数、flag 数全部有界，洪流输入也不会拖慢 onData。
 *
 * spec 文案是「命令参考数据」而非 UI 标签，故随模块自带中英两份，由
 * `locale` 选择；i18n 只负责提示条自身的 3 个标签。
 */

export type ArgumentHintLocale = "zh-CN" | "en";

export const ARGUMENT_HINT_MAX_LINE = 4096;
export const ARGUMENT_HINT_MAX_TOKENS = 128;
export const ARGUMENT_HINT_MAX_FLAGS = 5;

interface LocalizedText {
  en: string;
  zh: string;
}

interface FlagSpec {
  flag: string;
  en: string;
  zh: string;
}

interface SubcommandSpec {
  usage: LocalizedText;
  flags?: readonly FlagSpec[];
}

interface CommandSpec {
  usage: LocalizedText;
  flags: readonly FlagSpec[];
  subcommands?: Readonly<Record<string, SubcommandSpec>>;
}

export interface ArgumentFlagHint {
  flag: string;
  description: string;
}

export interface ArgumentHint {
  /** Display name, e.g. `git` or `git commit`. */
  command: string;
  usage: string;
  /** Token currently being typed; empty when the line ends with whitespace. */
  currentToken: string;
  /** Flags relevant to the current token, capped at ARGUMENT_HINT_MAX_FLAGS. */
  flags: ArgumentFlagHint[];
}

const L = (en: string, zh: string): LocalizedText => ({ en, zh });
const F = (flag: string, en: string, zh: string): FlagSpec => ({ flag, en, zh });

const SYSTEMCTL_VERBS: readonly string[] = [
  "start", "stop", "restart", "reload", "status", "enable", "disable", "mask",
];

function buildSystemctlSubcommands(): Readonly<Record<string, SubcommandSpec>> {
  const out: Record<string, SubcommandSpec> = {};
  for (const verb of SYSTEMCTL_VERBS) {
    out[verb] = {
      usage: L(`systemctl ${verb} <unit>`, `systemctl ${verb} <单元>`),
      flags: [
        F("--now", "also start/stop immediately", "同时立即启动 / 停止"),
        F("--no-block", "do not wait for the job", "不等待任务完成"),
        F("--user", "user manager", "用户级服务"),
        F("-l", "full output", "完整输出"),
      ],
    };
  }
  return out;
}

const SYSTEMCTL_SUBCOMMANDS = buildSystemctlSubcommands();

/** Static, curated specs for the commands people most often mistype. */
export const COMMAND_ARGUMENT_SPECS: Readonly<Record<string, CommandSpec>> = {
  git: {
    usage: L("git <subcommand> [options]", "git <子命令> [选项]"),
    flags: [F("-C <path>", "run as if started in <path>", "在指定目录执行"), F("-c <k=v>", "set config for this run", "临时设置配置"), F("--no-pager", "disable the pager", "禁用分页器")],
    subcommands: {
      add: { usage: L("git add <path...>", "git add <路径…>"), flags: [F("-p", "interactive patch staging", "交互式分块暂存"), F("-A", "stage all changes", "暂存全部变更"), F("-u", "stage tracked changes", "暂存已跟踪变更"), F("-f", "force add ignored files", "强制添加被忽略文件")] },
      commit: { usage: L("git commit -m <msg> [path...]", "git commit -m <说明> [路径…]"), flags: [F("-m <msg>", "commit message", "提交说明"), F("-a", "stage all tracked changes", "自动暂存已跟踪文件"), F("--amend", "amend the previous commit", "修正上一次提交"), F("--no-verify", "skip hooks", "跳过钩子"), F("-S", "GPG-sign the commit", "GPG 签名提交")] },
      push: { usage: L("git push <remote> <branch>", "git push <远端> <分支>"), flags: [F("-u", "set upstream", "设置上游分支"), F("--force-with-lease", "safe forced update", "安全的强制推送"), F("--tags", "push tags", "推送标签"), F("--dry-run", "show what would be done", "仅预演不执行")] },
      pull: { usage: L("git pull [--rebase] <remote> <branch>", "git pull [--rebase] <远端> <分支>"), flags: [F("--rebase", "rebase instead of merge", "用变基代替合并"), F("--ff-only", "fast-forward only", "仅快进合并"), F("--autostash", "stash before / pop after", "自动暂存并恢复"), F("--no-commit", "do not auto-commit", "不自动提交")] },
      checkout: { usage: L("git checkout [-b] <branch>", "git checkout [-b] <分支>"), flags: [F("-b <branch>", "create a new branch", "新建分支"), F("-B <branch>", "create or reset branch", "新建或重置分支"), F("--", "separate paths from revisions", "分隔路径与版本"), F("-f", "force, discard local changes", "强制切换并丢弃改动")] },
      log: { usage: L("git log [options] [revision]", "git log [选项] [版本]"), flags: [F("--oneline", "one commit per line", "每行一条提交"), F("--graph", "draw the branch graph", "显示分支图"), F("-n <count>", "limit commit count", "限制条数"), F("--since=<date>", "commits after a date", "指定起始时间"), F("-p", "show patches", "显示补丁内容")] },
      status: { usage: L("git status [path...]", "git status [路径…]"), flags: [F("-s", "short format", "精简格式"), F("-b", "show branch info", "显示分支信息"), F("--porcelain", "stable machine-readable output", "稳定的机器可读输出"), F("-uno", "hide untracked files", "隐藏未跟踪文件")] },
      diff: { usage: L("git diff [options] [path...]", "git diff [选项] [路径…]"), flags: [F("--staged", "staged changes only", "仅已暂存的改动"), F("--stat", "diffstat summary", "显示改动统计"), F("--name-only", "list changed file names", "仅列出文件名"), F("-w", "ignore whitespace", "忽略空白差异")] },
      branch: { usage: L("git branch [-a] [name]", "git branch [-a] [名称]"), flags: [F("-a", "list remote branches too", "同时列出远端分支"), F("-d <branch>", "delete a merged branch", "删除已合并分支"), F("-D <branch>", "force delete a branch", "强制删除分支"), F("-m <name>", "rename the branch", "重命名分支"), F("-v", "show last commit per branch", "显示各分支最后提交")] },
      clone: { usage: L("git clone <repo> [dir]", "git clone <仓库> [目录]"), flags: [F("--depth <n>", "shallow clone", "浅克隆指定深度"), F("-b <branch>", "checkout a branch", "检出指定分支"), F("--recurse-submodules", "initialize submodules", "同时初始化子模块"), F("--bare", "create a bare repository", "创建裸仓库")] },
    },
  },
  kubectl: {
    usage: L("kubectl <verb> <resource> [name] [flags]", "kubectl <动作> <资源> [名称] [选项]"),
    flags: [F("-n <ns>", "namespace", "命名空间"), F("--context <name>", "kubeconfig context", "指定 kubeconfig 上下文"), F("-o <format>", "output format", "输出格式"), F("-A", "all namespaces", "全部命名空间"), F("-v <level>", "log verbosity", "日志详细级别")],
    subcommands: {
      get: { usage: L("kubectl get <resource> [name] [flags]", "kubectl get <资源> [名称] [选项]"), flags: [F("-o wide|yaml|json", "output format", "输出格式"), F("-n <ns>", "namespace", "命名空间"), F("-A", "all namespaces", "全部命名空间"), F("-w", "watch for changes", "持续监听变化"), F("--show-labels", "print labels", "显示标签")] },
      describe: { usage: L("kubectl describe <resource> <name>", "kubectl describe <资源> <名称>"), flags: [F("-n <ns>", "namespace", "命名空间"), F("--events", "include related events", "包含相关事件")] },
      logs: { usage: L("kubectl logs <pod> [-c <container>]", "kubectl logs <Pod> [-c <容器>]"), flags: [F("-f", "follow the log stream", "实时跟随日志"), F("-c <name>", "container name", "指定容器"), F("--tail <n>", "last N lines", "显示最后 N 行"), F("--since <duration>", "logs since a duration", "显示指定时间以来的日志"), F("-p", "previous container instance", "上一次容器实例")] },
      apply: { usage: L("kubectl apply -f <file>", "kubectl apply -f <文件>"), flags: [F("-f <file>", "manifest file or directory", "清单文件或目录"), F("-k <dir>", "kustomization directory", "kustomization 目录"), F("--dry-run=client|server", "validate without applying", "仅校验不应用"), F("--prune", "remove unmanaged objects", "清理不再管理的对象")] },
      delete: { usage: L("kubectl delete <resource> <name>", "kubectl delete <资源> <名称>"), flags: [F("-f <file>", "delete from a manifest", "按清单文件删除"), F("--grace-period <s>", "termination grace period", "优雅终止等待秒数"), F("--force", "force removal", "强制删除"), F("-n <ns>", "namespace", "命名空间")] },
      exec: { usage: L("kubectl exec -it <pod> -- <cmd>", "kubectl exec -it <Pod> -- <命令>"), flags: [F("-it", "interactive TTY", "交互式终端"), F("-c <name>", "container name", "指定容器"), F("-n <ns>", "namespace", "命名空间")] },
    },
  },
  docker: {
    usage: L("docker <subcommand> [options]", "docker <子命令> [选项]"),
    flags: [F("--help", "show help", "显示帮助")],
    subcommands: {
      ps: { usage: L("docker ps [options]", "docker ps [选项]"), flags: [F("-a", "include stopped containers", "包含已停止容器"), F("-q", "IDs only", "仅输出 ID"), F("--format <tpl>", "format output", "自定义输出格式"), F("--filter <k=v>", "filter results", "按条件过滤"), F("-s", "show sizes", "显示占用大小")] },
      run: { usage: L("docker run [options] <image> [cmd]", "docker run [选项] <镜像> [命令]"), flags: [F("-d", "detached", "后台运行"), F("-it", "interactive TTY", "交互式终端"), F("--rm", "remove on exit", "退出后自动删除"), F("-p <host:ctr>", "publish a port", "映射端口"), F("-v <src:dst>", "bind mount a volume", "挂载卷"), F("--name <name>", "container name", "指定容器名"), F("-e <K=V>", "set an env var", "设置环境变量")] },
      exec: { usage: L("docker exec [options] <container> <cmd>", "docker exec [选项] <容器> <命令>"), flags: [F("-it", "interactive TTY", "交互式终端"), F("-d", "detached", "后台运行"), F("-u <user>", "run as user", "指定用户"), F("-e <K=V>", "set an env var", "设置环境变量")] },
      logs: { usage: L("docker logs [options] <container>", "docker logs [选项] <容器>"), flags: [F("-f", "follow the log stream", "实时跟随日志"), F("--tail <n>", "last N lines", "显示最后 N 行"), F("--since <duration>", "logs since a duration", "显示指定时间以来的日志"), F("-t", "show timestamps", "显示时间戳")] },
      build: { usage: L("docker build [options] <context>", "docker build [选项] <上下文>"), flags: [F("-t <tag>", "tag the image", "指定镜像标签"), F("-f <file>", "Dockerfile path", "指定 Dockerfile"), F("--no-cache", "disable build cache", "不使用构建缓存"), F("--build-arg <K=V>", "pass a build arg", "传入构建参数"), F("--target <stage>", "build a specific stage", "构建指定阶段")] },
    },
  },
  systemctl: {
    usage: L("systemctl <verb> <unit>", "systemctl <动作> <单元>"),
    flags: [F("--user", "user manager", "用户级服务"), F("--no-pager", "disable the pager", "禁用分页器"), F("-l", "full output, no ellipsis", "完整输出不省略")],
    subcommands: SYSTEMCTL_SUBCOMMANDS,
  },
  journalctl: {
    usage: L("journalctl [options] [unit]", "journalctl [选项] [单元]"),
    flags: [F("-u <unit>", "filter by unit", "按单元过滤"), F("-f", "follow new entries", "实时跟随新日志"), F("-n <n>", "last N lines", "显示最后 N 行"), F("--since <time>", "entries since a time", "指定起始时间"), F("-b", "current boot only", "仅本次启动"), F("-p <level>", "minimum priority", "最低日志级别")],
  },
  ls: {
    usage: L("ls [options] [path...]", "ls [选项] [路径…]"),
    flags: [F("-l", "long listing format", "详细列表"), F("-a", "include hidden files", "包含隐藏文件"), F("-h", "human-readable sizes", "易读的大小单位"), F("-t", "sort by modification time", "按修改时间排序"), F("-R", "recursive", "递归列出子目录"), F("-S", "sort by size", "按大小排序")],
  },
  cp: {
    usage: L("cp [options] <src...> <dest>", "cp [选项] <源…> <目标>"),
    flags: [F("-r", "copy directories recursively", "递归复制目录"), F("-p", "preserve mode/owner/timestamps", "保留权限与时间戳"), F("-v", "verbose", "显示复制过程"), F("-i", "prompt before overwrite", "覆盖前询问"), F("-a", "archive mode", "归档模式"), F("-n", "never overwrite", "不覆盖已有文件")],
  },
  mv: {
    usage: L("mv [options] <src...> <dest>", "mv [选项] <源…> <目标>"),
    flags: [F("-i", "prompt before overwrite", "覆盖前询问"), F("-n", "never overwrite", "不覆盖已有文件"), F("-v", "verbose", "显示移动过程"), F("-f", "force, no prompt", "强制不询问"), F("-u", "only if source is newer", "仅当源更新时移动")],
  },
  rm: {
    usage: L("rm [options] <path...>", "rm [选项] <路径…>"),
    flags: [F("-r", "remove directories recursively", "递归删除目录"), F("-f", "force, ignore missing", "强制删除不提示"), F("-i", "prompt before every removal", "每次删除前询问"), F("-v", "verbose", "显示删除过程"), F("--", "end of options (for -leading names)", "选项结束，处理以 - 开头的文件")],
  },
  tar: {
    usage: L("tar [options] <archive> <files...>", "tar [选项] <归档> <文件…>"),
    flags: [F("-c", "create an archive", "创建归档"), F("-x", "extract an archive", "解包归档"), F("-t", "list archive contents", "列出归档内容"), F("-f <file>", "archive file name", "指定归档文件"), F("-z", "gzip compression", "gzip 压缩"), F("-v", "verbose", "显示处理过程"), F("-C <dir>", "change to directory", "切换到指定目录")],
  },
  curl: {
    usage: L("curl [options] <url>", "curl [选项] <URL>"),
    flags: [F("-X <method>", "HTTP method", "指定 HTTP 方法"), F("-H <header>", "add a request header", "添加请求头"), F("-d <data>", "POST body", "POST 请求体"), F("-o <file>", "write output to a file", "输出到文件"), F("-L", "follow redirects", "跟随重定向"), F("-sS", "silent but show errors", "静默但显示错误"), F("-k", "allow insecure TLS", "允许不校验证书")],
  },
  ssh: {
    usage: L("ssh [options] user@host [command]", "ssh [选项] 用户@主机 [命令]"),
    flags: [F("-p <port>", "remote port", "指定远端端口"), F("-i <key>", "identity (private key) file", "指定私钥文件"), F("-L <fwd>", "local port forwarding", "本地端口转发"), F("-R <fwd>", "remote port forwarding", "远端端口转发"), F("-N", "no remote command", "不执行远端命令"), F("-v", "verbose (repeatable)", "详细日志（可重复）"), F("-o <option>", "set a config option", "指定配置项")],
  },
  scp: {
    usage: L("scp [options] <src...> <dest>", "scp [选项] <源…> <目标>"),
    flags: [F("-r", "recursive", "递归复制目录"), F("-P <port>", "remote port", "指定远端端口"), F("-i <key>", "identity file", "指定私钥文件"), F("-p", "preserve timestamps/mode", "保留时间戳与权限"), F("-q", "quiet", "静默模式"), F("-C", "enable compression", "启用压缩")],
  },
  find: {
    usage: L("find <path> [expression]", "find <路径> [表达式]"),
    flags: [F("-name <pattern>", "match file name", "按文件名匹配"), F("-type <f|d|l>", "match file type", "按文件类型匹配"), F("-mtime <n>", "modified N days ago", "按修改天数匹配"), F("-maxdepth <n>", "limit traversal depth", "限制遍历深度"), F("-exec <cmd> {} \\;", "run a command per match", "对每个结果执行命令")],
  },
  grep: {
    usage: L("grep [options] <pattern> [file...]", "grep [选项] <模式> [文件…]"),
    flags: [F("-i", "ignore case", "忽略大小写"), F("-r", "recursive", "递归搜索"), F("-n", "print line numbers", "显示行号"), F("-v", "invert the match", "反向匹配"), F("-E", "extended regex", "扩展正则"), F("-l", "list matching files only", "仅列出匹配文件"), F("--include <glob>", "limit files by glob", "按通配符限定文件")],
  },
  tail: {
    usage: L("tail [options] <file...>", "tail [选项] <文件…>"),
    flags: [F("-n <n>", "last N lines", "显示最后 N 行"), F("-f", "follow appended data", "实时跟随追加"), F("-F", "follow with retry on rotation", "跟随并重试轮转文件"), F("-c <bytes>", "last N bytes", "显示最后 N 字节"), F("-q", "never print headers", "不输出文件名头")],
  },
  chmod: {
    usage: L("chmod <mode> <file...>", "chmod <权限> <文件…>"),
    flags: [F("-R", "recursive", "递归处理"), F("-v", "verbose", "显示处理过程"), F("--reference <file>", "copy mode from a file", "参照另一文件的权限")],
  },
  chown: {
    usage: L("chown <user:group> <file...>", "chown <用户:组> <文件…>"),
    flags: [F("-R", "recursive", "递归处理"), F("-v", "verbose", "显示处理过程")],
  },
  mkdir: {
    usage: L("mkdir [options] <dir...>", "mkdir [选项] <目录…>"),
    flags: [F("-p", "create parents, no error if exists", "创建父目录且已存在不报错"), F("-m <mode>", "set the mode", "指定权限"), F("-v", "verbose", "显示创建过程")],
  },
  df: {
    usage: L("df [options] [path...]", "df [选项] [路径…]"),
    flags: [F("-h", "human-readable sizes", "易读的大小单位"), F("-T", "show filesystem type", "显示文件系统类型"), F("-i", "inode usage instead of blocks", "显示 inode 用量"), F("--total", "print a grand total", "显示合计")],
  },
  du: {
    usage: L("du [options] [path...]", "du [选项] [路径…]"),
    flags: [F("-h", "human-readable sizes", "易读的大小单位"), F("-s", "summarize each argument", "仅显示每个参数合计"), F("-d <n>", "limit depth", "限制显示深度"), F("-a", "include files, not just dirs", "同时显示文件")],
  },
  ps: {
    usage: L("ps [options]", "ps [选项]"),
    flags: [F("aux", "all processes, BSD style", "BSD 风格全部进程"), F("-ef", "all processes, full listing", "完整格式全部进程"), F("-o <cols>", "custom output columns", "自定义输出列"), F("--sort <key>", "sort by a key", "按指定字段排序")],
  },
  kill: {
    usage: L("kill [-signal] <pid...>", "kill [-信号] <PID…>"),
    flags: [F("-15", "SIGTERM (graceful)", "SIGTERM 优雅终止"), F("-9", "SIGKILL (forced)", "SIGKILL 强制终止"), F("-HUP", "SIGHUP (reload)", "SIGHUP 重载"), F("-l", "list signal names", "列出信号名")],
  },
  npm: {
    usage: L("npm <command> [options]", "npm <命令> [选项]"),
    flags: [F("--help", "show help", "显示帮助")],
    subcommands: {
      install: { usage: L("npm install [package...]", "npm install [包…]"), flags: [F("-g", "install globally", "全局安装"), F("--save-dev", "save as devDependency", "存为开发依赖"), F("--package-lock-only", "only update the lockfile", "仅更新锁文件"), F("--omit=dev", "skip dev dependencies", "跳过开发依赖")] },
      run: { usage: L("npm run <script> [-- <args>]", "npm run <脚本> [-- <参数>]"), flags: [F("--if-present", "skip missing scripts", "脚本不存在时跳过"), F("--workspaces", "run in all workspaces", "在所有工作区执行")] },
      test: { usage: L("npm test [-- <args>]", "npm test [-- <参数>]"), flags: [F("-- --watch", "pass args to the test runner", "向测试运行器传参")] },
    },
  },
  cargo: {
    usage: L("cargo <command> [options]", "cargo <命令> [选项]"),
    flags: [F("--help", "show help", "显示帮助")],
    subcommands: {
      build: { usage: L("cargo build [options]", "cargo build [选项]"), flags: [F("--release", "optimized build", "发布构建"), F("-p <package>", "build a package", "构建指定包"), F("--features <list>", "enable features", "启用特性"), F("--target <triple>", "target triple", "指定目标平台")] },
      test: { usage: L("cargo test [options] [filter]", "cargo test [选项] [过滤器]"), flags: [F("--release", "test optimized build", "测试发布构建"), F("-- --nocapture", "show test output", "显示测试输出"), F("-p <package>", "test a package", "测试指定包"), F("--doc", "doc tests only", "仅文档测试")] },
      run: { usage: L("cargo run [options] [-- <args>]", "cargo run [选项] [-- <参数>]"), flags: [F("--release", "run optimized build", "运行发布构建"), F("-p <package>", "run a package", "运行指定包"), F("--example <name>", "run an example", "运行示例")] },
    },
  },
};

/** Exposed for specs: the exact set of command names that can produce a hint. */
export const ARGUMENT_SPEC_NAMES: readonly string[] = Object.keys(COMMAND_ARGUMENT_SPECS);

function pick(text: LocalizedText | FlagSpec, locale: ArgumentHintLocale): string {
  return locale === "zh-CN" ? text.zh : text.en;
}

/** Split on shell operators that are NOT inside single/double quotes. */
function lastCommandSegment(line: string): string {
  let start = 0;
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === quote && line[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "|" || ch === ";" || ch === "&" || ch === "\n") start = i + 1;
  }
  return line.slice(start);
}

interface Tokenized {
  tokens: string[];
  trailingSpace: boolean;
}

/** Whitespace tokenizer with quote awareness; unterminated quotes are kept as
 *  one token to the end of the line instead of throwing / looping forever. */
function tokenize(text: string): Tokenized {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let hasToken = false;
  let trailingSpace = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === quote && text[i - 1] !== "\\") quote = null;
      else current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      hasToken = true;
      trailingSpace = false;
      continue;
    }
    if (/\s/.test(ch)) {
      if (hasToken) {
        tokens.push(current);
        current = "";
        hasToken = false;
      }
      trailingSpace = true;
      continue;
    }
    current += ch;
    hasToken = true;
    trailingSpace = false;
  }
  if (hasToken) tokens.push(current);
  return { tokens, trailingSpace };
}

export interface HintCommandContext {
  /** Bare command name after stripping `sudo` / `VAR=value` prefixes. */
  command: string;
  /** Second token, when present (git commit / kubectl get / …). */
  subcommand?: string;
  /** Token currently being typed; empty when the line ends with whitespace. */
  currentToken: string;
  /** Whether a curated static spec exists for this command. */
  hasStaticSpec: boolean;
}

/**
 * Parse just enough of the shadow line to identify the command being typed.
 * Uses the *exact* same conservative gates as `resolveArgumentHint`, so a
 * remote-help affordance can never appear on a line we would not annotate.
 */
export function hintCommandFromLine(line: string): HintCommandContext | null {
  if (typeof line !== "string" || !line || line.length > ARGUMENT_HINT_MAX_LINE) return null;
  // Tabs are fine, but anything else in C0 (except \t) or a DEL is noise.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(line)) return null;
  // Command substitution / heredoc / backticks make the "current command"
  // ambiguous. Stay silent rather than showing a confidently wrong hint.
  if (line.includes("`") || line.includes("$(") || line.includes("<<")) return null;

  const { tokens, trailingSpace } = tokenize(lastCommandSegment(line));
  if (!tokens.length || tokens.length > ARGUMENT_HINT_MAX_TOKENS) return null;

  // Skip a single bare sudo and leading VAR=value assignments.
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === "sudo" || /^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) index += 1;
    else break;
  }
  const command = tokens[index];
  if (!command || !/^[A-Za-z][A-Za-z0-9._+-]*$/.test(command)) return null;

  const lastToken = tokens[tokens.length - 1] ?? "";
  return {
    command,
    subcommand: tokens[index + 1],
    currentToken: trailingSpace ? "" : lastToken,
    hasStaticSpec: Object.prototype.hasOwnProperty.call(COMMAND_ARGUMENT_SPECS, command),
  };
}

/**
 * Resolve a hint for the in-progress PTY line. Returns null for anything
 * ambiguous or unrecognized — silence is always preferable to a wrong hint.
 */
export function resolveArgumentHint(line: string, locale: ArgumentHintLocale = "en"): ArgumentHint | null {
  const context = hintCommandFromLine(line);
  if (!context) return null;
  const spec = COMMAND_ARGUMENT_SPECS[context.command];
  if (!spec) return null;

  const subcommand = context.subcommand;
  const sub = subcommand ? spec.subcommands?.[subcommand] : undefined;
  const effectiveUsage = sub?.usage ?? spec.usage;
  const effectiveFlags = sub?.flags ?? spec.flags;
  const displayName = sub ? `${context.command} ${subcommand}` : context.command;
  const currentToken = context.currentToken;

  let candidates = effectiveFlags;
  if (currentToken.startsWith("-")) {
    candidates = effectiveFlags.filter((flag) => flag.flag.startsWith(currentToken));
  }
  const flags: ArgumentFlagHint[] = candidates
    .slice(0, ARGUMENT_HINT_MAX_FLAGS)
    .map((flag) => ({ flag: flag.flag, description: pick(flag, locale) }));

  return {
    command: displayName,
    usage: pick(effectiveUsage, locale),
    currentToken,
    flags,
  };
}
