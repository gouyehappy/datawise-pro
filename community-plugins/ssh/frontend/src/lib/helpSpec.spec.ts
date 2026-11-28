import { describe, expect, it } from "vitest";
import {
  helpSpecCommand,
  HELP_SPEC_MAX_FLAGS,
  isHelpSpecCommand,
  mergeHelpFlags,
  parseHelpFlags,
} from "./helpSpec";

const GNU_HELP = [
  "Usage: foo [OPTION]... [FILE]...",
  "List information about files.",
  "",
  "  -a, --all                  do not ignore entries starting with .",
  "      --author               print the author of each file",
  "  -o, --output=FILE          write result to FILE instead of stdout",
  "  -n, --number=NUM           set the number of items",
  "  -v                         verbose mode",
  "      --no-color             disable color output",
  "  -h, --help                 display this help and exit",
  "",
  "Report bugs to <foo@example.com>.",
].join("\n");

describe("isHelpSpecCommand / helpSpecCommand", () => {
  it("accepts only bare, bounded, non-shell command names", () => {
    for (const name of ["jq", "aws", "ffmpeg", "node", "python3", "foo.bar", "go-run", "a+b"]) {
      expect(isHelpSpecCommand(name)).toBe(true);
    }
    for (const bad of ["", "  ", "../bin/ls", "ls; rm -rf /", "ls | cat", "-rf", "$HOME/bin/x", "a".repeat(49)]) {
      expect(isHelpSpecCommand(bad)).toBe(false);
    }
    expect(isHelpSpecCommand(null)).toBe(false);
    expect(isHelpSpecCommand(42)).toBe(false);
    expect(isHelpSpecCommand("foo..bar")).toBe(false);
  });

  it("refuses destructive, state-changing and interactive names", () => {
    for (const blocked of ["rm", "dd", "shutdown", "systemctl", "sudo", "bash", "sh", "vim", "man", "kill", "mkfs.ext4"]) {
      expect(isHelpSpecCommand(blocked)).toBe(false);
    }
    expect(isHelpSpecCommand("RM")).toBe(false); // case-insensitive denylist
  });

  it("never interpolates anything except the validated name", () => {
    expect(helpSpecCommand("jq")).toBe("jq --help");
    expect(helpSpecCommand("foo.bar")).toBe("foo.bar --help");
    expect(helpSpecCommand("rm")).toBeNull();
    expect(helpSpecCommand("ls; id")).toBeNull();
    expect(helpSpecCommand("sudo")).toBeNull();
  });
});

describe("parseHelpFlags", () => {
  it("parses GNU-style short/long pairs, equals args and bare short flags", () => {
    const flags = parseHelpFlags(GNU_HELP);
    expect(flags.map((f) => f.flag)).toEqual([
      "-a, --all", "--author", "-o, --output=FILE", "-n, --number=NUM",
      "-v", "--no-color", "-h, --help",
    ]);
    expect(flags[0].description).toBe("do not ignore entries starting with .");
    expect(flags[4].description).toBe("verbose mode");
    // Usage / prose / bug-report lines are not turned into flags.
    expect(flags.some((f) => f.flag.includes("foo@example.com"))).toBe(false);
  });

  it("parses argparse and cobra option columns", () => {
    const argparse = [
      "options:",
      "  -h, --help            show this help message and exit",
      "  --foo FOO             foo help",
      "  --bar [BAR]           bar help",
    ].join("\n");
    expect(parseHelpFlags(argparse).map((f) => f.flag)).toEqual(["-h, --help", "--foo", "--bar"]);

    const cobra = [
      "Flags:",
      "  -c, --config string   config file (default \"/etc/foo.yaml\")",
      "  -f, --force           force operation",
      "      --timeout duration timeout (default 30s)",
    ].join("\n");
    const parsed = parseHelpFlags(cobra);
    expect(parsed.map((f) => f.flag)).toEqual(["-c, --config", "-f, --force", "--timeout"]);
    expect(parsed[0].description).toContain("config file");
  });

  it("strips ANSI/control characters and deduplicates by the long flag", () => {
    const text = [
      "\x1b[1m  -q, --quiet\x1b[0m     suppress output\x07",
      "      --quiet           duplicated long name",
      "  -q                    duplicated short name",
    ].join("\n");
    const flags = parseHelpFlags(text);
    expect(flags).toHaveLength(2);
    expect(flags[0].flag).toBe("-q, --quiet");
    expect(flags[0].description).toBe("suppress output");
    expect(flags[1].flag).toBe("-q");
  });

  it("is bounded on lines, line length, flag count and description length", () => {
    expect(parseHelpFlags("")).toEqual([]);
    expect(parseHelpFlags("just prose, no options\nUsage: foo --bar")).toEqual([]);
    expect(parseHelpFlags("  --ok".padEnd(600, "x") + "   desc")).toEqual([]);
    const many = Array.from({ length: 500 }, (_, i) => `      --flag-${i}   description ${i}`).join("\n");
    const flags = parseHelpFlags(many);
    expect(flags).toHaveLength(HELP_SPEC_MAX_FLAGS);
    const longDesc = `  --verbose   ${"x".repeat(300)}`;
    expect(parseHelpFlags(longDesc)[0].description.length).toBeLessThanOrEqual(120);
  });
});

describe("mergeHelpFlags", () => {
  const staticFlags = [{ flag: "-a, --all", description: "静态" }];
  const remoteFlags = [
    { flag: "-a, --all", description: "remote duplicate" },
    { flag: "--author", description: "author" },
    { flag: "--verbose", description: "verbose" },
  ];

  it("keeps curated static flags and drops duplicate remote ones", () => {
    const merged = mergeHelpFlags(staticFlags, remoteFlags);
    expect(merged.map((f) => f.flag)).toEqual(["-a, --all", "--author", "--verbose"]);
    expect(merged[0].description).toBe("静态");
  });

  it("narrows by the token being typed and caps the result", () => {
    // Prefix matching is per option token: `--a` hits `--all` and `--author`,
    // while `-a` hits only the short `-a` (not every `--a*` long name).
    expect(mergeHelpFlags([], remoteFlags, "--a").map((f) => f.flag)).toEqual(["-a, --all", "--author"]);
    expect(mergeHelpFlags([], remoteFlags, "-a").map((f) => f.flag)).toEqual(["-a, --all"]);
    expect(mergeHelpFlags([], remoteFlags, "", 2)).toHaveLength(2);
    expect(mergeHelpFlags([], [], "--x")).toEqual([]);
  });
});
