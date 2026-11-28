import { describe, expect, it } from "vitest";
import {
  displayColumnWidth,
  lintShellLine,
  SHELL_LINT_MAX_ISSUES,
  SHELL_LINT_MAX_LINE,
} from "./shellLineLint";

describe("displayColumnWidth", () => {
  it("counts ASCII as 1 column", () => {
    expect(displayColumnWidth("ls -la")).toBe(6);
    expect(displayColumnWidth("")).toBe(0);
  });

  it("counts CJK / fullwidth / emoji as 2 columns", () => {
    expect(displayColumnWidth("中文")).toBe(4);
    expect(displayColumnWidth("echo 中文")).toBe(9);
    expect(displayColumnWidth("Ａ")).toBe(2);
    expect(displayColumnWidth("🚀")).toBe(2);
  });

  it("counts combining marks, ZWJ and zero-width chars as 0", () => {
    expect(displayColumnWidth("e\u0301")).toBe(1); // é as e + combining acute
    expect(displayColumnWidth("a\u200db")).toBe(2);
    expect(displayColumnWidth("a\u200bb")).toBe(2);
    expect(displayColumnWidth("\ufeffx")).toBe(1);
  });

  it("counts control characters as 0 and honours the code-point limit", () => {
    expect(displayColumnWidth("a\u0007b")).toBe(2);
    expect(displayColumnWidth("echo 中文", 5)).toBe(5); // e c h o space
    expect(displayColumnWidth("中文abc", 2)).toBe(4);
    expect(displayColumnWidth("abc", 0)).toBe(0);
    expect(displayColumnWidth("abc", -1)).toBe(0);
  });
});

describe("lintShellLine: silent on clean / ambiguous lines", () => {
  it("returns no issues for ordinary commands", () => {
    expect(lintShellLine("ls -la")).toEqual([]);
    expect(lintShellLine("kubectl get pods -A | grep nginx")).toEqual([]);
    expect(lintShellLine("echo 'it is fine'")).toEqual([]);
    expect(lintShellLine('echo "$(ls)"')).toEqual([]);
    expect(lintShellLine("grep -E 'a|b' file")).toEqual([]);
  });

  it("ignores a comment containing an unmatched quote", () => {
    expect(lintShellLine("echo hi # it's a note")).toEqual([]);
    expect(lintShellLine("echo foo#bar")).toEqual([]);
  });

  it("stays silent on a quote that was just opened (normal typing state)", () => {
    expect(lintShellLine("echo '")).toEqual([]);
    expect(lintShellLine('echo "   ')).toEqual([]);
    expect(lintShellLine("echo $(")).toEqual([]);
  });

  it("fails closed on heredoc, control chars, replacement chars and oversize", () => {
    expect(lintShellLine("cat <<EOF 'unclosed")).toEqual([]);
    expect(lintShellLine("echo \u0007'x")).toEqual([]);
    expect(lintShellLine("echo \ufffd'x")).toEqual([]);
    expect(lintShellLine("echo '" + "x".repeat(SHELL_LINT_MAX_LINE))).toEqual([]);
    expect(lintShellLine("")).toEqual([]);
  });

  it("never flags valid trailing & (background) or ; (terminator)", () => {
    expect(lintShellLine("sleep 1 &")).toEqual([]);
    expect(lintShellLine("ls;")).toEqual([]);
    expect(lintShellLine("echo \\|")).toEqual([]);
  });
});

describe("lintShellLine: smart quotes", () => {
  it("flags IME curly quotes outside ASCII quotes with the right column", () => {
    const issues = lintShellLine("echo \u201chi\u201d");
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("smart-quote");
    expect(issues[0].severity).toBe("error");
    expect(issues[0].column).toBe(6);
    expect(issues[0].message).toContain("2");
  });

  it("uses display columns when full-width characters precede the error", () => {
    // e c h o space (5) + 中 (2) + 文 (2) + space (1) = 10, +1 => 11
    expect(lintShellLine("echo 中文 \u201cx\u201d")[0].column).toBe(11);
  });

  it("does not flag curly quotes that are legitimate string content", () => {
    expect(lintShellLine('echo "\u201chi\u201d"')).toEqual([]);
    expect(lintShellLine("echo '\u2018x\u2019'")).toEqual([]);
  });

  it("offers Chinese copy when requested", () => {
    expect(lintShellLine("echo \u201cx\u201d", "zh-CN")[0].message).toContain("智能引号");
    expect(lintShellLine("echo \u201cx\u201d", "en")[0].message).toContain("Smart quotes");
  });
});

describe("lintShellLine: unclosed openers", () => {
  it("reports an unclosed single quote at its column", () => {
    const issues = lintShellLine("echo 'hello");
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("unclosed-quote");
    expect(issues[0].severity).toBe("notice");
    expect(issues[0].column).toBe(6);
  });

  it("reports unclosed double quote, $(, ${, backtick and (", () => {
    expect(lintShellLine('echo "hello')[0].kind).toBe("unclosed-quote");
    expect(lintShellLine("echo $(ls")[0].kind).toBe("unclosed-substitution");
    expect(lintShellLine("echo ${HOME")[0].kind).toBe("unclosed-substitution");
    expect(lintShellLine("echo `ls")[0].kind).toBe("unclosed-substitution");
    expect(lintShellLine("(echo hi")[0].kind).toBe("unclosed-parenthesis");
  });

  it("reports only the outermost opener and never more than the cap", () => {
    const issues = lintShellLine("echo \"$(ls 'x");
    expect(issues.length).toBeLessThanOrEqual(SHELL_LINT_MAX_ISSUES);
    expect(issues.filter((i) => i.kind.startsWith("unclosed"))).toHaveLength(1);
  });

  it("does not treat escaped quotes as openers", () => {
    expect(lintShellLine("echo \\'hello")).toEqual([]);
    expect(lintShellLine('echo \\"hello')).toEqual([]);
  });

  it("keeps Chinese copy for openers", () => {
    expect(lintShellLine("echo 'hello", "zh-CN")[0].message).toContain("未闭合");
  });
});

describe("lintShellLine: dangling operators", () => {
  it("flags |, && and || with no following command", () => {
    expect(lintShellLine("ls |")[0].kind).toBe("dangling-operator");
    expect(lintShellLine("ls |   ")[0].column).toBe(4);
    expect(lintShellLine("make &&")[0].kind).toBe("dangling-operator");
    expect(lintShellLine("make ||")[0].kind).toBe("dangling-operator");
  });

  it("does not flag operators inside quotes or with a following command", () => {
    expect(lintShellLine('echo "a|"')).toEqual([]);
    expect(lintShellLine("ls | grep x")).toEqual([]);
    expect(lintShellLine("   |")).toEqual([]);
  });

  it("provides Chinese copy", () => {
    expect(lintShellLine("ls |", "zh-CN")[0].message).toContain("缺一条命令");
  });
});
