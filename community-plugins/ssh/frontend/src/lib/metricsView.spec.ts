import { describe, expect, it } from "vitest";
import {
  filterDiskMounts,
  filterNetworkInterfaces,
  resourceLevel,
  summarizeResourceStrip,
} from "./metricsView";

describe("filterDiskMounts", () => {
  it("drops zero-capacity rows (pseudo filesystems / parse ghosts)", () => {
    const rows = filterDiskMounts([
      { mount: "/", totalBytes: 40_000, usedBytes: 17_000, percentUsed: 44 },
      { mount: "(OpenAnolis", totalBytes: 0, usedBytes: 0, percentUsed: 0 },
    ]);
    expect(rows.map((r) => r.mount)).toEqual(["/"]);
  });

  it("dedupes identical capacity fingerprints, keeping the shortest mount", () => {
    const rows = filterDiskMounts([
      { mount: "/var/lib/docker/overlay2/ab3f", totalBytes: 40_000, usedBytes: 17_000, percentUsed: 44 },
      { mount: "/", totalBytes: 40_000, usedBytes: 17_000, percentUsed: 44 },
      { mount: "/var/lib/docker/overlay2/cd91", totalBytes: 40_000, usedBytes: 17_000, percentUsed: 44 },
    ]);
    expect(rows.map((r) => r.mount)).toEqual(["/"]);
  });

  it("sorts by usage descending", () => {
    const rows = filterDiskMounts([
      { mount: "/boot/efi", totalBytes: 200, usedBytes: 6, percentUsed: 3 },
      { mount: "/", totalBytes: 40_000, usedBytes: 17_000, percentUsed: 44 },
      { mount: "/data", totalBytes: 100_000, usedBytes: 85_000, percentUsed: 87 },
    ]);
    expect(rows.map((r) => r.mount)).toEqual(["/data", "/", "/boot/efi"]);
  });

  it("keeps distinct mounts on the same filesystem when usage differs", () => {
    const rows = filterDiskMounts([
      { mount: "/", totalBytes: 40_000, usedBytes: 17_000, percentUsed: 44 },
      { mount: "/dev/shm", totalBytes: 900, usedBytes: 0, percentUsed: 0 },
    ]);
    expect(rows).toHaveLength(2);
  });

  it("returns [] for null/garbage input", () => {
    expect(filterDiskMounts(null)).toEqual([]);
    expect(filterDiskMounts([null as never, {} as never])).toEqual([]);
  });
});

describe("filterNetworkInterfaces", () => {
  it("hides idle virtual interfaces but keeps busy ones and physical nics", () => {
    const rows = filterNetworkInterfaces([
      { name: "eth0", rxRate: 0, txRate: 0 },
      { name: "lo", rxRate: 0, txRate: 0 },
      { name: "veth123", rxRate: 0, txRate: 0 },
      { name: "br-39c0", rxRate: 0, txRate: 200 },
    ]);
    expect(rows.map((r) => r.name)).toEqual(["eth0", "br-39c0"]);
  });

  it("falls back to the full list when everything would be hidden", () => {
    const rows = filterNetworkInterfaces([
      { name: "lo", rxRate: 0, txRate: 0 },
      { name: "veth123", rxRate: 0, txRate: 0 },
    ]);
    expect(rows).toHaveLength(2);
  });

  it("returns [] for null input", () => {
    expect(filterNetworkInterfaces(undefined)).toEqual([]);
  });
});

describe("resourceLevel", () => {
  it("classifies ok / warn / critical and unknown", () => {
    expect(resourceLevel(10, 80, 90)).toBe("ok");
    expect(resourceLevel(80, 80, 90)).toBe("warn");
    expect(resourceLevel(95, 80, 90)).toBe("critical");
    expect(resourceLevel(null, 80, 90)).toBe("unknown");
    expect(resourceLevel(Number.NaN, 80, 90)).toBe("unknown");
  });
});

describe("summarizeResourceStrip", () => {
  it("summarizes cpu/mem/hottest disk/net totals with levels", () => {
    const summary = summarizeResourceStrip({
      cpu: { percent: 42 },
      memory: { totalBytes: 1000, usedBytes: 900 },
      disks: [
        { mount: "/", totalBytes: 100, usedBytes: 40, percentUsed: 40 },
        { mount: "/data", totalBytes: 200, usedBytes: 190, percentUsed: 95 },
      ],
      network: [
        { name: "eth0", rxRate: 100, txRate: 50 },
        { name: "lo", rxRate: 0, txRate: 0 },
      ],
    });
    expect(summary.cpuPercent).toBe(42);
    expect(summary.memPercent).toBe(90);
    expect(summary.diskPercent).toBe(95);
    expect(summary.diskMount).toBe("/data");
    expect(summary.rxRate).toBe(100);
    expect(summary.txRate).toBe(50);
    expect(summary.cpuLevel).toBe("ok");
    expect(summary.memLevel).toBe("warn");
    expect(summary.diskLevel).toBe("critical");
  });

  it("returns nulls/zeros for empty metrics", () => {
    const summary = summarizeResourceStrip(undefined);
    expect(summary.cpuPercent).toBeNull();
    expect(summary.memPercent).toBeNull();
    expect(summary.diskPercent).toBeNull();
    expect(summary.diskMount).toBeNull();
    expect(summary.rxRate).toBe(0);
    expect(summary.txRate).toBe(0);
    expect(summary.cpuLevel).toBe("unknown");
  });
});
