import { describe, expect, it } from "vitest";
import { buildPasteConfirmation, inspect } from "./dangerousCommands";

describe("buildPasteConfirmation — 全角 / 智能标点纠错接线", () => {
  it("纯 ASCII 短文本不需要确认，也不产生纠错方案", () => {
    const result = buildPasteConfirmation("ls -la");
    expect(result.required).toBe(false);
    expect(result.glyphOnly).toBe(false);
    expect(result.glyphFix).toBeUndefined();
  });

  it("短命令里的智能引号也会触发确认（最常见的复制粘贴场景）", () => {
    const result = buildPasteConfirmation("echo \u201chi\u201d");
    expect(result.required).toBe(true);
    expect(result.glyphOnly).toBe(true);
    expect(result.glyphFix?.fixed).toBe('echo "hi"');
    expect(result.glyphFix?.details.length).toBeGreaterThan(0);
  });

  it("全角空格同样触发确认", () => {
    expect(buildPasteConfirmation("echo\u3000hi").glyphFix?.fixed).toBe("echo hi");
  });

  it("正常中文路径不触发纠错（避免误报）", () => {
    const result = buildPasteConfirmation("ls /数据/报表");
    expect(result.required).toBe(false);
    expect(result.glyphFix).toBeUndefined();
  });

  it("危险命令 + 智能标点：danger 优先，且仍提供纠错选项", () => {
    const result = buildPasteConfirmation("rm -rf /tmp/\u201cbuild\u201d");
    expect(result.danger).toBe(true);
    expect(result.glyphOnly).toBe(false);
    expect(result.glyphFix?.fixed).toBe('rm -rf /tmp/"build"');
  });

  it("多行文本：glyphOnly 为 false，逐行仍可纠错", () => {
    const result = buildPasteConfirmation('echo "第一行\u2013不改"\nls \u2013a');
    expect(result.glyphOnly).toBe(false);
    expect(result.required).toBe(true);
    expect(result.glyphFix?.fixed).toBe('echo "第一行\u2013不改"\nls -a');
  });

  it("超过 200 字符的大文本：glyphOnly 为 false", () => {
    const result = buildPasteConfirmation(`echo ${"x".repeat(200)}\u2013`);
    expect(result.chars).toBeGreaterThanOrEqual(200);
    expect(result.glyphOnly).toBe(false);
    expect(result.required).toBe(true);
  });

  it("heredoc / 命令替换等不安全形态整段不纠错", () => {
    const result = buildPasteConfirmation("cat <<EOF \u2013\nsome text\nEOF");
    expect(result.glyphFix).toBeUndefined();
    expect(result.required).toBe(true);
  });

  it("纠错方案绝不附带回车（执行键仍归用户）", () => {
    const fixed = buildPasteConfirmation("echo \u201chi\u201d").glyphFix?.fixed ?? "";
    expect(fixed).not.toMatch(/[\r\n]/);
  });

  it("预览仍展示原文，用户可对照选择", () => {
    const text = "echo \u201chi\u201d";
    expect(buildPasteConfirmation(text).preview).toBe(text);
  });
});

describe("inspect — 危险命令规则不因纠错接线漂移", () => {
  it("精确命中破坏性形态", () => {
    expect(inspect("rm -rf /tmp/build").level).toBe("danger");
  });

  it("不误杀普通 rm", () => {
    expect(inspect("rm foo.tmp").level).toBe("none");
  });
});
