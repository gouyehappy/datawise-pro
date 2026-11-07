/**
 * Curated Fig specs: Wave 1 vendor files plus Wave 2 inline extras.
 *
 * Honest scope: this is a working curated corpus (not an empty stub). The
 * full upstream withfig autocomplete corpus is still deferred (license +
 * pack size); path generators supply remote paths for `cd`/`ls`/etc.
 * Adding more vendor specs under frontend/vendor/fig-specs/build is the
 * intended expansion path — do not claim host-wide Fig corpus loading.
 */

import type { FigSpecManifest } from "./source";
import curl from "../../../../vendor/fig-specs/build/curl.js";
import git from "../../../../vendor/fig-specs/build/git.js";
import docker from "../../../../vendor/fig-specs/build/docker.js";
import ssh from "../../../../vendor/fig-specs/build/ssh.js";
import cd from "../../../../vendor/fig-specs/build/cd.js";
import ls from "../../../../vendor/fig-specs/build/ls.js";

function asSpec(mod: unknown): unknown {
  if (mod && typeof mod === "object" && "default" in (mod as object)) {
    return (mod as { default: unknown }).default;
  }
  return mod;
}

const extraSpecs: FigSpecManifest = {
  scp: {
    name: "scp",
    description: "Secure copy",
    options: [
      { name: ["-r", "--recursive"], description: "Copy directories recursively" },
      { name: ["-P"], description: "Port", args: { name: "port" } },
      { name: ["-i"], description: "Identity file", args: { name: "file" } },
    ],
  },
  rsync: {
    name: "rsync",
    description: "Remote file sync",
    options: [
      { name: ["-a", "--archive"], description: "Archive mode" },
      { name: ["-v", "--verbose"], description: "Increase verbosity" },
      { name: ["-z", "--compress"], description: "Compress during transfer" },
      { name: ["--delete"], description: "Delete extra files on destination" },
    ],
  },
  kubectl: {
    name: "kubectl",
    description: "Kubernetes CLI",
    subcommands: [
      {
        name: "get",
        description: "Display resources",
        args: {
          name: "resource",
          suggestions: ["pods", "po", "nodes", "no", "svc", "services", "deploy", "deployments", "ns", "namespaces", "ing", "ingress", "cm", "configmaps", "secret", "secrets", "sts", "ds", "job", "cronjob", "pv", "pvc", "rs", "events"],
        },
        options: [
          { name: ["-n", "--namespace"], description: "Namespace", args: { name: "namespace" } },
          { name: ["-o", "--output"], description: "Output format", args: { name: "format", suggestions: ["wide", "yaml", "json", "name", "custom-columns"] } },
          { name: ["-A", "--all-namespaces"], description: "All namespaces" },
          { name: ["-w", "--watch"], description: "Watch for changes" },
          { name: ["-l", "--selector"], description: "Label selector", args: { name: "selector" } },
        ],
      },
      {
        name: "describe",
        description: "Show details of a resource",
        args: { name: "resource", suggestions: ["pods", "nodes", "svc", "deploy", "ns", "ing"] },
        options: [{ name: ["-n", "--namespace"], args: { name: "namespace" } }],
      },
      {
        name: "apply",
        description: "Apply a configuration",
        options: [
          { name: ["-f", "--filename"], description: "Filename", args: { name: "file", template: "filepaths" } },
          { name: ["-n", "--namespace"], args: { name: "namespace" } },
          { name: ["--dry-run"], description: "Dry run", args: { name: "strategy", suggestions: ["none", "server", "client"] } },
        ],
      },
      {
        name: "logs",
        description: "Print pod logs",
        args: { name: "pod" },
        options: [
          { name: ["-f", "--follow"], description: "Follow log output" },
          { name: ["-n", "--namespace"], args: { name: "namespace" } },
          { name: ["--tail"], args: { name: "lines" } },
          { name: ["-c", "--container"], args: { name: "container" } },
          { name: ["--previous"], description: "Print the logs for the previous instance" },
        ],
      },
      {
        name: "exec",
        description: "Execute a command in a container",
        args: { name: "pod" },
        options: [
          { name: ["-it"], description: "Interactive TTY" },
          { name: ["-n", "--namespace"], args: { name: "namespace" } },
          { name: ["-c", "--container"], args: { name: "container" } },
        ],
      },
      {
        name: "delete",
        description: "Delete resources",
        args: { name: "resource", suggestions: ["pods", "svc", "deploy", "ns"] },
        options: [
          { name: ["-f", "--filename"], args: { name: "file", template: "filepaths" } },
          { name: ["-n", "--namespace"], args: { name: "namespace" } },
        ],
      },
      {
        name: "config",
        description: "Modify kubeconfig files",
        subcommands: [
          { name: "use-context", description: "Set the current context", args: { name: "name" } },
          { name: "get-contexts", description: "List contexts" },
          { name: "current-context", description: "Display the current context" },
          { name: "view", description: "Display merged kubeconfig" },
        ],
      },
    ],
  },
  npm: {
    name: "npm",
    subcommands: [
      { name: "install", description: "Install a package" },
      { name: "run", description: "Run a script", args: { name: "script", suggestions: ["dev", "build", "start", "test", "lint"] } },
      { name: "test", description: "Run tests" },
      { name: "ci", description: "Clean install" },
    ],
  },
  systemctl: {
    name: "systemctl",
    subcommands: [
      {
        name: "status",
        description: "Show unit status",
        args: { name: "unit", suggestions: ["ssh", "sshd", "nginx", "docker", "cron", "NetworkManager"] },
      },
      {
        name: "start",
        description: "Start a unit",
        args: { name: "unit", suggestions: ["ssh", "sshd", "nginx", "docker", "cron"] },
      },
      {
        name: "stop",
        description: "Stop a unit",
        args: { name: "unit", suggestions: ["ssh", "sshd", "nginx", "docker", "cron"] },
      },
      {
        name: "restart",
        description: "Restart a unit",
        args: { name: "unit", suggestions: ["ssh", "sshd", "nginx", "docker", "cron"] },
      },
      {
        name: "enable",
        description: "Enable a unit",
        args: { name: "unit" },
      },
      {
        name: "disable",
        description: "Disable a unit",
        args: { name: "unit" },
      },
      { name: "daemon-reload", description: "Reload systemd manager configuration" },
      { name: "list-units", description: "List loaded units" },
    ],
    options: [
      { name: ["--user"], description: "Talk to the service manager of the calling user" },
      { name: ["-l", "--full"], description: "Do not ellipsize unit names" },
    ],
  },
  grep: {
    name: "grep",
    options: [
      { name: ["-r", "--recursive"], description: "Read all files under each directory" },
      { name: ["-i", "--ignore-case"], description: "Ignore case" },
      { name: ["-n"], description: "Print line numbers" },
      { name: ["-E"], description: "Extended regexp" },
      { name: ["-A"], description: "Lines after match", args: { name: "NUM" } },
      { name: ["-B"], description: "Lines before match", args: { name: "NUM" } },
    ],
    args: [
      { name: "pattern" },
      { name: "file", template: "filepaths", isVariadic: true },
    ],
  },
  journalctl: {
    name: "journalctl",
    description: "Query the systemd journal",
    options: [
      {
        name: ["-u", "--unit"],
        description: "Show messages for the specified unit",
        args: { name: "unit", suggestions: ["ssh", "sshd", "nginx", "docker", "cron", "NetworkManager"] },
      },
      { name: ["-f", "--follow"], description: "Follow new messages" },
      { name: ["-n", "--lines"], description: "Number of journal entries to show", args: { name: "N" } },
      { name: ["-xe"], description: "Explain + pager to end" },
      { name: ["--since"], description: "Start time", args: { name: "date", suggestions: ["today", "yesterday", "1 hour ago", "2 days ago"] } },
      { name: ["-b", "--boot"], description: "Show messages from a specific boot" },
      { name: ["--no-pager"], description: "Do not pipe output into a pager" },
      { name: ["-p", "--priority"], description: "Filter by priority", args: { name: "level", suggestions: ["err", "warning", "info", "debug"] } },
    ],
  },
  find: {
    name: "find",
    description: "Search for files in a directory hierarchy",
    options: [
      { name: ["-name"], description: "Basename pattern", args: { name: "pattern" } },
      { name: ["-type"], description: "File type", args: { name: "type", suggestions: ["f", "d", "l"] } },
      { name: ["-mtime"], description: "Modified N days ago", args: { name: "n" } },
      { name: ["-maxdepth"], description: "Descend at most N levels", args: { name: "n" } },
      { name: ["-exec"], description: "Execute command", args: { name: "command" } },
    ],
    args: { name: "path", template: "folders" },
  },
  tar: {
    name: "tar",
    description: "Tape archive",
    options: [
      { name: ["-x", "--extract"], description: "Extract files" },
      { name: ["-c", "--create"], description: "Create archive" },
      { name: ["-t", "--list"], description: "List contents" },
      { name: ["-z", "--gzip"], description: "Filter through gzip" },
      { name: ["-j", "--bzip2"], description: "Filter through bzip2" },
      { name: ["-J", "--xz"], description: "Filter through xz" },
      { name: ["-v", "--verbose"], description: "Verbose" },
      { name: ["-f", "--file"], description: "Archive file", args: { name: "file", template: "filepaths" } },
      { name: ["-C"], description: "Change to directory", args: { name: "dir", template: "folders" } },
    ],
  },
  ps: {
    name: "ps",
    description: "Report process status",
    options: [
      { name: ["aux"], description: "BSD all users + detailed" },
      { name: ["-ef"], description: "Full format listing" },
      { name: ["-u"], description: "User-oriented format", args: { name: "user" } },
      { name: ["--forest"], description: "ASCII art process tree" },
    ],
  },
  ss: {
    name: "ss",
    description: "Socket statistics",
    options: [
      { name: ["-t"], description: "TCP sockets" },
      { name: ["-u"], description: "UDP sockets" },
      { name: ["-l"], description: "Listening sockets" },
      { name: ["-n"], description: "Do not resolve names" },
      { name: ["-p"], description: "Show process" },
      { name: ["-a"], description: "All sockets" },
    ],
  },
  wget: {
    name: "wget",
    description: "Network downloader",
    options: [
      { name: ["-O", "--output-document"], description: "Output file", args: { name: "file", template: "filepaths" } },
      { name: ["-P", "--directory-prefix"], description: "Directory prefix", args: { name: "dir", template: "folders" } },
      { name: ["-q", "--quiet"], description: "Quiet" },
      { name: ["-c", "--continue"], description: "Continue partial download" },
      { name: ["--no-check-certificate"], description: "Do not validate SSL" },
    ],
    args: { name: "URL" },
  },
  chmod: {
    name: "chmod",
    description: "Change file mode bits",
    options: [
      { name: ["-R", "--recursive"], description: "Change files and directories recursively" },
      { name: ["-v", "--verbose"], description: "Output a diagnostic for every file" },
    ],
    args: [
      { name: "mode", suggestions: ["755", "644", "600", "700", "+x", "u+x", "a+r"] },
      { name: "file", template: "filepaths", isVariadic: true },
    ],
  },
  chown: {
    name: "chown",
    description: "Change file owner and group",
    options: [
      { name: ["-R", "--recursive"], description: "Operate on files and directories recursively" },
      { name: ["-v", "--verbose"], description: "Output a diagnostic for every file" },
    ],
    args: [
      { name: "owner" },
      { name: "file", template: "filepaths", isVariadic: true },
    ],
  },
  apt: {
    name: "apt",
    description: "APT package manager",
    subcommands: [
      { name: "update", description: "Refresh package lists" },
      { name: "upgrade", description: "Upgrade installed packages" },
      { name: "install", description: "Install packages", args: { name: "package", isVariadic: true } },
      { name: "remove", description: "Remove packages", args: { name: "package", isVariadic: true } },
      { name: "search", description: "Search package names", args: { name: "query" } },
      { name: "show", description: "Show package details", args: { name: "package" } },
    ],
  },
  helm: {
    name: "helm",
    description: "Helm package manager",
    subcommands: [
      { name: "list", description: "List releases" },
      { name: "install", description: "Install a chart" },
      { name: "upgrade", description: "Upgrade a release" },
      { name: "uninstall", description: "Uninstall a release" },
      { name: "status", description: "Display release status" },
      { name: "repo", description: "Manage chart repositories" },
    ],
  },
  terraform: {
    name: "terraform",
    description: "Terraform CLI",
    subcommands: [
      { name: "init", description: "Initialize working directory" },
      { name: "plan", description: "Show execution plan" },
      { name: "apply", description: "Apply changes" },
      { name: "destroy", description: "Destroy infrastructure" },
      { name: "fmt", description: "Format configuration" },
      { name: "validate", description: "Validate configuration" },
    ],
  },
  df: {
    name: "df",
    description: "Report file system disk space",
    options: [
      { name: ["-h", "--human-readable"], description: "Print sizes in human readable format" },
      { name: ["-T", "--print-type"], description: "Print file system type" },
      { name: ["-i", "--inodes"], description: "List inode information" },
    ],
  },
};

export const WAVE1_FIG_MANIFEST: FigSpecManifest = {
  curl: asSpec(curl),
  git: asSpec(git),
  docker: asSpec(docker),
  ssh: asSpec(ssh),
  cd: asSpec(cd),
  ls: asSpec(ls),
  scp: extraSpecs.scp,
  rsync: extraSpecs.rsync,
  kubectl: extraSpecs.kubectl,
  npm: extraSpecs.npm,
  systemctl: extraSpecs.systemctl,
  grep: extraSpecs.grep,
  journalctl: extraSpecs.journalctl,
  apt: extraSpecs.apt,
  helm: extraSpecs.helm,
  terraform: extraSpecs.terraform,
  df: extraSpecs.df,
  find: extraSpecs.find,
  tar: extraSpecs.tar,
  ps: extraSpecs.ps,
  ss: extraSpecs.ss,
  wget: extraSpecs.wget,
  chmod: extraSpecs.chmod,
  chown: extraSpecs.chown,
};
