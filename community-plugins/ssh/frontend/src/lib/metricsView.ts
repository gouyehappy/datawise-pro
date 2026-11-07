// 指标面板视图层去噪（纯函数，不连 SSH）。
//
// 真机 df/ip 输出里充满伪文件系统（/dev、/sys/fs/cgroup）、docker overlay
// 重复行（同一设备统计重复 N 次）和零流量虚拟网卡（veth/br-/lo）——原样
// 渲染会把真实挂载点和物理网卡淹没。这里做视图层过滤/去重/排序，
// 不改后端采集语义。

export interface DiskMountView {
  mount: string;
  filesystem?: string;
  totalBytes?: number;
  usedBytes?: number;
  percentUsed?: number;
}

export interface NetworkInterfaceView {
  name: string;
  rxRate?: number;
  txRate?: number;
}

// 虚拟/回退网卡前缀：零流量时折叠，有流量仍展示（在跑容器的人要看）。
const VIRTUAL_NET_PREFIX = /^(lo|veth|br-|docker|virbr|tailscale|utun)/;

/** 磁盘行去噪：丢弃零容量行，相同容量指纹的重复行只留挂载点最短的一条，按占用率降序。 */
export function filterDiskMounts<T extends DiskMountView>(disks: T[] | null | undefined): T[] {
  if (!Array.isArray(disks)) return [];
  const seen = new Map<string, T>();
  for (const disk of disks) {
    if (!disk || typeof disk.mount !== "string" || !disk.mount) continue;
    if (!(disk.totalBytes && disk.totalBytes > 0)) continue;
    // 容量指纹：同一设备被多次挂载（docker overlay2、bind mount）时
    // total/used 完全相同，留挂载点最短的那条（通常是真实挂载点）。
    const fingerprint = `${disk.totalBytes}:${disk.usedBytes ?? 0}`;
    const existing = seen.get(fingerprint);
    if (!existing || disk.mount.length < existing.mount.length) {
      seen.set(fingerprint, disk);
    }
  }
  return [...seen.values()].sort(
    (a, b) => (b.percentUsed ?? 0) - (a.percentUsed ?? 0),
  );
}

/** 网卡行去噪：零流量的虚拟网卡折叠；全部折叠时返回原列表（避免空区的困惑）。 */
export function filterNetworkInterfaces<T extends NetworkInterfaceView>(
  interfaces: T[] | null | undefined,
): T[] {
  if (!Array.isArray(interfaces)) return [];
  const visible = interfaces.filter(
    (net) =>
      !VIRTUAL_NET_PREFIX.test(net.name) ||
      (net.rxRate ?? 0) > 0 ||
      (net.txRate ?? 0) > 0,
  );
  return visible.length > 0 ? visible : interfaces;
}

/** 资源条阈值档位：对齐运维巡检常见警戒线（OpenOcta 类一眼态势）。 */
export type ResourceLevel = "ok" | "warn" | "critical" | "unknown";

export interface ResourceStripThresholds {
  cpuWarn: number;
  cpuCritical: number;
  memWarn: number;
  memCritical: number;
  diskWarn: number;
  diskCritical: number;
}

/** 默认阈值：CPU 80/90 · 内存 85/95 · 磁盘 90/95。 */
export const DEFAULT_RESOURCE_STRIP_THRESHOLDS: ResourceStripThresholds = {
  cpuWarn: 80,
  cpuCritical: 90,
  memWarn: 85,
  memCritical: 95,
  diskWarn: 90,
  diskCritical: 95,
};

export interface ResourceStripSummary {
  cpuPercent: number | null;
  memPercent: number | null;
  diskPercent: number | null;
  diskMount: string | null;
  rxRate: number;
  txRate: number;
  cpuLevel: ResourceLevel;
  memLevel: ResourceLevel;
  diskLevel: ResourceLevel;
}

/** 百分比 → 档位；非有限值记为 unknown。 */
export function resourceLevel(
  percent: number | null | undefined,
  warnAt: number,
  criticalAt: number,
): ResourceLevel {
  if (percent == null || !Number.isFinite(percent)) return "unknown";
  if (percent >= criticalAt) return "critical";
  if (percent >= warnAt) return "warn";
  return "ok";
}

export interface ResourceStripMetricsInput {
  cpu?: { percent?: number | null } | null;
  memory?: { totalBytes?: number; usedBytes?: number } | null;
  disks?: DiskMountView[] | null;
  network?: NetworkInterfaceView[] | null;
}

/**
 * 从 metrics 快照提炼常驻资源条四元组（CPU / MEM / 最满磁盘 / 合计网速）。
 * 磁盘走 `filterDiskMounts` 去噪后取占用率最高的一条；网速对可见网卡求和。
 */
export function summarizeResourceStrip(
  metrics: ResourceStripMetricsInput | null | undefined,
  thresholds: ResourceStripThresholds = DEFAULT_RESOURCE_STRIP_THRESHOLDS,
): ResourceStripSummary {
  const cpuPercent =
    metrics?.cpu?.percent != null && Number.isFinite(metrics.cpu.percent)
      ? Number(metrics.cpu.percent)
      : null;

  const totalBytes = metrics?.memory?.totalBytes ?? 0;
  const usedBytes = metrics?.memory?.usedBytes ?? 0;
  const memPercent =
    totalBytes > 0 && Number.isFinite(usedBytes)
      ? (usedBytes / totalBytes) * 100
      : null;

  const disks = filterDiskMounts(metrics?.disks);
  const hottest = disks[0];
  const diskPercent =
    hottest?.percentUsed != null && Number.isFinite(hottest.percentUsed)
      ? Number(hottest.percentUsed)
      : null;

  const nets = filterNetworkInterfaces(metrics?.network);
  let rxRate = 0;
  let txRate = 0;
  for (const net of nets) {
    rxRate += net.rxRate ?? 0;
    txRate += net.txRate ?? 0;
  }

  return {
    cpuPercent,
    memPercent,
    diskPercent,
    diskMount: hottest?.mount ?? null,
    rxRate,
    txRate,
    cpuLevel: resourceLevel(cpuPercent, thresholds.cpuWarn, thresholds.cpuCritical),
    memLevel: resourceLevel(memPercent, thresholds.memWarn, thresholds.memCritical),
    diskLevel: resourceLevel(diskPercent, thresholds.diskWarn, thresholds.diskCritical),
  };
}
