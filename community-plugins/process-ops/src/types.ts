export type TargetKind = 'local' | 'ssh';
export type TargetRole = 'bastion' | 'host';
export type TargetStatus = 'ready' | 'degraded' | 'failed' | 'unknown';

export interface HostTarget {
  id: string;
  displayName: string;
  kind: TargetKind;
  /** bastion jump host vs service host (default host) */
  role?: TargetRole;
  /** Bastion target id for ProxyJump */
  via?: string;
  /** When via is set: reuse bastion user/key/password for the inner hop (default true). */
  useBastionAuth?: boolean;
  /** Bastion flavor: classic ssh jump vs JumpServer/KoKo */
  bastionKind?: 'ssh' | 'jumpserver';
  /** JumpServer HTTP API port (default 801) */
  webPort?: number;
  /** JumpServer Opt> menu id from discover */
  menuId?: string;
  host?: string;
  port?: number;
  user?: string;
  /** In-memory secrets (also mirrored to vault when rememberSecrets) */
  password?: string;
  privateKey?: string;
  passphrase?: string;
  status?: TargetStatus;
  statusMessage?: string;
  /** Live metrics polling for this host */
  monitoring?: boolean;
  /** Persist secrets to workbench storage (opt-in) */
  rememberSecrets?: boolean;
  /** base64(ssh public key marshal) */
  trustedHostKey?: string;
  hostKeyFingerprint?: string;
  /** Last quiet overview alerts */
  alertCpu?: boolean;
  alertMem?: boolean;
  alertDisk?: boolean;
  lastCpu?: number;
  lastMem?: number;
}

export interface DiscoverItem {
  host: string;
  port?: number;
  name?: string;
  user?: string;
  source?: string;
  menuId?: string;
  assetId?: string;
  comment?: string;
}

export interface Overview {
  targetId: string;
  kind: TargetKind;
  os: string;
  hostname: string;
  uptimeSec: number;
  cpuPercent: number;
  cpuCount: number;
  load1: number;
  load5: number;
  load15: number;
  memTotal: number;
  memUsed: number;
  memAvailable: number;
  memPercent: number;
  disks: DiskInfo[];
  network: NetInfo[];
  collectedAt: string;
  linuxCapable: boolean;
}

export interface DiskInfo {
  mount: string;
  device: string;
  fstype?: string;
  total: number;
  used: number;
  free: number;
  usedPercent: number;
}

export interface NetInfo {
  name: string;
  rx: number;
  tx: number;
}

export interface ProcessInfo {
  pid: number;
  ppid: number;
  name: string;
  user: string;
  cpu: number;
  mem: number;
  memRss: number;
  cmd: string;
  status?: string;
}

export interface ServiceInfo {
  unit: string;
  load: string;
  active: string;
  sub: string;
  description: string;
}

export interface DiagnoseFinding {
  severity: 'info' | 'warn' | 'critical';
  code: string;
  title: string;
  detail: string;
}

export interface DiagnoseReport {
  targetId: string;
  collectedAt: string;
  summary: string;
  findings: DiagnoseFinding[];
  topCpu: ProcessInfo[];
  topMem: ProcessInfo[];
  oomSnippet?: string;
  overview?: Overview;
}

/** One-shot Java / Spring Boot incident capture (jstack + GC + host OOM). */
export interface JvmSnapshot {
  targetId: string;
  pid: number;
  mainClass?: string;
  cmd?: string;
  cpu?: number;
  mem?: number;
  tools?: string[];
  heapInfo?: string;
  gcUtil?: string;
  threadSummary?: string;
  threadDump?: string;
  oomSnippet?: string;
  notes?: string[];
  collectedAt: string;
  javaCandidates?: ProcessInfo[];
}

export interface HistorySample {
  ts: number;
  value: number;
}

export interface LogEntry {
  ts: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}
