import { describe, expect, it } from "vitest";
import {
  GLYPH_FIX_MAX_BYTES,
  advanceShellPrefix,
  initialShellPrefixState,
  inspectInputGlyphs,
  suggestAsciiFix,
} from "./terminalGlyphFix";

const ok = (text: string) => inspectInputGlyphs("", text);

describe("inspectInputGlyphs — 字符映射", () => {
  it("把全角空格与 NBSP 换成普通空格", () => {
    const result = ok("echo\u3000hi\u00a0there");
    expect(result.applicable).toBe(true);
    expect(result.fixed).toBe("echo hi there");
    expect(result.replacements.map((r) => r.codePoint)).toEqual([0x3000, 0x00a0]);
  });

  it.each([
    [0x2010, "‐"], [0x2011, "‑"], [0x2012, "‒"], [0x2013, "–"],
    [0x2014, "—"], [0x2212, "−"], [0xfe63, "﹣"], [0xff0d, "－"],
  ])("把 U+%s 类减号换成 ASCII 连字符", (codePoint, char) => {
    const result = ok(`ls ${char}a`);
    expect(result.applicable).toBe(true);
    expect(result.fixed).toBe("ls -a");
    expect(result.replacements[0].codePoint).toBe(codePoint);
  });

  it("把成对智能双引号换成 ASCII 双引号", () => {
    const result = ok("echo \u201chi\u201d");
    expect(result.fixed).toBe('echo "hi"');
    expect(result.replacements).toHaveLength(2);
  });

  it("把成对智能单引号换成 ASCII 单引号", () => {
    expect(ok("echo \u2018hi\u2019").fixed).toBe("echo 'hi'");
  });

  it("复杂命令一次修正全部排版字符，且字符数守恒", () => {
    const input = "curl\u3000\u2013X POST \u201chttps://a.test\u201d \u2014d \u2018x=1\u2019";
    const result = ok(input);
    expect(result.fixed).toBe('curl -X POST "https://a.test" -d \'x=1\'');
    expect(result.fixed.length).toBe(input.length);
    expect(result.replacements.length).toBeGreaterThan(3);
  });

  it("纯 ASCII 不产生建议（reason=no-change）", () => {
    const result = ok("git status --short");
    expect(result.applicable).toBe(false);
    expect(result.reason).toBe("no-change");
    expect(result.fixed).toBe("git status --short");
  });

  it("正常中文路径不改写（只处理排版字符）", () => {
    expect(ok("ls /数据/报表").applicable).toBe(false);
  });

  it("replacements 按码点去重且保留首次顺序", () => {
    const result = ok("\u2013\u2013\u3000\u2013");
    expect(result.replacements.map((r) => r.codePoint)).toEqual([0x2013, 0x3000]);
    expect(result.replacements[0].detail).toContain("U+2013");
    expect(result.replacements[0].detail).toContain("U+002D");
  });
});

describe("inspectInputGlyphs — 保守守卫", () => {
  it("双引号内是数据，不纠错", () => {
    expect(ok('echo "中文\u2013破折号"').applicable).toBe(false);
  });

  it("单引号内是数据，不纠错", () => {
    expect(ok("echo '\u2018quoted\u2019'").applicable).toBe(false);
  });

  it("注释起始（# 在 token 边界）之后不纠错", () => {
    expect(ok("# 说明\u2013不要改").applicable).toBe(false);
    expect(ok("echo ok # 注释\u2014不改").fixed).toBe("echo ok # 注释—不改");
  });

  it("token 中间的 # 不算注释", () => {
    expect(ok("echo foo#bar\u2013x").fixed).toBe("echo foo#bar-x");
  });

  it("转义后的字符不纠错", () => {
    expect(ok("echo \\\u2013x").applicable).toBe(false);
  });

  it.each([
    ["反引号", "echo `\u2013`"],
    ["命令替换 $( ", "echo $(\u2013)"],
    ["算术展开 $[", "echo $[\u2013]"],
    ["参数展开 ${", "echo ${\u2013}"],
    ["heredoc <<", "cat <<EOF \u2013"],
    ["fork bomb ({", ":(){\u2013}"],
  ])("%s 整段放弃纠错", (_label, text) => {
    const result = ok(text);
    expect(result.applicable).toBe(false);
    expect(result.reason).toBe("unsafe");
    expect(result.fixed).toBe(text);
  });

  it.each(["\u0000", "\u0007", "\u001b", "\u007f"])("控制字符 %s 放弃纠错", (control) => {
    expect(ok(`echo ${control}\u2013`).reason).toBe("unsafe");
  });

  it("非法 UTF-8 替换字符放弃纠错", () => {
    expect(ok("echo \uFFFD\u2013").reason).toBe("invalid-utf8");
  });

  it("超过字节上限放弃纠错", () => {
    const long = "a".repeat(GLYPH_FIX_MAX_BYTES + 1) + "\u2013";
    const result = ok(long);
    expect(result.reason).toBe("too-long");
    expect(result.fixed).toBe(long);
  });

  it("prefix 里未闭合的引号延续到 value，value 不纠错", () => {
    const result = inspectInputGlyphs('echo "尚未闭合', "\u2013 后面");
    expect(result.applicable).toBe(false);
  });

  it("prefix 里的注释延续到 value", () => {
    expect(inspectInputGlyphs("# 注释", " \u2013 不改").applicable).toBe(false);
  });

  it("多行粘贴逐行重置状态（第二行仍可纠错）", () => {
    const result = ok('echo "第一行\u2013不改"\nls \u2013a');
    expect(result.fixed).toBe('echo "第一行\u2013不改"\nls -a');
    expect(result.applicable).toBe(true);
  });
});

describe("advanceShellPrefix", () => {
  it("进入 / 退出双引号", () => {
    let state = initialShellPrefixState();
    state = advanceShellPrefix(state, '"');
    expect(state.quote).toBe('"');
    state = advanceShellPrefix(state, "a");
    expect(state.quote).toBe('"');
    state = advanceShellPrefix(state, '"');
    expect(state.quote).toBeNull();
  });

  it("换行重置全部状态", () => {
    let state = initialShellPrefixState();
    state = advanceShellPrefix(state, '"');
    state = advanceShellPrefix(state, "#");
    expect(advanceShellPrefix(state, "\n")).toEqual(initialShellPrefixState());
  });

  it("backslash 只转义下一个字符", () => {
    let state = initialShellPrefixState();
    state = advanceShellPrefix(state, "\\");
    expect(state.escaped).toBe(true);
    state = advanceShellPrefix(state, '"');
    expect(state.escaped).toBe(false);
    expect(state.quote).toBeNull();
  });
});

describe("suggestAsciiFix", () => {
  it("等价于空 prefix 的 inspect", () => {
    expect(suggestAsciiFix("ls \u2013a")).toEqual(inspectInputGlyphs("", "ls \u2013a"));
  });

  it("fixed 绝不附带回车（执行键仍归用户）", () => {
    expect(suggestAsciiFix("ls \u2013a").fixed).not.toMatch(/[\r\n]/);
  });
});
