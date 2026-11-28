import { describe, expect, it } from "vitest";
import {
  ARGUMENT_HINT_MAX_FLAGS,
  ARGUMENT_HINT_MAX_LINE,
  ARGUMENT_SPEC_NAMES,
  COMMAND_ARGUMENT_SPECS,
  resolveArgumentHint,
} from "./argumentHint";

describe("resolveArgumentHint", () => {
  it("stays silent for empty, oversized, control-character and ambiguous lines", () => {
    expect(resolveArgumentHint("")).toBeNull();
    expect(resolveArgumentHint("   ")).toBeNull();
    expect(resolveArgumentHint("git ".repeat(2000))).toBeNull();
    expect(resolveArgumentHint("x".repeat(ARGUMENT_HINT_MAX_LINE + 1))).toBeNull();
    expect(resolveArgumentHint("git status\u0007")).toBeNull();
    expect(resolveArgumentHint("echo `date`")).toBeNull();
    expect(resolveArgumentHint("echo $(date)")).toBeNull();
    expect(resolveArgumentHint("cat <<EOF")).toBeNull();
  });

  it("only hints for exact known command names", () => {
    expect(resolveArgumentHint("madeupcmd --foo")).toBeNull();
    expect(resolveArgumentHint("gi")).toBeNull();
    expect(resolveArgumentHint("git")).toMatchObject({ command: "git", currentToken: "git" });
    expect(ARGUMENT_SPEC_NAMES).toContain("git");
    expect(ARGUMENT_SPEC_NAMES).toContain("kubectl");
    expect(ARGUMENT_SPEC_NAMES).toContain("docker");
    expect(new Set(ARGUMENT_SPEC_NAMES).size).toBe(ARGUMENT_SPEC_NAMES.length);
  });

  it("tracks the token currently being typed", () => {
    expect(resolveArgumentHint("git")?.currentToken).toBe("git");
    expect(resolveArgumentHint("git ")?.currentToken).toBe("");
    expect(resolveArgumentHint("ls -l")?.currentToken).toBe("-l");
    expect(resolveArgumentHint("ls -l ")?.currentToken).toBe("");
  });

  it("filters flags by the current token prefix and caps the list", () => {
    expect(resolveArgumentHint("git commit -m")?.flags.map((f) => f.flag)).toEqual(["-m <msg>"]);
    expect(resolveArgumentHint("git commit --")?.flags.map((f) => f.flag)).toEqual(["--amend", "--no-verify"]);
    expect(resolveArgumentHint("tar -")?.flags).toHaveLength(ARGUMENT_HINT_MAX_FLAGS);
    expect(resolveArgumentHint("ls -zzz")?.flags).toEqual([]);
  });

  it("switches usage and flags for a recognized subcommand, falls back otherwise", () => {
    const commit = resolveArgumentHint("git commit ");
    expect(commit?.command).toBe("git commit");
    expect(commit?.usage).toBe("git commit -m <msg> [path...]");
    expect(commit?.flags.some((f) => f.flag === "--amend")).toBe(true);
    expect(resolveArgumentHint("kubectl logs -f")?.command).toBe("kubectl logs");
    expect(resolveArgumentHint("docker run -p")?.flags.map((f) => f.flag)).toEqual(["-p <host:ctr>"]);
    expect(resolveArgumentHint("systemctl restart nginx")?.command).toBe("systemctl restart");
    // Unknown subcommand keeps the top-level spec instead of disappearing.
    expect(resolveArgumentHint("kubectl frobnicate")?.command).toBe("kubectl");
  });

  it("strips a bare sudo and leading environment assignments", () => {
    expect(resolveArgumentHint("sudo systemctl status nginx")?.command).toBe("systemctl status");
    expect(resolveArgumentHint("FOO=bar BAR=1 ls -")?.command).toBe("ls");
    // `sudo -u root` is ambiguous for a static spec — stay silent, not wrong.
    expect(resolveArgumentHint("sudo -u root git status")).toBeNull();
  });

  it("uses the last pipeline segment and ignores operators inside quotes", () => {
    expect(resolveArgumentHint("cat /var/log/app.log | grep -i")?.command).toBe("grep");
    expect(resolveArgumentHint("echo done; docker ps -a")?.command).toBe("docker ps");
    expect(resolveArgumentHint('echo "a|b" | git status')?.command).toBe("git status");
    expect(resolveArgumentHint("make && cargo test -- --nocapture")?.command).toBe("cargo test");
  });

  it("keeps quoted arguments intact without throwing on an unterminated quote", () => {
    expect(resolveArgumentHint('curl -H "Content-Type: application/json" https://x')?.command).toBe("curl");
    expect(resolveArgumentHint('git commit -m "fix the bug')?.command).toBe("git commit");
  });

  it("localizes usage and flag descriptions", () => {
    const en = resolveArgumentHint("git commit -m", "en");
    const zh = resolveArgumentHint("git commit -m", "zh-CN");
    expect(en?.usage).toContain("git commit -m");
    expect(en?.flags[0].description).toBe("commit message");
    expect(zh?.usage).toContain("git commit -m");
    expect(zh?.flags[0].description).toBe("提交说明");
    expect(resolveArgumentHint("ls", "zh-CN")?.usage).toBe("ls [选项] [路径…]");
  });

  it("is bounded on long but valid input", () => {
    const line = `git commit -m ${"a".repeat(ARGUMENT_HINT_MAX_LINE - 20)}`;
    const hint = resolveArgumentHint(line);
    expect(hint?.command).toBe("git commit");
    expect(hint?.flags.length ?? 0).toBeLessThanOrEqual(ARGUMENT_HINT_MAX_FLAGS);
  });
});

describe("command argument spec data integrity", () => {
  it("every spec and subcommand has non-empty bilingual text and unique flags", () => {
    for (const [name, spec] of Object.entries(COMMAND_ARGUMENT_SPECS)) {
      expect(spec.usage.en.length, `${name}.usage.en`).toBeGreaterThan(0);
      expect(spec.usage.zh.length, `${name}.usage.zh`).toBeGreaterThan(0);
      expect(spec.flags.length, `${name}.flags`).toBeGreaterThan(0);
      const seen = new Set<string>();
      for (const flag of spec.flags) {
        expect(flag.en.length, `${name}.${flag.flag}.en`).toBeGreaterThan(0);
        expect(flag.zh.length, `${name}.${flag.flag}.zh`).toBeGreaterThan(0);
        expect(seen.has(flag.flag), `${name}.${flag.flag} duplicate`).toBe(false);
        seen.add(flag.flag);
      }
      for (const [sub, subSpec] of Object.entries(spec.subcommands ?? {})) {
        expect(subSpec.usage.en.length, `${name}.${sub}.usage.en`).toBeGreaterThan(0);
        expect(subSpec.usage.zh.length, `${name}.${sub}.usage.zh`).toBeGreaterThan(0);
        expect((subSpec.flags ?? []).length, `${name}.${sub}.flags`).toBeGreaterThan(0);
      }
    }
  });
});
