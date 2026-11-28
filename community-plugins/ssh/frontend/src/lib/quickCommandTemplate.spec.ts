import { describe, expect, it } from "vitest";
import {
  TEMPLATE_VALUE_MAX_LENGTH,
  defaultTemplateValues,
  parseQuickCommandTemplate,
  renderQuickCommandTemplate,
  sanitizeTemplateValue,
} from "./quickCommandTemplate";

describe("parseQuickCommandTemplate", () => {
  it("解析单个变量", () => {
    const parsed = parseQuickCommandTemplate("echo {{msg}}");
    expect(parsed.hasVariables).toBe(true);
    expect(parsed.unclosed).toBe(false);
    expect(parsed.variables).toEqual([{ name: "msg", occurrences: 1 }]);
  });

  it("多个变量按首次出现顺序去重并统计次数", () => {
    const parsed = parseQuickCommandTemplate("ssh {{user}}@{{host}} scp {{host}}:/tmp/x .");
    expect(parsed.variables.map((v) => v.name)).toEqual(["user", "host"]);
    expect(parsed.variables[1].occurrences).toBe(2);
  });

  it("支持 {{name=default}}，默认值去首尾空白", () => {
    const parsed = parseQuickCommandTemplate("curl -p {{ port = 8080  }} localhost");
    expect(parsed.variables).toEqual([{ name: "port", defaultValue: "8080", occurrences: 1 }]);
  });

  it("无变量时 hasVariables=false", () => {
    expect(parseQuickCommandTemplate("ls -la").hasVariables).toBe(false);
  });

  it("不把 shell 合法语法误判为占位符", () => {
    for (const command of [
      "echo ${HOME}",
      "echo $1 $2",
      "printf '{a,b}'",
      "awk '{ print $1 }'",
      "echo {{}",
    ]) {
      expect(parseQuickCommandTemplate(command).hasVariables, command).toBe(false);
    }
  });

  it("非法变量名不匹配", () => {
    expect(parseQuickCommandTemplate("echo {{1bad}}").hasVariables).toBe(false);
    expect(parseQuickCommandTemplate("echo {{a b}}").hasVariables).toBe(false);
    expect(parseQuickCommandTemplate("echo {{}}").hasVariables).toBe(false);
  });

  it("检测到未闭合的 {{，只报告不改写", () => {
    const parsed = parseQuickCommandTemplate("echo {{foo");
    expect(parsed.unclosed).toBe(true);
    expect(parsed.hasVariables).toBe(false);
  });

  it("已闭合与未闭合混合时仍报告 unclosed", () => {
    const parsed = parseQuickCommandTemplate("{{ok}} {{broken");
    expect(parsed.variables).toHaveLength(1);
    expect(parsed.unclosed).toBe(true);
  });

  it("变量名允许连字符与下划线", () => {
    expect(parseQuickCommandTemplate("echo {{target_host-1}}").variables[0].name).toBe("target_host-1");
  });
});

describe("renderQuickCommandTemplate", () => {
  it("替换全部变量（含重复出现）", () => {
    const rendered = renderQuickCommandTemplate("ssh {{user}}@{{host}} -p {{port}}", {
      user: "root", host: "10.0.0.1", port: "2222",
    });
    expect(rendered.text).toBe("ssh root@10.0.0.1 -p 2222");
    expect(rendered.unresolved).toEqual([]);
  });

  it("未填写时回落到默认值", () => {
    const rendered = renderQuickCommandTemplate("curl {{port=8080}} localhost", {});
    expect(rendered.text).toBe("curl 8080 localhost");
    expect(rendered.unresolved).toEqual([]);
  });

  it("显式填入的值覆盖默认值", () => {
    expect(renderQuickCommandTemplate("curl {{port=8080}}", { port: "9090" }).text).toBe("curl 9090");
  });

  it("无默认且未填的变量列入 unresolved，且不把 {{…}} 发进命令", () => {
    const rendered = renderQuickCommandTemplate("ssh {{user}}@{{host}}", { user: "root" });
    expect(rendered.unresolved).toEqual(["host"]);
    expect(rendered.text).not.toContain("{{");
    expect(rendered.text).toBe("ssh root@");
  });

  it("同一变量缺失只报告一次", () => {
    expect(renderQuickCommandTemplate("{{x}} {{x}} {{x}}", {}).unresolved).toEqual(["x"]);
  });

  it("未闭合的 {{ 原样保留", () => {
    expect(renderQuickCommandTemplate("echo {{foo", {}).text).toBe("echo {{foo");
  });

  it("非模板命令原样返回", () => {
    expect(renderQuickCommandTemplate("ls -la", {}).text).toBe("ls -la");
  });
});

describe("sanitizeTemplateValue", () => {
  it("剥离 CR/LF，防止通过参数注入第二条命令", () => {
    expect(sanitizeTemplateValue("root\r\nrm -rf /")).toBe("rootrm -rf /");
  });

  it("剥离控制字符但保留普通空格", () => {
    expect(sanitizeTemplateValue("a\u0000b\u0007 c")).toBe("ab c");
  });

  it("按长度上限截断", () => {
    expect(sanitizeTemplateValue("x".repeat(TEMPLATE_VALUE_MAX_LENGTH + 50)).length).toBe(TEMPLATE_VALUE_MAX_LENGTH);
  });

  it("中文与 emoji 原样保留", () => {
    expect(sanitizeTemplateValue("报表-2026")).toBe("报表-2026");
  });
});

describe("defaultTemplateValues", () => {
  it("有默认值的预填、无默认值的留空", () => {
    const parsed = parseQuickCommandTemplate("ssh {{user}}@{{host}} -p {{port=22}}");
    expect(defaultTemplateValues(parsed)).toEqual({ user: "", host: "", port: "22" });
  });
});
