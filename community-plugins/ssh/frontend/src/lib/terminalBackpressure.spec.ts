// 大输出保护：迟滞阈值（128KiB 触发 / 64KiB 恢复）；次要工作 8KiB busy。
import { describe, expect, it } from "vitest";
import {
  createOutputGate,
  DEFAULT_RESUME_BYTES,
  DEFAULT_SECONDARY_BUSY_BYTES,
  DEFAULT_STRAINED_BYTES,
  isTerminalSecondaryBusy,
  resolveOutputGateThresholds,
  resolveOutputMode,
} from "./terminalBackpressure";

const KB = 1024;

describe("resolveOutputMode", () => {
  const thresholds = { strainedBytes: 128 * KB, resumeBytes: 64 * KB };

  it("stays normal below the engage threshold", () => {
    expect(resolveOutputMode("normal", 0, thresholds)).toBe("normal");
    expect(resolveOutputMode("normal", 127 * KB, thresholds)).toBe("normal");
  });

  it("engages strained at or above strainedBytes", () => {
    expect(resolveOutputMode("normal", 128 * KB, thresholds)).toBe("strained");
    expect(resolveOutputMode("normal", 10 * 1024 * KB, thresholds)).toBe("strained");
  });

  it("holds strained inside the hysteresis band", () => {
    expect(resolveOutputMode("strained", 127 * KB, thresholds)).toBe("strained");
    expect(resolveOutputMode("strained", 64 * KB, thresholds)).toBe("strained");
  });

  it("releases strained only below resumeBytes", () => {
    expect(resolveOutputMode("strained", 64 * KB - 1, thresholds)).toBe("normal");
    expect(resolveOutputMode("strained", 0, thresholds)).toBe("normal");
  });

  it("treats non-finite or negative backlogs as zero", () => {
    expect(resolveOutputMode("normal", Number.NaN, thresholds)).toBe("normal");
    expect(resolveOutputMode("normal", -5, thresholds)).toBe("normal");
    expect(resolveOutputMode("strained", Number.NaN, thresholds)).toBe("normal");
  });
});

describe("resolveOutputGateThresholds", () => {
  it("defaults to 128KiB / 64KiB", () => {
    expect(resolveOutputGateThresholds()).toEqual({
      strainedBytes: DEFAULT_STRAINED_BYTES,
      resumeBytes: DEFAULT_RESUME_BYTES,
    });
  });

  it("keeps valid custom values and caps resume at strained", () => {
    expect(resolveOutputGateThresholds({ strainedBytes: 300 * KB, resumeBytes: 100 * KB })).toEqual({
      strainedBytes: 300 * KB,
      resumeBytes: 100 * KB,
    });
    expect(resolveOutputGateThresholds({ strainedBytes: 10 * KB, resumeBytes: 500 * KB }).resumeBytes).toBe(10 * KB);
  });

  it("falls back on invalid values", () => {
    expect(resolveOutputGateThresholds({ strainedBytes: -1, resumeBytes: Number.NaN })).toEqual({
      strainedBytes: DEFAULT_STRAINED_BYTES,
      resumeBytes: DEFAULT_RESUME_BYTES,
    });
  });
});

describe("createOutputGate", () => {
  it("starts in normal mode and flips with hysteresis", () => {
    const gate = createOutputGate();
    expect(gate.mode).toBe("normal");
    expect(gate.feed(200 * KB)).toBe(true);
    expect(gate.mode).toBe("strained");
    expect(gate.feed(100 * KB)).toBe(false);
    expect(gate.mode).toBe("strained");
    expect(gate.feed(63 * KB)).toBe(true);
    expect(gate.mode).toBe("normal");
  });

  it("reset returns to normal mode", () => {
    const gate = createOutputGate();
    gate.feed(999 * KB);
    expect(gate.mode).toBe("strained");
    gate.reset();
    expect(gate.mode).toBe("normal");
    expect(gate.feed(128 * KB)).toBe(true);
  });
});

describe("isTerminalSecondaryBusy", () => {
  it("trips on strained even with an empty backlog", () => {
    expect(isTerminalSecondaryBusy({ gateMode: "strained", backlogBytes: 0 })).toBe(true);
  });

  it("trips at the secondary threshold without needing strained", () => {
    expect(
      isTerminalSecondaryBusy({ gateMode: "normal", backlogBytes: DEFAULT_SECONDARY_BUSY_BYTES }),
    ).toBe(true);
  });

  it("stays quiet for a small keystroke-sized backlog", () => {
    expect(isTerminalSecondaryBusy({ gateMode: "normal", backlogBytes: 192 })).toBe(false);
  });
});
