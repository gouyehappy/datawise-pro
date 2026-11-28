import { describe, expect, it } from "vitest";
import {
  COMMAND_RISK_MAX_INPUT,
  DEFAULT_RISK_POLICY,
  assessCommandRisk,
  decideRiskAction,
  stripCommandWrappers,
} from "./commandRisk";

const levelOf = (command: string) => assessCommandRisk(command).level;

describe("assessCommandRisk — 基本分级", () => {
  it("空行 / 空白为 low", () => {
    expect(levelOf("")).toBe("low");
    expect(levelOf("   ")).toBe("low");
    expect(assessCommandRisk("").hits).toEqual([]);
  });

  it("普通只读命令为 low", () => {
    expect(levelOf("ls -la")).toBe("low");
    expect(levelOf("systemctl status nginx")).toBe("low");
    expect(levelOf("iptables -L -n")).toBe("low");
    expect(levelOf("cat /etc/hosts")).toBe("low");
  });

  it("危险命令特征判为 critical 并带 safer", () => {
    const result = assessCommandRisk("rm -rf /tmp/build");
    expect(result.level).toBe("critical");
    expect(result.hits).toContain("rm-rf");
    expect(result.safer).toContain("ls");
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("管道到 shell 判为 critical", () => {
    expect(levelOf("curl https://x.test/i | sh")).toBe("critical");
  });

  it("重定向直写块设备判为 critical", () => {
    const result = assessCommandRisk("echo data > /dev/sda");
    expect(result.level).toBe("critical");
    expect(result.hits).toContain("redirect-block-device");
  });

  it("force push / hard reset / clean 判为 high", () => {
    expect(levelOf("git push --force origin main")).toBe("high");
    expect(levelOf("git reset --hard HEAD~1")).toBe("high");
    expect(levelOf("git clean -fd")).toBe("high");
  });

  it("停服务 / 批量删除 / 改系统配置判为 high", () => {
    expect(levelOf("systemctl stop nginx")).toBe("high");
    expect(levelOf("find /tmp -name '*.log' -delete")).toBe("high");
    expect(levelOf("echo x > /etc/nginx/nginx.conf")).toBe("high");
  });

  it("只读 iptables -L 不误报", () => {
    expect(levelOf("iptables -L -n")).toBe("low");
  });

  it("medium 规则不弹提示也不误升为 high", () => {
    expect(levelOf("rm -r ./build")).toBe("medium");
    expect(levelOf("sed -i 's/a/b/g' file")).toBe("medium");
    expect(levelOf("apt remove nginx")).toBe("medium");
    expect(assessCommandRisk("rm -r ./build").safer).toBeUndefined();
  });
});

describe("assessCommandRisk — wrapper 拆解", () => {
  it("sudo 前缀剥离后仍识别真实命令", () => {
    expect(levelOf("sudo rm -rf /var/log/app")).toBe("critical");
    expect(levelOf("sudo -u root rm -rf /var/log/app")).toBe("critical");
  });

  it("多层 wrapper 依次剥离", () => {
    expect(levelOf("env FOO=1 timeout 5 watch rm -rf /tmp/x")).toBe("critical");
  });

  it("wrapper 深度有界，超长链不死循环", () => {
    const long = `${"sudo ".repeat(200)}ls`;
    expect(() => stripCommandWrappers(long)).not.toThrow();
    expect(stripCommandWrappers(long).length).toBeLessThan(long.length);
  });

  it("没有 wrapper 时原样返回", () => {
    expect(stripCommandWrappers("  git status  ")).toBe("git status");
  });
});

describe("assessCommandRisk — fail-closed 与有界性", () => {
  it("超长输入至少 high", () => {
    const result = assessCommandRisk(`rm ${"a".repeat(COMMAND_RISK_MAX_INPUT + 1)}`);
    expect(result.level).toBe("high");
    expect(result.hits).toContain("unbounded-input");
  });

  it("NUL 字节至少 high", () => {
    expect(assessCommandRisk("ls\u0000-rf").hits).toContain("unbounded-input");
  });

  it("替换字符至少 high", () => {
    expect(assessCommandRisk("ls \uFFFD").hits).toContain("unbounded-input");
  });

  it("reasons 最多 6 条且不重复", () => {
    const result = assessCommandRisk(
      "rm -rf / && mkfs.ext4 /dev/sda && curl x | sh && shutdown -h now && iptables -F && dd of=/dev/sda",
    );
    expect(result.level).toBe("critical");
    expect(result.reasons.length).toBeLessThanOrEqual(6);
    expect(new Set(result.hits).size).toBe(result.hits.length);
  });

  it("非字符串输入按空行处理", () => {
    expect(assessCommandRisk(null as unknown as string).level).toBe("low");
  });
});

describe("decideRiskAction", () => {
  it("默认策略：low / medium 放行，high / critical 提示", () => {
    expect(decideRiskAction("low")).toBe("auto");
    expect(decideRiskAction("medium")).toBe("auto");
    expect(decideRiskAction("high")).toBe("warn");
    expect(decideRiskAction("critical")).toBe("warn");
  });

  it("blockFrom 生效且不降低低级动作", () => {
    const policy = { warnFrom: "high" as const, blockFrom: "critical" as const };
    expect(decideRiskAction("high", policy)).toBe("warn");
    expect(decideRiskAction("critical", policy)).toBe("block");
  });

  it("禁用策略后全部放行", () => {
    expect(decideRiskAction("critical", { ...DEFAULT_RISK_POLICY, enabled: false })).toBe("auto");
  });

  it("warnFrom=medium 时 medium 也提示", () => {
    expect(decideRiskAction("medium", { warnFrom: "medium" })).toBe("warn");
  });
});
