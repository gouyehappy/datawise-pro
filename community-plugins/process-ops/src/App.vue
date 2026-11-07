<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { applyTheme, clipboardWrite, getPlugin, invoke, storageGet, storageSet } from './bridge';
import { formatBytes, formatPercent, formatUptime, shortPath, sparklinePath } from './format';
import {
  type AlertEvent,
  type AlertPrefs,
  defaultAlertPrefs,
  loadAlertHistory,
  loadAlertPrefs,
  loadSecretsVault,
  removeSecret,
  saveAlertHistory,
  saveAlertPrefs,
  upsertSecret,
} from './secrets';
import PoIcon from './PoIcon.vue';
import SshAuthFields from './SshAuthFields.vue';
import type {
  DiagnoseReport,
  DiscoverItem,
  HostTarget,
  HistorySample,
  JvmSnapshot,
  LogEntry,
  Overview,
  ProcessInfo,
  ServiceInfo,
  TargetRole,
} from './types';

const STORAGE_KEY = 'process-ops.hosts.v1';
const MONITOR_KEY = 'process-ops.monitor.v1';
const LAYOUT_KEY = 'process-ops.layout.v1';
const POLL_MS = 5000;
const PROC_LIMIT = 300;
const RAIL_MIN = 180;
const RAIL_MAX = 480;
const DOCK_MIN = 72;
const DOCK_MAX = 420;

interface HostCache {
  overview: Overview | null;
  cpuHistory: HistorySample[];
  memHistory: HistorySample[];
  processes: ProcessInfo[];
  services: ServiceInfo[];
  linuxCapable: boolean;
  servicesMessage: string;
  diagnose: DiagnoseReport | null;
}

function emptyCache(): HostCache {
  return {
    overview: null,
    cpuHistory: [],
    memHistory: [],
    processes: [],
    services: [],
    linuxCapable: true,
    servicesMessage: '',
    diagnose: null,
  };
}

const connectionId = ref('');
const locale = ref('en');
const hosts = ref<HostTarget[]>([]);
const selectedId = ref('localhost');
const hostQuery = ref('');
const tab = ref<'overview' | 'processes' | 'services' | 'diagnose' | 'console'>('overview');
const consoleCmd = ref('');
const consoleBusy = ref(false);
const consoleHistory = ref<{ ts: number; command: string; exitCode: number; output: string }[]>([]);
const logSource = ref('syslog');
const logBusy = ref(false);
const logContent = ref('');
type ConsoleSnap = {
  history: { ts: number; command: string; exitCode: number; output: string }[];
  logContent: string;
  logSource: string;
  cmd: string;
};
const consoleByHost = ref<Record<string, ConsoleSnap>>({});
const loading = ref(false);
const synced = ref(false);
const overview = ref<Overview | null>(null);
const cpuHistory = ref<HistorySample[]>([]);
const memHistory = ref<HistorySample[]>([]);
const processes = ref<ProcessInfo[]>([]);
const procQuery = ref('');
const procSort = ref<'cpu' | 'mem' | 'pid' | 'name'>('cpu');
const services = ref<ServiceInfo[]>([]);
const svcQuery = ref('');
const linuxCapable = ref(true);
const servicesMessage = ref('');
const allowDanger = ref(false);
const diagnose = ref<DiagnoseReport | null>(null);
const jvmSnap = ref<JvmSnapshot | null>(null);
const jvmBusy = ref(false);
const showJvm = ref(false);
const logs = ref<LogEntry[]>([]);
const dockOpen = ref(true);
const dockTab = ref<'output' | 'alerts'>('output');
const railWidth = ref(248);
const dockHeight = ref(132);
const railCollapsed = ref(false);
const splitting = ref<'rail' | 'dock' | null>(null);
const showNoiseDisks = ref(false);
const showAdd = ref(false);
const showEdit = ref(false);
const showCreds = ref(false);
const editingId = ref('');
const killTarget = ref<ProcessInfo | null>(null);
const killSignal = ref('TERM');
const svcAction = ref<{ unit: string; action: string } | null>(null);
const lastRefreshAt = ref(0);
const refreshingQuiet = ref(false);
const hostCache = ref<Record<string, HostCache>>({});

const draft = ref({
  displayName: '',
  host: '127.0.0.1',
  port: 22,
  user: '',
  password: '',
  privateKey: '',
  passphrase: '',
  role: 'host' as TargetRole,
  via: '',
  useBastionAuth: true,
  bastionKind: 'ssh' as 'ssh' | 'jumpserver',
  webPort: 801,
});
const probeBusy = ref(false);
const probeMsg = ref('');
const probeOk = ref<boolean | null>(null);
const pendingHostKey = ref<{ fingerprint: string; keyType: string; hostKey: string } | null>(null);
const lastProbeHop = ref<'bastion' | 'target' | ''>('');
const rememberSecrets = ref(false);
const alertPrefs = ref<AlertPrefs>({ ...defaultAlertPrefs });
const alertHistory = ref<AlertEvent[]>([]);
const showPrefs = ref(false);
const fleetBusy = ref(false);
const batchMode = ref(false);
const batchSelected = ref<Record<string, boolean>>({});
const batchBusy = ref(false);
const reconnectBusy = ref(false);
const showDiscover = ref(false);
const discoverBusy = ref(false);
const discoverItems = ref<DiscoverItem[]>([]);
const discoverSelected = ref<Record<string, boolean>>({});
const discoverBastionId = ref('');

const authDraft = computed({
  get: () => ({
    password: draft.value.password,
    privateKey: draft.value.privateKey,
    passphrase: draft.value.passphrase,
  }),
  set: (v: { password: string; privateKey: string; passphrase: string }) => {
    draft.value = { ...draft.value, ...v };
  },
});

const zh = computed(() => locale.value.toLowerCase().startsWith('zh'));
const selected = computed(() => hosts.value.find((h) => h.id === selectedId.value) || null);
const selectedMonitoring = computed(() => !!selected.value?.monitoring);
const useLinuxConsole = computed(() => {
  if (selected.value?.kind === 'ssh') return true;
  if (overview.value) return overview.value.linuxCapable;
  return linuxCapable.value;
});
const consoleChips = computed(() =>
  useLinuxConsole.value
    ? ['uptime', 'df -h', 'free -m', 'ps aux --sort=-%cpu | head -20', 'uname -a']
    : [
        'Get-Date',
        'Get-CimInstance Win32_OperatingSystem | Select Caption,Version,LastBootUpTime',
        'Get-Process | Sort-Object CPU -Descending | Select-Object -First 20 Name,Id,CPU,WorkingSet',
        'Get-PSDrive -PSProvider FileSystem',
        'hostname; $env:COMPUTERNAME',
      ],
);
const logSourceOptions = computed(() =>
  useLinuxConsole.value
    ? [
        { value: 'syslog', label: 'syslog / journal' },
        { value: 'kern', label: 'kernel' },
        { value: 'auth', label: 'auth / ssh' },
      ]
    : [
        { value: 'application', label: 'Application' },
        { value: 'system', label: 'System' },
        { value: 'security', label: 'Security' },
      ],
);

function saveConsoleSnap(id: string) {
  consoleByHost.value[id] = {
    history: [...consoleHistory.value],
    logContent: logContent.value,
    logSource: logSource.value,
    cmd: consoleCmd.value,
  };
}

function loadConsoleSnap(id: string) {
  const snap = consoleByHost.value[id];
  const defaultSrc = useLinuxConsole.value ? 'syslog' : 'application';
  if (!snap) {
    consoleHistory.value = [];
    logContent.value = '';
    logSource.value = defaultSrc;
    consoleCmd.value = '';
    return;
  }
  consoleHistory.value = [...snap.history];
  logContent.value = snap.logContent;
  logSource.value = snap.logSource || defaultSrc;
  consoleCmd.value = snap.cmd || '';
}
const monitoringCount = computed(() => hosts.value.filter((h) => h.monitoring).length);
const alertCount = computed(
  () => hosts.value.filter((h) => h.alertCpu || h.alertMem || h.alertDisk).length,
);

const filteredHosts = computed(() => {
  const q = hostQuery.value.trim().toLowerCase();
  if (!q) return hosts.value;
  return hosts.value.filter((h) =>
    `${h.displayName} ${h.host || ''} ${h.kind} ${h.via || ''} ${h.role || ''}`.toLowerCase().includes(q),
  );
});

/** Flat rail rows: localhost / bastions / direct SSH, then indented via children. */
const railHosts = computed(() => {
  const list = filteredHosts.value;
  const rows: { host: HostTarget; depth: number }[] = [];
  const placed = new Set<string>();
  const top = list.filter((h) => h.kind === 'local' || !h.via);
  for (const h of top) {
    rows.push({ host: h, depth: 0 });
    placed.add(h.id);
    if (h.kind === 'ssh') {
      for (const child of list.filter((c) => c.via === h.id)) {
        rows.push({ host: child, depth: 1 });
        placed.add(child.id);
      }
    }
  }
  for (const h of list) {
    if (!placed.has(h.id)) rows.push({ host: h, depth: 0 });
  }
  return rows;
});

const bastionHosts = computed(() => hosts.value.filter((h) => isBastion(h)));

const selectedBastion = computed(() => {
  const h = selected.value;
  if (!h) return null;
  if (isBastion(h)) return h;
  if (h.via) return hosts.value.find((x) => x.id === h.via) || null;
  return null;
});

const crumbPath = computed(() => {
  const h = selected.value;
  if (!h) return [] as string[];
  if (h.kind === 'local') return [h.displayName, 'local'];
  if (h.via) {
    const b = hosts.value.find((x) => x.id === h.via);
    return [b?.displayName || h.via, h.displayName, `${h.user}@${h.host}`];
  }
  if (h.role === 'bastion') return [h.displayName, t('Bastion', '堡垒机'), `${h.user}@${h.host}`];
  return [h.displayName, `${h.user}@${h.host}`];
});

function hostById(id: string) {
  return hosts.value.find((h) => h.id === id);
}

function jumpPayload(bastion: HostTarget) {
  return {
    host: bastion.host || '',
    port: bastion.port || 22,
    user: bastion.user || '',
    password: bastion.password || '',
    privateKey: bastion.privateKey || '',
    passphrase: bastion.passphrase || '',
    trustedHostKey: bastion.trustedHostKey || '',
    acceptNewHostKey: false,
    bastionKind: bastion.bastionKind || (bastion.port === 2222 ? 'jumpserver' : 'ssh'),
    webPort: bastion.webPort || 801,
  };
}

/** Prefer host secrets; for via hosts with useBastionAuth, fall back to bastion identity. */
function resolveHostAuth(h: HostTarget): {
  user: string;
  password: string;
  privateKey: string;
  passphrase: string;
  fromBastion: boolean;
} {
  const own = !!(h.password || h.privateKey);
  const inherit = !!h.via && h.useBastionAuth !== false && !own;
  if (inherit) {
    const b = hostById(h.via!);
    return {
      user: h.user || b?.user || '',
      password: b?.password || '',
      privateKey: b?.privateKey || '',
      passphrase: b?.passphrase || '',
      fromBastion: true,
    };
  }
  return {
    user: h.user || '',
    password: h.password || '',
    privateKey: h.privateKey || '',
    passphrase: h.passphrase || '',
    fromBastion: false,
  };
}

function hostHasAuth(h: HostTarget): boolean {
  const a = resolveHostAuth(h);
  return !!(a.password || a.privateKey);
}

function isBastion(h: HostTarget) {
  return h.kind === 'ssh' && !h.via && h.role === 'bastion';
}

function makeHostId(host: string, port: number, user: string, via?: string) {
  const base = `ssh-${via || 'direct'}-${host}-${port}-${user}`;
  return base.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function onAddTypeChange(v: string) {
  if (v === 'bastion') {
    draft.value.role = 'bastion';
    draft.value.via = '';
    draft.value.useBastionAuth = false;
  } else if (v === 'via') {
    draft.value.role = 'host';
    draft.value.via = draft.value.via || bastionHosts.value[0]?.id || '';
    draft.value.useBastionAuth = true;
    const b = hostById(draft.value.via);
    if (b?.user && !draft.value.user) draft.value.user = b.user;
  } else {
    draft.value.role = 'host';
    draft.value.via = '';
    draft.value.useBastionAuth = false;
  }
}

const sortedProcesses = computed(() => {
  const items = processes.value.slice();
  const key = procSort.value;
  items.sort((a, b) => {
    switch (key) {
      case 'mem':
        return b.mem - a.mem;
      case 'pid':
        return a.pid - b.pid;
      case 'name':
        return a.name.localeCompare(b.name);
      default:
        return b.cpu - a.cpu;
    }
  });
  return items;
});

const visibleProcesses = computed(() => sortedProcesses.value.slice(0, 120));

const filteredServices = computed(() => {
  const q = svcQuery.value.trim().toLowerCase();
  if (!q) return services.value;
  return services.value.filter((s) =>
    `${s.unit} ${s.description} ${s.active}`.toLowerCase().includes(q),
  );
});

/** Hide docker overlay / empty mounts clutter by default */
const visibleDisks = computed(() => {
  const disks = overview.value?.disks || [];
  if (showNoiseDisks.value) return disks;
  return disks.filter((d) => {
    if (!d.total || d.total < 64 * 1024 * 1024) return false;
    const m = d.mount || '';
    if (m.includes('/var/lib/docker/') || m.includes('/overlay') || m.includes('/kubelet/pods')) {
      return false;
    }
    return true;
  });
});

const hiddenDiskCount = computed(() => (overview.value?.disks.length || 0) - visibleDisks.value.length);

const needsCreds = computed(() => {
  const h = selected.value;
  if (!h || h.kind !== 'ssh') return false;
  // Missing secrets — prompt for credentials / bastion unlock.
  if (!hostHasAuth(h)) {
    if (h.via && h.useBastionAuth !== false) {
      const b = hostById(h.via);
      return !b || (!b.password && !b.privateKey);
    }
    return true;
  }
  // Connected with auth but last sync failed: still allow UI; refresh/reconnect handles it.
  // Only force creds card when failure looks like auth (not JumpServer transport).
  if (h.status === 'failed') {
    const msg = (h.statusMessage || '').toLowerCase();
    if (msg.includes('password') || msg.includes('auth') || msg.includes('permission denied')) {
      return true;
    }
    return false;
  }
  return false;
});

const connectBlocked = computed(() => {
  const h = selected.value;
  if (!h || h.kind !== 'ssh') return false;
  if (needsCreds.value) return false;
  return h.status === 'failed' || !!h.statusMessage?.includes('not connected');
});

function log(level: LogEntry['level'], message: string) {
  const top = logs.value[0];
  if (top && top.level === level && top.message === message && Date.now() - top.ts < 8000) {
    return; // de-dupe polling spam
  }
  logs.value = [{ ts: Date.now(), level, message }, ...logs.value].slice(0, 80);
}

function t(en: string, cn: string) {
  return zh.value ? cn : en;
}

function seedLocal(): HostTarget {
  return { id: 'localhost', displayName: 'localhost', kind: 'local', status: 'ready', monitoring: false };
}

function persistHosts() {
  const safe = hosts.value.map(
    ({ password, privateKey, passphrase, alertCpu, alertMem, alertDisk, lastCpu, lastMem, ...rest }) => rest,
  );
  void storageSet(STORAGE_KEY, JSON.stringify(safe));
  void storageSet(
    MONITOR_KEY,
    JSON.stringify(hosts.value.filter((h) => h.monitoring).map((h) => h.id)),
  );
}

async function persistHostSecret(h: HostTarget) {
  if (h.kind !== 'ssh') return;
  if (h.rememberSecrets && (h.password || h.privateKey)) {
    await upsertSecret(h.id, {
      password: h.password,
      privateKey: h.privateKey,
      passphrase: h.passphrase,
    });
  } else {
    await removeSecret(h.id);
  }
}

function pushAlert(ev: AlertEvent) {
  alertHistory.value = [ev, ...alertHistory.value].slice(0, 100);
  void saveAlertHistory(alertHistory.value);
  log(
    'warn',
    t(
      `ALERT ${ev.hostName} ${ev.kind}=${ev.value.toFixed(0)}% (≥${ev.threshold}%)`,
      `告警 ${ev.hostName} ${ev.kind}=${ev.value.toFixed(0)}%（≥${ev.threshold}%）`,
    ),
  );
  if (alertPrefs.value.desktopNotify && typeof Notification !== 'undefined') {
    if (Notification.permission === 'granted') {
      try {
        new Notification(`Process Ops · ${ev.hostName}`, {
          body: `${ev.kind.toUpperCase()} ${ev.value.toFixed(0)}% ≥ ${ev.threshold}%`,
        });
      } catch {
        /* ignore */
      }
    }
  }
}

function applyAlerts(id: string, ov: Overview) {
  const prefs = alertPrefs.value;
  const host = hosts.value.find((h) => h.id === id);
  const diskHot = (ov.disks || []).some((d) => d.total > 64 * 1024 * 1024 && d.usedPercent >= prefs.diskWarn);
  const cpu = ov.cpuPercent >= prefs.cpuWarn;
  const mem = ov.memPercent >= prefs.memWarn;
  const name = host?.displayName || id;
  // Rising-edge only — avoid spam while a metric stays hot.
  if (cpu && !host?.alertCpu) {
    pushAlert({ ts: Date.now(), targetId: id, hostName: name, kind: 'cpu', value: ov.cpuPercent, threshold: prefs.cpuWarn });
  }
  if (mem && !host?.alertMem) {
    pushAlert({ ts: Date.now(), targetId: id, hostName: name, kind: 'mem', value: ov.memPercent, threshold: prefs.memWarn });
  }
  if (diskHot && !host?.alertDisk) {
    const worst = Math.max(0, ...(ov.disks || []).map((d) => d.usedPercent));
    pushAlert({ ts: Date.now(), targetId: id, hostName: name, kind: 'disk', value: worst, threshold: prefs.diskWarn });
  }
  hosts.value = hosts.value.map((h) =>
    h.id === id
      ? {
          ...h,
          alertCpu: cpu,
          alertMem: mem,
          alertDisk: diskHot,
          lastCpu: ov.cpuPercent,
          lastMem: ov.memPercent,
          status: h.status === 'failed' ? h.status : cpu || mem || diskHot ? 'degraded' : 'ready',
        }
      : h,
  );
}

function pressureClass(pct: number): string {
  if (pct >= 90) return 'bad';
  if (pct >= 75) return 'warn';
  return '';
}

async function loadHosts() {
  const raw = await storageGet(STORAGE_KEY);
  let list: HostTarget[] = [];
  if (raw) {
    try {
      list = JSON.parse(raw) as HostTarget[];
    } catch {
      list = [];
    }
  }
  if (!list.some((h) => h.id === 'localhost' && h.kind === 'local')) {
    list = [seedLocal(), ...list.filter((h) => h.id !== 'localhost')];
  }
  // Cold open: all monitors OFF. User starts LIVE explicitly when they want metrics.
  // (Session-only LIVE list is still written by persistHosts while the tab is open.)
  const vault = await loadSecretsVault();
  alertPrefs.value = await loadAlertPrefs();
  hosts.value = list.map((h) => {
    const secret = vault[h.id];
    const bastionKind =
      h.bastionKind ||
      (h.role === 'bastion' && (h.port === 2222 || String(h.port) === '2222') ? 'jumpserver' : h.bastionKind);
    return {
      ...h,
      bastionKind,
      monitoring: false,
      password: secret?.password,
      privateKey: secret?.privateKey,
      passphrase: secret?.passphrase,
      rememberSecrets: h.rememberSecrets || !!secret,
    };
  });
  void storageSet(MONITOR_KEY, JSON.stringify([]));
  if (!hosts.value.some((h) => h.id === selectedId.value)) {
    selectedId.value = hosts.value[0]?.id || 'localhost';
  }
}

async function syncTargets() {
  if (!connectionId.value) return;
  const targets = hosts.value.map((h) => {
    const auth = resolveHostAuth(h);
    const row: Record<string, unknown> = {
      id: h.id,
      displayName: h.displayName,
      kind: h.kind,
      role: h.role || (h.via ? 'host' : h.kind === 'ssh' ? 'host' : undefined),
      via: h.via || '',
      bastionKind: h.bastionKind || (h.role === 'bastion' ? 'ssh' : undefined),
      webPort: h.webPort || undefined,
      menuId: h.menuId || '',
      host: h.host,
      port: h.port || 22,
      user: auth.user || h.user,
      password: auth.password,
      privateKey: auth.privateKey,
      passphrase: auth.passphrase,
      trustedHostKey: h.trustedHostKey || '',
      acceptNewHostKey: false,
    };
    if (h.via) {
      const bastion = hostById(h.via);
      if (bastion) row.jump = jumpPayload(bastion);
    }
    return row;
  });
  try {
    const res = await invoke<{
      ok: boolean;
      warning?: string;
      targets?: { id: string; status: string; message?: string }[];
    }>(connectionId.value, 'process/targets/sync', { targets });
    if (res.targets) {
      const map = new Map(res.targets.map((x) => [x.id, x]));
      hosts.value = hosts.value.map((h) => {
        const st = map.get(h.id);
        if (!st) return h;
        const next = (st.status as HostTarget['status']) || 'unknown';
        // Keep UI alert degradation until the next successful overview clears it.
        const status = h.status === 'degraded' && next === 'ready' ? 'degraded' : next;
        return {
          ...h,
          status,
          statusMessage: st.message || (status === 'degraded' ? h.statusMessage : ''),
        };
      });
    }
    if (res.warning) log('warn', res.warning);
    synced.value = true;
  } catch (e) {
    log('error', String(e));
    synced.value = false;
  }
}

function cacheOf(id: string): HostCache {
  if (!hostCache.value[id]) hostCache.value[id] = emptyCache();
  return hostCache.value[id];
}

function applyCacheToView(id: string) {
  const c = cacheOf(id);
  overview.value = c.overview;
  cpuHistory.value = c.cpuHistory;
  memHistory.value = c.memHistory;
  processes.value = c.processes;
  services.value = c.services;
  linuxCapable.value = c.linuxCapable;
  servicesMessage.value = c.servicesMessage;
  diagnose.value = c.diagnose;
}

function patchOverview(id: string, ov: Overview, cpu: HistorySample[], mem: HistorySample[]) {
  const c = cacheOf(id);
  // In-place field updates reduce DOM thrash vs replacing the whole object tree blindly.
  if (c.overview && c.overview.targetId === ov.targetId) {
    Object.assign(c.overview, ov);
  } else {
    c.overview = ov;
  }
  c.cpuHistory = cpu;
  c.memHistory = mem;
  c.linuxCapable = !!ov.linuxCapable;
  if (selectedId.value === id) {
    overview.value = c.overview;
    cpuHistory.value = c.cpuHistory;
    memHistory.value = c.memHistory;
    linuxCapable.value = c.linuxCapable;
  }
  applyAlerts(id, ov);
}

async function refreshOverview(targetId: string) {
  if (!connectionId.value) return;
  const ov = await invoke<Overview>(connectionId.value, 'process/overview', { targetId });
  const [cpu, mem] = await Promise.all([
    invoke<{ samples: HistorySample[] }>(connectionId.value, 'process/metrics/history', {
      targetId,
      metric: 'cpu',
    }),
    invoke<{ samples: HistorySample[] }>(connectionId.value, 'process/metrics/history', {
      targetId,
      metric: 'mem',
    }),
  ]);
  patchOverview(targetId, ov, cpu.samples || [], mem.samples || []);
}

async function refreshProcesses(targetId: string) {
  if (!connectionId.value) return;
  const res = await invoke<{ items: ProcessInfo[] }>(connectionId.value, 'process/list', {
    targetId,
    query: procQuery.value,
    limit: PROC_LIMIT,
  });
  const items = res.items || [];
  const c = cacheOf(targetId);
  c.processes = items;
  if (selectedId.value === targetId) processes.value = items;
}

async function refreshServices(targetId: string) {
  if (!connectionId.value) return;
  const res = await invoke<{ items: ServiceInfo[]; linuxCapable?: boolean; message?: string }>(
    connectionId.value,
    'process/services/list',
    { targetId },
  );
  const c = cacheOf(targetId);
  c.services = res.items || [];
  c.linuxCapable = res.linuxCapable !== false;
  c.servicesMessage = res.message || '';
  if (selectedId.value === targetId) {
    services.value = c.services;
    linuxCapable.value = c.linuxCapable;
    servicesMessage.value = c.servicesMessage;
  }
}

async function runDiagnose(targetId: string) {
  if (!connectionId.value) return;
  const report = await invoke<DiagnoseReport>(connectionId.value, 'process/diagnose', { targetId });
  const c = cacheOf(targetId);
  c.diagnose = report;
  if (report.overview) {
    patchOverview(targetId, report.overview, c.cpuHistory, c.memHistory);
  }
  if (selectedId.value === targetId) diagnose.value = report;
  log('info', report.summary);
}

function markSelectedFailed(message: string) {
  const id = selectedId.value;
  // Keep monitoring=true so a transient error does not force manual ▶ next open.
  hosts.value = hosts.value.map((h) =>
    h.id === id ? { ...h, status: 'failed', statusMessage: message } : h,
  );
  persistHosts();
}

let pollInflight = false;

async function refreshActive(opts: { quiet?: boolean } = {}) {
  if (!connectionId.value || !selectedId.value) return;
  if (needsCreds.value && opts.quiet) return;
  if (opts.quiet && pollInflight) return;
  if (!synced.value) await syncTargets();
  if (needsCreds.value && opts.quiet) return;

  const targetId = selectedId.value;
  const hasData = !!cacheOf(targetId).overview || cacheOf(targetId).processes.length > 0;
  // Only show blocking spinner on first load; quiet polls patch numbers in place.
  if (!opts.quiet && !hasData) loading.value = true;
  if (opts.quiet) {
    pollInflight = true;
    refreshingQuiet.value = true;
  }
  try {
    if (tab.value === 'overview') await refreshOverview(targetId);
    else if (tab.value === 'processes') await refreshProcesses(targetId);
    else if (tab.value === 'services') await refreshServices(targetId);
    else if (tab.value === 'diagnose' && !opts.quiet) await runDiagnose(targetId);
    // console tab is interactive — no auto refresh
    lastRefreshAt.value = Date.now();
    if (selected.value?.status === 'failed') {
      hosts.value = hosts.value.map((h) =>
        h.id === selectedId.value ? { ...h, status: 'ready', statusMessage: '' } : h,
      );
    }
  } catch (e) {
    const msg = String(e);
    log('error', msg);
    if (
      msg.includes('not connected') ||
      msg.includes('sync targets') ||
      msg.includes('ssh dial') ||
      msg.includes('password or privateKey')
    ) {
      markSelectedFailed(msg);
      if (!opts.quiet) await syncTargets();
    }
  } finally {
    loading.value = false;
    if (opts.quiet) {
      pollInflight = false;
      refreshingQuiet.value = false;
    }
  }
}

async function selectHost(id: string) {
  if (selectedId.value === id) return;
  saveConsoleSnap(selectedId.value);
  selectedId.value = id;
  applyCacheToView(id); // instant paint from cache — no blank flash
  loadConsoleSnap(id);
  await syncTargets();
  await refreshActive({ quiet: !!cacheOf(id).overview });
}

function startMonitor(id: string) {
  const target = hosts.value.find((h) => h.id === id);
  if (!target) return;
  if (target.kind === 'ssh' && !hostHasAuth(target)) {
    if (target.via && target.useBastionAuth !== false) {
      log('warn', t('Connect the bastion before monitoring this host', '监控前请先连接堡垒机'));
    } else {
      log('warn', t('Add credentials before starting monitor', '启动监控前请先填写凭据'));
    }
    if (id !== selectedId.value) void onSelectHost(id);
    return;
  }
  hosts.value = hosts.value.map((h) => (h.id === id ? { ...h, monitoring: true } : h));
  persistHosts();
  log('info', t(`Monitoring started: ${id}`, `已启动监控：${id}`));
  if (id === selectedId.value) void refreshActive({ quiet: true });
}

function stopMonitor(id: string) {
  hosts.value = hosts.value.map((h) => (h.id === id ? { ...h, monitoring: false } : h));
  persistHosts();
  log('info', t(`Monitoring stopped: ${id}`, `已停止监控：${id}`));
}

function toggleSelectedMonitor() {
  const h = selected.value;
  if (!h) return;
  if (h.monitoring) stopMonitor(h.id);
  else startMonitor(h.id);
}

function startMonitorAll() {
  let n = 0;
  hosts.value = hosts.value.map((h) => {
    if (h.kind === 'ssh' && !hostHasAuth(h)) return h;
    if (h.monitoring) return h;
    n += 1;
    return { ...h, monitoring: true };
  });
  persistHosts();
  log('info', t(`Monitoring started on ${n} host(s)`, `已对 ${n} 台主机启动监控`));
  void pollFleetOverviews();
}

function stopMonitorAll() {
  const n = hosts.value.filter((h) => h.monitoring).length;
  hosts.value = hosts.value.map((h) => ({ ...h, monitoring: false }));
  persistHosts();
  log('info', t(`Monitoring stopped on ${n} host(s)`, `已停止 ${n} 台主机监控`));
}

async function reconnectFailed() {
  if (!connectionId.value || reconnectBusy.value) return;
  reconnectBusy.value = true;
  try {
    const failedIds = hosts.value
      .filter((h) => h.kind === 'ssh' && (h.status === 'failed' || h.statusMessage))
      .map((h) => h.id);
    await syncTargets();
    const res = await invoke<{ targets: { id: string; status: string; message?: string }[] }>(
      connectionId.value,
      'process/targets/reconnect',
      { targetIds: failedIds },
    );
    const ok = (res.targets || []).filter((t) => t.status === 'ready').length;
    const bad = (res.targets || []).filter((t) => t.status !== 'ready');
    for (const t of res.targets || []) {
      hosts.value = hosts.value.map((h) =>
        h.id === t.id
          ? {
              ...h,
              status: t.status === 'ready' ? 'ready' : 'failed',
              statusMessage: t.status === 'ready' ? undefined : t.message,
            }
          : h,
      );
    }
    persistHosts();
    log(
      bad.length ? 'warn' : 'info',
      t(`Reconnected ${ok}, failed ${bad.length}`, `重连成功 ${ok}，失败 ${bad.length}`),
    );
    void pollFleetOverviews();
  } catch (e) {
    log('error', String(e));
  } finally {
    reconnectBusy.value = false;
  }
}

async function keepaliveJumpSessions() {
  if (!connectionId.value) return;
  try {
    const res = await invoke<{ targets: { id: string; ok: boolean; message?: string }[] }>(
      connectionId.value,
      'process/targets/keepalive',
      {},
    );
    const dead = (res.targets || []).filter((t) => !t.ok);
    if (dead.length) {
      await invoke(connectionId.value, 'process/targets/reconnect', {
        targetIds: dead.map((t) => t.id),
      });
      log('warn', t(`JumpServer keepalive lost ${dead.length}; reconnected`, `JumpServer 保活失败 ${dead.length} 路，已尝试重连`));
    }
  } catch {
    /* ignore quiet keepalive */
  }
}

function toggleBatchHost(id: string) {
  batchSelected.value = { ...batchSelected.value, [id]: !batchSelected.value[id] };
}

function selectAllBatchHosts() {
  const next: Record<string, boolean> = {};
  for (const h of hosts.value) {
    if (h.kind === 'local' || hostHasAuth(h)) next[h.id] = true;
  }
  batchSelected.value = next;
}

const batchSelectedIds = computed(() =>
  Object.entries(batchSelected.value)
    .filter(([, v]) => v)
    .map(([id]) => id),
);

function resetProbe() {
  probeBusy.value = false;
  probeMsg.value = '';
  probeOk.value = null;
  pendingHostKey.value = null;
}

function closeAdd() {
  showAdd.value = false;
}

function openAdd(kind: 'host' | 'bastion' | 'via' = 'host', viaId?: string) {
  const viaDefault =
    kind === 'via'
      ? viaId || selectedBastion.value?.id || bastionHosts.value[0]?.id || ''
      : '';
  const bastion = viaDefault ? hostById(viaDefault) : null;
  draft.value = {
    displayName: '',
    host: kind === 'via' ? '' : '127.0.0.1',
    port: kind === 'bastion' ? 2222 : 22,
    user: kind === 'via' ? bastion?.user || '' : '',
    password: '',
    privateKey: '',
    passphrase: '',
    role: kind === 'bastion' ? 'bastion' : 'host',
    via: viaDefault,
    useBastionAuth: kind === 'via',
    bastionKind: kind === 'bastion' ? 'jumpserver' : 'ssh',
    webPort: 801,
  };
  rememberSecrets.value = false;
  resetProbe();
  // Close sibling editors so only one form drawer is open.
  showEdit.value = false;
  showCreds.value = false;
  showDiscover.value = false;
  showPrefs.value = false;
  showAdd.value = true;
}

function persistLayout() {
  void storageSet(
    LAYOUT_KEY,
    JSON.stringify({
      railWidth: railWidth.value,
      dockHeight: dockHeight.value,
      dockOpen: dockOpen.value,
      railCollapsed: railCollapsed.value,
    }),
  );
}

async function loadLayout() {
  try {
    const raw = await storageGet(LAYOUT_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      railWidth?: number;
      dockHeight?: number;
      dockOpen?: boolean;
      railCollapsed?: boolean;
    };
    if (typeof parsed.railWidth === 'number') {
      railWidth.value = Math.min(RAIL_MAX, Math.max(RAIL_MIN, Math.round(parsed.railWidth)));
    }
    if (typeof parsed.dockHeight === 'number') {
      dockHeight.value = Math.min(DOCK_MAX, Math.max(DOCK_MIN, Math.round(parsed.dockHeight)));
    }
    if (typeof parsed.dockOpen === 'boolean') dockOpen.value = parsed.dockOpen;
    if (typeof parsed.railCollapsed === 'boolean') railCollapsed.value = parsed.railCollapsed;
  } catch {
    /* ignore */
  }
}

function onSplitPointerDown(kind: 'rail' | 'dock', e: PointerEvent) {
  const el = e.currentTarget as HTMLElement;
  el.setPointerCapture(e.pointerId);
  splitting.value = kind;
  document.body.classList.add('po-splitting', kind === 'rail' ? 'po-split-col' : 'po-split-row');
}

function onSplitPointerMove(e: PointerEvent) {
  if (!splitting.value) return;
  if (splitting.value === 'rail') {
    const max = Math.min(RAIL_MAX, window.innerWidth - 320);
    railWidth.value = Math.min(max, Math.max(RAIL_MIN, Math.round(e.clientX)));
    if (railCollapsed.value && railWidth.value > RAIL_MIN) railCollapsed.value = false;
  } else {
    const fromBottom = window.innerHeight - e.clientY;
    const max = Math.min(DOCK_MAX, window.innerHeight - 180);
    dockHeight.value = Math.min(max, Math.max(DOCK_MIN, Math.round(fromBottom)));
    if (!dockOpen.value) dockOpen.value = true;
  }
}

function onSplitPointerUp(e: PointerEvent) {
  if (!splitting.value) return;
  splitting.value = null;
  document.body.classList.remove('po-splitting', 'po-split-col', 'po-split-row');
  try {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
  persistLayout();
}

function toggleDock() {
  dockOpen.value = !dockOpen.value;
  persistLayout();
}

function toggleRail() {
  railCollapsed.value = !railCollapsed.value;
  persistLayout();
}

function openCreds() {
  const h = selected.value;
  if (!h || h.kind !== 'ssh') return;
  draft.value = {
    displayName: h.displayName,
    host: h.host || '',
    port: h.port || 22,
    user: h.user || '',
    password: h.password || '',
    privateKey: h.privateKey || '',
    passphrase: h.passphrase || '',
    role: h.role || (h.via ? 'host' : 'host'),
    via: h.via || '',
    useBastionAuth: h.via ? h.useBastionAuth !== false : false,
    bastionKind: h.bastionKind || 'ssh',
    webPort: h.webPort || 801,
  };
  rememberSecrets.value = !!h.rememberSecrets;
  resetProbe();
  showCreds.value = true;
}

function openEdit(h: HostTarget) {
  if (h.kind !== 'ssh') return;
  editingId.value = h.id;
  draft.value = {
    displayName: h.displayName,
    host: h.host || '',
    port: h.port || 22,
    user: h.user || '',
    password: '',
    privateKey: '',
    passphrase: '',
    role: h.role || (h.via ? 'host' : isBastion(h) ? 'bastion' : 'host'),
    via: h.via || '',
    useBastionAuth: h.via ? h.useBastionAuth !== false : false,
    bastionKind: h.bastionKind || 'ssh',
    webPort: h.webPort || 801,
  };
  rememberSecrets.value = !!h.rememberSecrets;
  resetProbe();
  showEdit.value = true;
}

function draftHasSecret(requireFresh: boolean): boolean {
  const d = draft.value;
  if (d.via && d.useBastionAuth) {
    const b = hostById(d.via);
    return !!(b?.password || b?.privateKey);
  }
  if (d.password.trim() || d.privateKey.trim()) return true;
  if (!requireFresh) {
    const h = hosts.value.find((x) => x.id === editingId.value);
    if (h && hostHasAuth(h)) return true;
  }
  return false;
}

async function probeDraft(opts: { optionalKeep?: boolean; acceptNewHostKey?: boolean } = {}): Promise<boolean> {
  if (!connectionId.value) return false;
  const d = draft.value;
  const viaId = d.via.trim();
  const bastion = viaId ? hostById(viaId) : null;
  const inheritAuth = !!viaId && d.useBastionAuth;
  let user = d.user.trim();
  if (inheritAuth && !user) user = bastion?.user || '';
  if (!d.host.trim() || !user) {
    probeOk.value = false;
    probeMsg.value = t('Host and user are required', '主机与用户名为必填');
    return false;
  }
  if (viaId) {
    if (!bastion) {
      probeOk.value = false;
      probeMsg.value = t('Select a bastion first', '请先选择堡垒机');
      return false;
    }
    if (!bastion.password && !bastion.privateKey) {
      probeOk.value = false;
      probeMsg.value = t('Bastion credentials missing — connect the bastion first', '堡垒机凭据缺失，请先连接堡垒机');
      return false;
    }
  }
  let password = d.password;
  let privateKey = d.privateKey;
  let passphrase = d.passphrase;
  let trustedHostKey = '';
  const editHost = hosts.value.find((x) => x.id === editingId.value || x.id === selectedId.value);
  if (opts.optionalKeep && !password && !privateKey.trim()) {
    password = editHost?.password || '';
    privateKey = editHost?.privateKey || '';
    passphrase = editHost?.passphrase || '';
  }
  if (inheritAuth && !password && !privateKey.trim()) {
    password = bastion?.password || '';
    privateKey = bastion?.privateKey || '';
    passphrase = bastion?.passphrase || '';
  }
  trustedHostKey = pendingHostKey.value?.hostKey || editHost?.trustedHostKey || '';
  if (!password && !privateKey.trim()) {
    probeOk.value = false;
    probeMsg.value = inheritAuth
      ? t('Bastion credentials missing — connect the bastion first', '堡垒机凭据缺失，请先连接堡垒机')
      : t('Password or private key required', '需要密码或私钥');
    return false;
  }
  probeBusy.value = true;
  probeOk.value = null;
  pendingHostKey.value = null;
  probeMsg.value = t('Probing…', '探测中…');
  try {
    const target: Record<string, unknown> = {
      id: 'probe',
      displayName: d.displayName || d.host,
      kind: 'ssh',
      role: d.role || 'host',
      host: d.host.trim(),
      port: Number(d.port) || 22,
      user,
      password,
      privateKey,
      passphrase,
      trustedHostKey: opts.acceptNewHostKey ? '' : trustedHostKey,
      acceptNewHostKey: !!opts.acceptNewHostKey,
    };
    if (viaId) {
      const bastion = hostById(viaId)!;
      const jump = jumpPayload(bastion);
      if (opts.acceptNewHostKey && lastProbeHop.value === 'bastion') {
        jump.acceptNewHostKey = true;
        jump.trustedHostKey = '';
      }
      target.via = viaId;
      target.jump = jump;
      if (opts.acceptNewHostKey && lastProbeHop.value === 'target') {
        target.acceptNewHostKey = true;
        target.trustedHostKey = '';
      }
    }
    const res = await invoke<{
      success: boolean;
      message?: string;
      hostname?: string;
      os?: string;
      code?: string;
      fingerprint?: string;
      keyType?: string;
      hostKey?: string;
      hop?: string;
    }>(connectionId.value, 'process/targets/probe', { target });
    lastProbeHop.value = res.hop === 'bastion' ? 'bastion' : res.hop === 'target' ? 'target' : '';
    if (res.success) {
      probeOk.value = true;
      if (res.hostKey) {
        pendingHostKey.value = {
          fingerprint: res.fingerprint || '',
          keyType: res.keyType || '',
          hostKey: res.hostKey,
        };
      }
      const hop = res.hop ? ` [${res.hop}]` : '';
      probeMsg.value = t(
        `OK · ${res.hostname || d.host}${res.os ? ' · ' + res.os : ''}${res.fingerprint ? ' · ' + res.fingerprint : ''}${hop}`,
        `成功 · ${res.hostname || d.host}${res.os ? ' · ' + res.os : ''}${res.fingerprint ? ' · ' + res.fingerprint : ''}${hop}`,
      );
      return true;
    }
    probeOk.value = false;
    if (res.code === 'hostkey_unknown' && res.hostKey) {
      pendingHostKey.value = {
        fingerprint: res.fingerprint || '',
        keyType: res.keyType || '',
        hostKey: res.hostKey,
      };
      lastProbeHop.value = res.hop === 'bastion' ? 'bastion' : 'target';
      const hopLabel = res.hop === 'bastion' ? t('bastion', '堡垒机') : t('target', '目标机');
      probeMsg.value = t(
        `Untrusted ${hopLabel} host key ${res.fingerprint || ''}. Trust to continue.`,
        `未信任的${hopLabel}主机密钥 ${res.fingerprint || ''}，确认信任后继续。`,
      );
      return false;
    }
    probeMsg.value = res.message || t('Probe failed', '探测失败');
    return false;
  } catch (e) {
    probeOk.value = false;
    probeMsg.value = String(e);
    return false;
  } finally {
    probeBusy.value = false;
  }
}

async function trustHostKeyAndProbe() {
  if (!pendingHostKey.value) return false;
  const ok = await probeDraft({
    optionalKeep: showEdit.value,
    acceptNewHostKey: true,
  });
  return ok;
}

function attachTrustedKey(h: HostTarget): HostTarget {
  if (!pendingHostKey.value) return h;
  if (lastProbeHop.value === 'bastion' && h.via) {
    const bastion = hostById(h.via);
    if (bastion) {
      hosts.value = hosts.value.map((x) =>
        x.id === bastion.id
          ? {
              ...x,
              trustedHostKey: pendingHostKey.value!.hostKey,
              hostKeyFingerprint: pendingHostKey.value!.fingerprint,
            }
          : x,
      );
      persistHosts();
    }
    return h;
  }
  return {
    ...h,
    trustedHostKey: pendingHostKey.value.hostKey,
    hostKeyFingerprint: pendingHostKey.value.fingerprint,
  };
}

async function saveEdit() {
  const id = editingId.value;
  const prev = hosts.value.find((h) => h.id === id);
  if (!prev || prev.kind !== 'ssh') return;
  const d = draft.value;
  const via = d.role === 'bastion' ? '' : d.via.trim() || prev.via || '';
  const inheritAuth = !!via && d.useBastionAuth;
  const bastion = via ? hostById(via) : null;
  const user = d.user.trim() || (inheritAuth ? bastion?.user || prev.user || '' : '');
  if (!d.host.trim() || !user) {
    log('error', t('Host and user are required', '主机与用户名为必填'));
    return;
  }
  const role: TargetRole = d.role || prev.role || 'host';
  const kind = d.bastionKind || prev.bastionKind || 'ssh';
  const next: HostTarget = {
    ...prev,
    displayName: d.displayName.trim() || `${user}@${d.host}`,
    host: d.host.trim(),
    port: Number(d.port) || 22,
    user,
    role,
    via: role === 'bastion' ? undefined : via || undefined,
    useBastionAuth: via ? inheritAuth : undefined,
    bastionKind: role === 'bastion' ? kind : undefined,
    webPort: role === 'bastion' && kind === 'jumpserver' ? Number(d.webPort) || prev.webPort || 801 : undefined,
    status: 'unknown',
  };
  if (inheritAuth) {
    next.password = undefined;
    next.privateKey = undefined;
    next.passphrase = undefined;
    next.rememberSecrets = false;
  } else {
    if (d.password) next.password = d.password;
    if (d.privateKey.trim()) next.privateKey = d.privateKey;
    if (d.passphrase) next.passphrase = d.passphrase;
    next.rememberSecrets = rememberSecrets.value;
  }
  if (!draftHasSecret(false)) {
    log(
      'error',
      inheritAuth
        ? t('Bastion credentials missing — connect the bastion first', '堡垒机凭据缺失，请先连接堡垒机')
        : t('Password or private key required', '需要密码或私钥'),
    );
    return;
  }
  if (!(await probeDraft({ optionalKeep: true }))) return;
  const saved = attachTrustedKey(next);
  // Keep stable id so cache/monitor bindings survive edits.
  hosts.value = hosts.value.map((h) => (h.id === id ? saved : h));
  persistHosts();
  await persistHostSecret(saved);
  showEdit.value = false;
  editingId.value = '';
  if (selectedId.value === id) {
    await syncTargets();
    await refreshActive({ quiet: false });
  } else {
    await syncTargets();
  }
  log('info', t(`Host updated: ${saved.displayName}`, `已更新主机：${saved.displayName}`));
}

async function saveRemote() {
  const d = draft.value;
  const via = d.role === 'bastion' ? '' : d.via.trim();
  const inheritAuth = !!via && d.useBastionAuth;
  const bastion = via ? hostById(via) : null;
  const user = d.user.trim() || (inheritAuth ? bastion?.user || '' : '');
  if (!d.host.trim() || !user) {
    log('error', t('Host and user are required', '主机与用户名为必填'));
    return;
  }
  if (d.role === 'host' && via && !bastion) {
    log('error', t('Select a bastion first', '请先选择堡垒机'));
    return;
  }
  if (!inheritAuth && !d.password && !d.privateKey.trim()) {
    log('error', t('Password or private key required', '需要密码或私钥'));
    return;
  }
  if (inheritAuth && !bastion?.password && !bastion?.privateKey) {
    log('error', t('Bastion credentials missing — connect the bastion first', '堡垒机凭据缺失，请先连接堡垒机'));
    return;
  }
  if (!(await probeDraft())) return;
  const role: TargetRole = d.role === 'bastion' ? 'bastion' : 'host';
  const id = makeHostId(d.host.trim(), Number(d.port) || 22, user, via || undefined);
  let item: HostTarget = {
    id,
    displayName:
      d.displayName.trim() ||
      (role === 'bastion' ? `bastion:${d.host}` : `${user}@${d.host}`),
    kind: 'ssh',
    role,
    via: via || undefined,
    useBastionAuth: via ? inheritAuth : undefined,
    bastionKind: role === 'bastion' ? d.bastionKind || 'ssh' : undefined,
    webPort: role === 'bastion' && d.bastionKind === 'jumpserver' ? Number(d.webPort) || 801 : undefined,
    host: d.host.trim(),
    port: Number(d.port) || (role === 'bastion' && d.bastionKind === 'jumpserver' ? 2222 : 22),
    user,
    // Keep own secrets only when not inheriting bastion auth.
    password: inheritAuth ? undefined : d.password,
    privateKey: inheritAuth ? undefined : d.privateKey,
    passphrase: inheritAuth ? undefined : d.passphrase,
    status: 'ready',
    monitoring: role === 'bastion' && d.bastionKind === 'jumpserver' ? false : true,
    rememberSecrets: inheritAuth ? false : rememberSecrets.value,
  };
  item = attachTrustedKey(item);
  const idx = hosts.value.findIndex((h) => h.id === id);
  if (idx >= 0) hosts.value[idx] = { ...hosts.value[idx], ...item, monitoring: true };
  else hosts.value = [...hosts.value, item];
  persistHosts();
  await persistHostSecret(item);
  closeAdd();
  selectedId.value = id;
  await syncTargets();
  await refreshActive();
}

async function saveCreds() {
  const h = selected.value;
  if (!h || h.kind !== 'ssh') return;
  const d = draft.value;
  const inheritAuth = !!h.via && d.useBastionAuth;
  if (!inheritAuth && !d.password && !d.privateKey.trim()) {
    log('error', t('Password or private key required', '需要密码或私钥'));
    return;
  }
  if (!(await probeDraft())) return;
  let next: HostTarget = {
    ...h,
    useBastionAuth: h.via ? inheritAuth : undefined,
    password: inheritAuth ? undefined : d.password || undefined,
    privateKey: inheritAuth ? undefined : d.privateKey || undefined,
    passphrase: inheritAuth ? undefined : d.passphrase || undefined,
    status: 'ready',
    statusMessage: '',
    rememberSecrets: inheritAuth ? false : rememberSecrets.value,
  };
  next = attachTrustedKey(next);
  hosts.value = hosts.value.map((x) => (x.id === h.id ? next : x));
  persistHosts();
  await persistHostSecret(next);
  showCreds.value = false;
  await syncTargets();
  startMonitor(h.id);
  await refreshActive();
}

async function removeSelectedRemote() {
  const h = selected.value;
  if (!h || h.kind !== 'ssh') return;
  const children = hosts.value.filter((x) => x.via === h.id);
  if (children.length) {
    const ok = confirm(
      t(
        `Remove bastion ${h.displayName} and ${children.length} host(s) under it?`,
        `删除堡垒机 ${h.displayName} 及其下 ${children.length} 台业务机？`,
      ),
    );
    if (!ok) return;
  } else if (!confirm(t(`Remove ${h.displayName}?`, `删除 ${h.displayName}？`))) {
    return;
  }
  const removeIds = new Set([h.id, ...children.map((c) => c.id)]);
  hosts.value = hosts.value.filter((x) => !removeIds.has(x.id));
  selectedId.value = 'localhost';
  persistHosts();
  for (const id of removeIds) await removeSecret(id);
  await syncTargets();
  await refreshActive();
}

async function reconnectViaBastion() {
  loading.value = true;
  try {
    await syncTargets();
    await refreshActive({ quiet: false });
  } finally {
    loading.value = false;
  }
}

async function openDiscover(bastionId?: string) {
  const id = bastionId || selectedBastion.value?.id || '';
  const bastion = id ? hostById(id) : null;
  if (!bastion || !isBastion(bastion)) {
    log('warn', t('Select a bastion first', '请先选择堡垒机'));
    return;
  }
  if (!bastion.password && !bastion.privateKey) {
    log('warn', t('Bastion credentials missing — connect the bastion first', '堡垒机凭据缺失，请先连接堡垒机'));
    return;
  }
  discoverBastionId.value = bastion.id;
  showDiscover.value = true;
  discoverItems.value = [];
  discoverSelected.value = {};
  await runDiscover();
}

async function runDiscover() {
  if (!connectionId.value || !discoverBastionId.value) return;
  discoverBusy.value = true;
  try {
    // Ensure bastion is synced/connected before discover.
    await syncTargets();
    const bastion = hostById(discoverBastionId.value);
    const mode = bastion?.bastionKind === 'jumpserver' ? 'jumpserver' : 'default';
    const res = await invoke<{ items?: DiscoverItem[]; count?: number }>(
      connectionId.value,
      'process/bastion/discover',
      { bastionId: discoverBastionId.value, mode },
    );
    discoverItems.value = res.items || [];
    const sel: Record<string, boolean> = {};
    for (const it of discoverItems.value) {
      const key = `${it.host}:${it.port || 22}`;
      sel[key] = false;
    }
    discoverSelected.value = sel;
    if (!discoverItems.value.length) {
      log('info', t('No discoverable hosts on bastion', '堡垒机上未发现可导入主机'));
    }
  } catch (e) {
    log('error', String(e));
    discoverItems.value = [];
  } finally {
    discoverBusy.value = false;
  }
}

async function importDiscovered() {
  const bastion = hostById(discoverBastionId.value);
  if (!bastion) return;
  const picked = discoverItems.value.filter((it) => discoverSelected.value[`${it.host}:${it.port || 22}`]);
  if (!picked.length) {
    log('warn', t('Select at least one host to import', '请至少勾选一台主机导入'));
    return;
  }
  const defaultUser = bastion.user || 'root';
  let added = 0;
  for (const it of picked) {
    const user = it.user || defaultUser;
    const port = it.port || 22;
    const id = makeHostId(it.host, port, user, bastion.id);
    if (hosts.value.some((h) => h.id === id)) continue;
    const item: HostTarget = {
      id,
      displayName: it.name || `${user}@${it.host}`,
      kind: 'ssh',
      role: 'host',
      via: bastion.id,
      useBastionAuth: true,
      menuId: it.menuId || undefined,
      host: it.host,
      port,
      user,
      status: 'unknown',
      monitoring: false,
      rememberSecrets: false,
    };
    hosts.value = [...hosts.value, item];
    added++;
  }
  persistHosts();
  showDiscover.value = false;
  log(
    'info',
    t(
      `Imported ${added} host(s) via ${bastion.displayName} (using bastion credentials).`,
      `已从 ${bastion.displayName} 导入 ${added} 台主机（复用堡垒凭据）。`,
    ),
  );
  if (added) await syncTargets();
}

async function pollFleetOverviews() {
  if (!connectionId.value || fleetBusy.value) return;
  const targets = hosts.value.filter((h) => {
    if (!h.monitoring) return false;
    if (h.kind === 'local') return true;
    return hostHasAuth(h);
  });
  if (!targets.length) return;
  fleetBusy.value = true;
  try {
    await Promise.allSettled(
      targets.map(async (h) => {
        try {
          await refreshOverview(h.id);
        } catch (e) {
          const msg = String(e);
          if (h.id === selectedId.value) log('error', msg);
          if (
            msg.includes('not connected') ||
            msg.includes('ssh dial') ||
            msg.includes('password') ||
            msg.includes('bastion') ||
            msg.includes('jump dial') ||
            msg.includes('timed out') ||
            msg.includes('jumpserver')
          ) {
            // Keep LIVE; attempt a silent reconnect once for this host.
            hosts.value = hosts.value.map((x) =>
              x.id === h.id ? { ...x, status: 'failed', statusMessage: msg } : x,
            );
            persistHosts();
            try {
              await invoke(connectionId.value, 'process/targets/reconnect', { targetIds: [h.id] });
              await refreshOverview(h.id);
            } catch {
              if (h.id === selectedId.value && (msg.includes('bastion') || msg.includes('jump'))) {
                log('warn', t('Check bastion connection', '请检查堡垒机连接'));
              }
            }
          }
        }
      }),
    );
    lastRefreshAt.value = Date.now();
  } finally {
    fleetBusy.value = false;
  }
}

async function savePrefs() {
  await saveAlertPrefs(alertPrefs.value);
  showPrefs.value = false;
  log('info', t('Alert thresholds saved', '告警阈值已保存'));
}

function onDesktopNotifyToggle() {
  if (!alertPrefs.value.desktopNotify) return;
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') {
    void Notification.requestPermission();
  }
}

async function runConsoleCommand(cmd?: string) {
  const command = (cmd ?? consoleCmd.value).trim();
  if (!command || !connectionId.value) return;
  if (!allowDanger.value) {
    log('warn', t('Enable danger mode to run console commands', '运行控制台命令需开启危险操作'));
    return;
  }
  if (batchMode.value) {
    const ids = batchSelectedIds.value;
    if (!ids.length) {
      log('warn', t('Select at least one host for batch exec', '批量执行请至少勾选一台主机'));
      return;
    }
    batchBusy.value = true;
    consoleBusy.value = true;
    try {
      const res = await invoke<{
        command: string;
        results: {
          targetId: string;
          ok: boolean;
          error?: string;
          result?: { command: string; exitCode: number; stdout: string; stderr: string; truncated: boolean; durationMs: number };
        }[];
      }>(connectionId.value, 'process/exec/batch', { targetIds: ids, command });
      const rows = (res.results || []).map((row) => {
        const host = hostById(row.targetId);
        const label = host?.displayName || row.targetId;
        if (!row.ok || !row.result) {
          return {
            ts: Date.now(),
            command: `[${label}] ${command}`,
            exitCode: -1,
            output: row.error || 'failed',
          };
        }
        const r = row.result;
        const output = [r.stdout, r.stderr].filter(Boolean).join('\n').trim() || '(no output)';
        return {
          ts: Date.now(),
          command: `[${label}] ${r.command}`,
          exitCode: r.exitCode,
          output: r.truncated ? output + '\n…' : output,
        };
      });
      consoleHistory.value = [...rows, ...consoleHistory.value].slice(0, 80);
      consoleCmd.value = '';
      const ok = (res.results || []).filter((r) => r.ok).length;
      log('info', t(`Batch exec on ${ok}/${ids.length} host(s)`, `批量执行完成 ${ok}/${ids.length}`));
    } catch (e) {
      log('error', String(e));
    } finally {
      batchBusy.value = false;
      consoleBusy.value = false;
    }
    return;
  }
  if (needsCreds.value) return;
  consoleBusy.value = true;
  try {
    const res = await invoke<{
      result: { command: string; exitCode: number; stdout: string; stderr: string; truncated: boolean; durationMs: number };
    }>(connectionId.value, 'process/exec', {
      targetId: selectedId.value,
      command,
    });
    const r = res.result;
    const output = [r.stdout, r.stderr].filter(Boolean).join('\n').trim() || '(no output)';
    consoleHistory.value = [
      {
        ts: Date.now(),
        command: r.command,
        exitCode: r.exitCode,
        output: r.truncated ? output + '\n…' : output,
      },
      ...consoleHistory.value,
    ].slice(0, 40);
    consoleCmd.value = '';
    log('info', `exec exit=${r.exitCode} ${r.durationMs}ms`);
  } catch (e) {
    log('error', String(e));
  } finally {
    consoleBusy.value = false;
  }
}

async function loadLogs() {
  if (!connectionId.value || needsCreds.value) return;
  logBusy.value = true;
  try {
    const res = await invoke<{ result: { source: string; content: string; truncated: boolean } }>(
      connectionId.value,
      'process/logs',
      { targetId: selectedId.value, source: logSource.value, lines: 120 },
    );
    logContent.value = res.result.content || '(empty)';
    if (res.result.truncated) logContent.value += '\n…(truncated)';
  } catch (e) {
    logContent.value = String(e);
    log('error', String(e));
  } finally {
    logBusy.value = false;
  }
}

async function confirmKill() {
  if (!killTarget.value || !connectionId.value) return;
  if (!allowDanger.value) {
    log('warn', t('Enable danger mode first', '请先开启危险操作开关'));
    return;
  }
  try {
    await invoke(connectionId.value, 'process/kill', {
      targetId: selectedId.value,
      pid: killTarget.value.pid,
      signal: killSignal.value,
    });
    log('info', `kill ${killSignal.value} pid=${killTarget.value.pid}`);
    killTarget.value = null;
    await refreshProcesses(selectedId.value);
  } catch (e) {
    log('error', String(e));
  }
}

async function confirmServiceAction() {
  if (!svcAction.value || !connectionId.value) return;
  if (!allowDanger.value) {
    log('warn', t('Enable danger mode first', '请先开启危险操作开关'));
    return;
  }
  try {
    await invoke(connectionId.value, 'process/services/action', {
      targetId: selectedId.value,
      unit: svcAction.value.unit,
      action: svcAction.value.action,
    });
    log('info', `systemctl ${svcAction.value.action} ${svcAction.value.unit}`);
    svcAction.value = null;
    await refreshServices(selectedId.value);
  } catch (e) {
    log('error', String(e));
  }
}

async function copyDiagnose() {
  if (!diagnose.value) return;
  const lines = [
    diagnose.value.summary,
    ...diagnose.value.findings.map((f) => `[${f.severity}] ${f.title}: ${f.detail}`),
    diagnose.value.oomSnippet ? `\nOOM:\n${diagnose.value.oomSnippet}` : '',
  ];
  await clipboardWrite(lines.filter(Boolean).join('\n'));
  log('info', t('Copied diagnose summary', '已复制诊断摘要'));
}

function isJavaProcessRow(p: ProcessInfo): boolean {
  const n = (p.name || '').toLowerCase();
  const c = (p.cmd || '').toLowerCase();
  if (n === 'java' || n.startsWith('java')) return true;
  if (c.includes('org.springframework') || c.includes('spring-boot')) return true;
  if (c.includes('/java ') || c.includes('\\java ') || c.endsWith('/java')) return true;
  if (c.includes('-jar ') && c.includes('.jar')) return true;
  return false;
}

async function runJvmSnapshot(pid?: number) {
  if (!connectionId.value || needsCreds.value) return;
  jvmBusy.value = true;
  try {
    const snap = await invoke<JvmSnapshot>(connectionId.value, 'process/jvm/snapshot', {
      targetId: selectedId.value,
      pid: pid && pid > 0 ? pid : 0,
    });
    jvmSnap.value = snap;
    showJvm.value = true;
    log(
      'info',
      snap.pid
        ? t(`JVM snapshot pid=${snap.pid}`, `已采集 JVM 现场 pid=${snap.pid}`)
        : t('No Java process found', '未发现 Java 进程'),
    );
  } catch (e) {
    log('error', String(e));
  } finally {
    jvmBusy.value = false;
  }
}

async function copyJvmSnapshot() {
  if (!jvmSnap.value) return;
  const s = jvmSnap.value;
  const parts = [
    `JVM snapshot ${s.targetId} pid=${s.pid}`,
    s.mainClass ? `main/jar: ${s.mainClass}` : '',
    s.cmd ? `cmd: ${s.cmd}` : '',
    s.threadSummary ? `\n--- Thread summary ---\n${s.threadSummary}` : '',
    s.heapInfo ? `\n--- Heap ---\n${s.heapInfo}` : '',
    s.gcUtil ? `\n--- GC ---\n${s.gcUtil}` : '',
    s.oomSnippet ? `\n--- Host OOM ---\n${s.oomSnippet}` : '',
    ...(s.notes || []).map((n) => `note: ${n}`),
    s.threadDump ? `\n--- Thread dump ---\n${s.threadDump}` : '',
  ];
  await clipboardWrite(parts.filter(Boolean).join('\n'));
  log('info', t('Copied JVM snapshot', '已复制 JVM 现场摘要'));
}

let timer = 0;
let kaTimer = 0;
let selecting = false;

watch(tab, () => {
  if (selecting) return;
  if (tab.value === 'console') return;
  const cached =
    tab.value === 'overview'
      ? !!cacheOf(selectedId.value).overview
      : tab.value === 'processes'
        ? cacheOf(selectedId.value).processes.length > 0
        : tab.value === 'services'
          ? cacheOf(selectedId.value).services.length > 0
          : !!cacheOf(selectedId.value).diagnose;
  void refreshActive({ quiet: cached });
});

watch(useLinuxConsole, (linux) => {
  const allowed = new Set(logSourceOptions.value.map((o) => o.value));
  if (!allowed.has(logSource.value)) {
    logSource.value = linux ? 'syslog' : 'application';
  }
});

onMounted(async () => {
  const plugin = getPlugin();
  await plugin.ready;
  connectionId.value = plugin.context.connectionId || plugin.context.connection?.id || '';
  locale.value = plugin.locale || 'en';
  applyTheme(plugin.theme?.appearance || 'dark');
  try {
    const info = await plugin.getHostInfo?.();
    if (info?.locale) locale.value = info.locale;
    if (info?.theme?.appearance) applyTheme(info.theme.appearance);
  } catch {
    /* ignore */
  }
  plugin.onHostInfo?.((info) => {
    if (info?.locale) locale.value = info.locale;
    if (info?.theme?.appearance) applyTheme(info.theme.appearance);
  });
  await loadLayout();
  await loadHosts();
  alertHistory.value = await loadAlertHistory();
  applyCacheToView(selectedId.value);
  await syncTargets();
  // Resume fleet polling immediately for every host marked LIVE.
  void pollFleetOverviews();
  await refreshActive({ quiet: false });
  timer = window.setInterval(() => {
    void pollFleetOverviews();
    const h = selected.value;
    if (!h?.monitoring || needsCreds.value) return;
    if (tab.value === 'processes') {
      void refreshActive({ quiet: true });
    }
  }, POLL_MS);
  // JumpServer Opt> shells idle-out; keep them warm every 2 minutes.
  kaTimer = window.setInterval(() => {
    void keepaliveJumpSessions();
  }, 120000);
});

onUnmounted(() => {
  if (timer) window.clearInterval(timer);
  if (kaTimer) window.clearInterval(kaTimer);
  document.body.classList.remove('po-splitting', 'po-split-col', 'po-split-row');
});

async function onSelectHost(id: string) {
  selecting = true;
  try {
    await selectHost(id);
  } finally {
    selecting = false;
  }
}
</script>

<template>
  <div class="app" :class="{ 'has-drawer': showAdd || showEdit || showCreds || showJvm }">
    <div class="workbench">
    <aside class="rail" :class="{ collapsed: railCollapsed }" :style="railCollapsed ? undefined : { width: railWidth + 'px' }">
      <div class="rail-head">
        <div class="rail-title">{{ t('Asset explorer', '资产管理器') }}</div>
        <div class="icon-row">
          <button type="button" class="icon-btn" :title="t('Collapse sidebar', '收起侧栏')" @click="toggleRail">
            <PoIcon name="panel-left" :size="13" />
          </button>
          <button type="button" class="icon-btn" :title="t('Alert thresholds', '告警阈值')" @click="showPrefs = true">
            <PoIcon name="settings" :size="13" />
          </button>
          <button type="button" class="icon-btn" :title="t('Add bastion', '添加堡垒机')" @click="openAdd('bastion')">
            <PoIcon name="bastion" :size="13" />
          </button>
          <button type="button" class="icon-btn" :title="t('Add remote', '添加远程')" @click="openAdd('host')">
            <PoIcon name="plus" :size="13" />
          </button>
        </div>
      </div>
      <div class="rail-search-wrap">
        <input
          v-model="hostQuery"
          class="rail-search"
          :placeholder="t('Filter hosts…', '筛选主机…')"
        />
      </div>
      <div class="rail-list">
        <div
          v-for="row in railHosts"
          :key="row.host.id"
          class="host-item"
          :class="{ active: row.host.id === selectedId, nested: row.depth > 0 }"
          :style="row.depth ? { paddingLeft: 10 + row.depth * 14 + 'px' } : undefined"
          role="button"
          tabindex="0"
          @click="onSelectHost(row.host.id)"
          @keydown.enter="onSelectHost(row.host.id)"
        >
          <span
            class="dot"
            :class="[row.host.status || 'unknown', { pulse: row.host.monitoring && row.host.status === 'ready' }]"
          />
          <div class="host-body">
            <div class="host-name">
              {{ row.host.displayName }}
              <span v-if="isBastion(row.host)" class="mon-badge bastion">{{ t('Bastion', '堡垒') }}</span>
              <span v-if="row.host.monitoring" class="mon-badge">LIVE</span>
              <span v-if="row.host.alertCpu || row.host.alertMem || row.host.alertDisk" class="mon-badge alert">ALERT</span>
            </div>
            <div class="host-meta">
              <template v-if="row.host.kind === 'local'">local</template>
              <template v-else-if="row.host.via">
                via · {{ row.host.user }}@{{ row.host.host }}
              </template>
              <template v-else>{{ row.host.user }}@{{ row.host.host }}</template>
              <template v-if="row.host.lastCpu != null"> · CPU {{ formatPercent(row.host.lastCpu, 0) }}</template>
            </div>
          </div>
          <div class="host-actions" @click.stop>
            <button
              v-if="isBastion(row.host)"
              type="button"
              class="icon-btn"
              :title="t('Discover hosts', '发现主机')"
              @click="openDiscover(row.host.id)"
            >
              <PoIcon name="discover" :size="13" />
            </button>
            <button
              v-if="isBastion(row.host)"
              type="button"
              class="icon-btn"
              :title="t('Add host via bastion', '在堡垒下添加业务机')"
              @click="openAdd('via', row.host.id)"
            >
              <PoIcon name="plus" :size="13" />
            </button>
            <button
              v-if="row.host.kind === 'ssh'"
              type="button"
              class="icon-btn"
              :title="t('Edit host', '编辑主机')"
              @click="openEdit(row.host)"
            >
              <PoIcon name="edit" :size="13" />
            </button>
            <button
              v-if="!row.host.monitoring"
              type="button"
              class="icon-btn accent"
              :title="t('Start monitoring', '启动监控')"
              @click="startMonitor(row.host.id)"
            >
              <PoIcon name="play" :size="12" />
            </button>
            <button
              v-else
              type="button"
              class="icon-btn live-on"
              :title="t('Stop monitoring', '停止监控')"
              @click="stopMonitor(row.host.id)"
            >
              <PoIcon name="stop" :size="11" />
            </button>
          </div>
        </div>
      </div>
      <div class="rail-foot">
        <button type="button" class="btn primary foot-primary" @click="openAdd('bastion')">
          <PoIcon name="bastion" :size="14" />
          <span>{{ t('Add bastion', '添加堡垒') }}</span>
        </button>
        <button
          type="button"
          class="icon-btn foot-icon"
          :disabled="!bastionHosts.length"
          :title="t('Add host via bastion', '在堡垒下添加业务机')"
          @click="openAdd('via')"
        >
          <PoIcon name="plus" :size="13" />
        </button>
        <button
          type="button"
          class="icon-btn foot-icon"
          :disabled="!selectedBastion"
          :title="t('Discover hosts', '发现主机')"
          @click="openDiscover()"
        >
          <PoIcon name="discover" :size="13" />
        </button>
        <button
          type="button"
          class="icon-btn foot-icon danger"
          :disabled="!selected || selected.kind !== 'ssh'"
          :title="t('Remove remote', '删除远程')"
          @click="removeSelectedRemote"
        >
          <PoIcon name="minus" :size="13" />
        </button>
      </div>
    </aside>

    <button
      v-if="railCollapsed"
      type="button"
      class="rail-expand"
      :title="t('Expand sidebar', '展开侧栏')"
      @click="toggleRail"
    >
      <PoIcon name="panel-right" :size="15" />
    </button>
    <div
      v-else
      class="split-v"
      role="separator"
      aria-orientation="vertical"
      :aria-valuenow="railWidth"
      tabindex="0"
      @pointerdown="onSplitPointerDown('rail', $event)"
      @pointermove="onSplitPointerMove"
      @pointerup="onSplitPointerUp"
      @pointercancel="onSplitPointerUp"
    />

    <div class="main">
      <header class="editor-chrome">
        <div class="title-row">
          <div class="crumb">
            <span class="dot" :class="selected?.status || 'unknown'" />
            <template v-for="(part, i) in crumbPath" :key="i">
              <span v-if="i" class="sep">/</span>
              <span :class="i === crumbPath.length - 1 ? 'crumb-leaf' : 'crumb-part'">{{ part }}</span>
            </template>
          </div>
          <div class="topbar-spacer" />
          <div class="toolbar-inline">
            <button
              type="button"
              class="btn"
              :class="selectedMonitoring ? 'warn' : 'ok'"
              @click="toggleSelectedMonitor"
            >
              <span v-if="selectedMonitoring" class="live" />
              {{
                selectedMonitoring
                  ? t('Stop monitor', '停止监控')
                  : t('Start monitor', '启动监控')
              }}
            </button>
            <button
              type="button"
              class="btn"
              :title="t('Start monitoring on all hosts', '全部启动监控')"
              @click="startMonitorAll"
            >
              <PoIcon name="play" :size="13" />
              {{ t('All on', '全开') }}
            </button>
            <button
              type="button"
              class="btn"
              :title="t('Stop monitoring on all hosts', '全部停止监控')"
              @click="stopMonitorAll"
            >
              <PoIcon name="stop" :size="12" />
              {{ t('All off', '全停') }}
            </button>
            <button
              type="button"
              class="btn"
              :disabled="reconnectBusy"
              :title="t('Reconnect failed SSH / JumpServer sessions', '重连失败的 SSH / JumpServer 会话')"
              @click="reconnectFailed"
            >
              <PoIcon name="refresh" :size="13" />
              {{ reconnectBusy ? '…' : t('Reconnect', '重连') }}
            </button>
            <button
              type="button"
              class="btn"
              :disabled="loading"
              :title="refreshingQuiet ? t('Updating…', '更新中…') : ''"
              @click="refreshActive({ quiet: !!overview || processes.length > 0 })"
            >
              <span v-if="refreshingQuiet" class="live" />
              {{ loading ? '…' : t('Refresh', '刷新') }}
            </button>
            <label class="gate">
              <input v-model="allowDanger" type="checkbox" />
              {{ t('Danger', '危险操作') }}
            </label>
          </div>
        </div>
        <nav class="tabs">
          <button type="button" class="tab" :class="{ active: tab === 'overview' }" @click="tab = 'overview'">
            {{ t('Overview', '总览') }}
          </button>
          <button type="button" class="tab" :class="{ active: tab === 'processes' }" @click="tab = 'processes'">
            {{ t('Processes', '进程') }}
          </button>
          <button type="button" class="tab" :class="{ active: tab === 'services' }" @click="tab = 'services'">
            {{ t('Services', '服务') }}
          </button>
          <button type="button" class="tab" :class="{ active: tab === 'diagnose' }" @click="tab = 'diagnose'">
            {{ t('Diagnose', '诊断') }}
          </button>
          <button type="button" class="tab" :class="{ active: tab === 'console' }" @click="tab = 'console'">
            {{ t('Console', '控制台') }}
          </button>
        </nav>
      </header>

      <div class="center-col">
      <div class="stage">
        <div v-if="needsCreds" class="state-card">
          <h3>{{ t('Host not connected', '主机未连接') }}</h3>
          <p>
            {{
              selected?.via && selected.useBastionAuth !== false
                ? t(
                    'This host reuses bastion credentials. Connect / unlock the bastion first, then retry.',
                    '该主机复用堡垒凭据。请先连接/解锁堡垒机，再重试。',
                  )
                : t(
                    'SSH credentials are session-only. Enter password or private key to reconnect, then monitoring can resume.',
                    'SSH 凭证仅保存在当前会话。填写密码或私钥重新连接后，即可恢复监控。',
                  )
            }}
          </p>
          <div class="host-meta" style="margin-bottom: 12px">
            {{ selected?.user }}@{{ selected?.host }}:{{ selected?.port || 22 }}
            <template v-if="selected?.via"> · via {{ hostById(selected.via)?.displayName || selected.via }}</template>
            <template v-if="selected?.statusMessage"> · {{ selected.statusMessage }}</template>
          </div>
          <div class="actions">
            <button
              v-if="selected?.via && selected.useBastionAuth !== false && selectedBastion"
              type="button"
              class="btn primary"
              @click="onSelectHost(selectedBastion.id)"
            >
              {{ t('Open bastion', '打开堡垒机') }}
            </button>
            <button type="button" class="btn primary" @click="openCreds">
              {{ t('Enter credentials', '填写凭证') }}
            </button>
            <button type="button" class="btn" @click="onSelectHost('localhost')">
              {{ t('Switch to localhost', '切到本机') }}
            </button>
          </div>
        </div>

        <div v-else-if="connectBlocked" class="state-card">
          <h3>{{ t('Bastion path not ready', '经堡垒通路未就绪') }}</h3>
          <p>
            {{
              t(
                'JumpServer assets are entered via Opt> (not ProxyJump). Re-sync to open the asset shell, then refresh.',
                'JumpServer 资产需经 Opt> 进入（不是 ProxyJump）。请重新同步打开资产壳后再刷新。',
              )
            }}
          </p>
          <div class="host-meta" style="margin-bottom: 12px">
            {{ selected?.host }}
            <template v-if="selected?.menuId"> · Opt#{{ selected.menuId }}</template>
            <template v-if="selected?.via"> · via {{ hostById(selected.via)?.displayName || selected.via }}</template>
            <template v-if="selected?.statusMessage"> · {{ selected.statusMessage }}</template>
          </div>
          <div class="actions">
            <button type="button" class="btn primary" :disabled="loading" @click="reconnectViaBastion">
              {{ loading ? '…' : t('Reconnect via bastion', '经堡垒重连') }}
            </button>
            <button
              v-if="selectedBastion"
              type="button"
              class="btn"
              @click="onSelectHost(selectedBastion.id)"
            >
              {{ t('Open bastion', '打开堡垒机') }}
            </button>
          </div>
        </div>

        <template v-else-if="tab === 'overview'">
          <div v-if="!overview && loading" class="empty">{{ t('Loading…', '加载中…') }}</div>
          <div v-else-if="!overview" class="state-card">
            <h3>{{ t('No metrics yet', '暂无指标') }}</h3>
            <p>{{ t('Start monitoring or refresh to pull CPU / memory / disk.', '启动监控或点刷新以拉取 CPU / 内存 / 磁盘。') }}</p>
            <div class="actions">
              <button type="button" class="btn primary" @click="startMonitor(selectedId)">
                {{ t('Start monitor', '启动监控') }}
              </button>
              <button type="button" class="btn" @click="refreshActive()">
                {{ t('Refresh', '刷新') }}
              </button>
            </div>
          </div>
          <template v-else>
            <div class="metrics">
              <div class="metric">
                <div class="label">
                  CPU
                  <svg class="spark" width="72" height="18" aria-hidden="true">
                    <path
                      :d="sparklinePath(cpuHistory, 72, 18)"
                      fill="none"
                      stroke="var(--accent)"
                      stroke-width="1.4"
                    />
                  </svg>
                </div>
                <div class="value metric-val">{{ formatPercent(overview.cpuPercent) }}</div>
                <div class="sub">{{ overview.cpuCount }} {{ t('cores', '核') }}</div>
                <div class="bar" :class="pressureClass(overview.cpuPercent)">
                  <i :style="{ width: Math.min(100, overview.cpuPercent) + '%' }" />
                </div>
              </div>
              <div class="metric">
                <div class="label">
                  {{ t('Memory', '内存') }}
                  <svg class="spark" width="72" height="18" aria-hidden="true">
                    <path
                      :d="sparklinePath(memHistory, 72, 18)"
                      fill="none"
                      stroke="var(--accent)"
                      stroke-width="1.4"
                    />
                  </svg>
                </div>
                <div class="value metric-val">{{ formatPercent(overview.memPercent) }}</div>
                <div class="sub">
                  {{ formatBytes(overview.memUsed) }} / {{ formatBytes(overview.memTotal) }}
                </div>
                <div class="bar" :class="pressureClass(overview.memPercent)">
                  <i :style="{ width: Math.min(100, overview.memPercent) + '%' }" />
                </div>
              </div>
              <div class="metric">
                <div class="label">Load</div>
                <div class="value metric-val">{{ overview.load1.toFixed(2) }}</div>
                <div class="sub">
                  {{ overview.load5.toFixed(2) }} / {{ overview.load15.toFixed(2) }}
                </div>
              </div>
              <div class="metric">
                <div class="label">Uptime</div>
                <div class="value metric-val">{{ formatUptime(overview.uptimeSec) }}</div>
                <div class="sub" :title="overview.os">
                  {{ overview.hostname || '—' }} · {{ overview.os }}
                </div>
              </div>
            </div>

            <div class="split-2">
              <div class="box">
                <div class="box-head">
                  <span>{{ t('Disks', '磁盘') }}</span>
                  <button type="button" class="btn sm ghost" @click="showNoiseDisks = !showNoiseDisks">
                    {{
                      showNoiseDisks
                        ? t('Hide noise', '隐藏噪声')
                        : t(`Show all (+${hiddenDiskCount})`, `显示全部 (+${hiddenDiskCount})`)
                    }}
                  </button>
                </div>
                <div class="box-body">
                  <table class="data">
                    <thead>
                      <tr>
                        <th>{{ t('Mount', '挂载点') }}</th>
                        <th>{{ t('Used', '已用') }}</th>
                        <th>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="d in visibleDisks" :key="d.mount + d.device">
                        <td class="mono" :title="d.device">{{ d.mount }}</td>
                        <td>{{ formatBytes(d.used) }} / {{ formatBytes(d.total) }}</td>
                        <td>
                          <div class="pct-cell">
                            <span>{{ formatPercent(d.usedPercent, 0) }}</span>
                            <span class="mini"><i :style="{ width: Math.min(100, d.usedPercent) + '%' }" /></span>
                          </div>
                        </td>
                      </tr>
                      <tr v-if="!visibleDisks.length">
                        <td colspan="3" class="empty">{{ t('No significant mounts', '无显著挂载点') }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div class="box">
                <div class="box-head">{{ t('Network', '网络') }}</div>
                <div class="box-body">
                  <table class="data">
                    <thead>
                      <tr>
                        <th>{{ t('Iface', '网卡') }}</th>
                        <th>RX</th>
                        <th>TX</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="n in overview.network" :key="n.name">
                        <td>{{ n.name }}</td>
                        <td>{{ formatBytes(n.rx) }}</td>
                        <td>{{ formatBytes(n.tx) }}</td>
                      </tr>
                      <tr v-if="!overview.network?.length">
                        <td colspan="3" class="empty">—</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </template>
        </template>

        <template v-else-if="tab === 'processes'">
          <div class="panel-toolbar">
            <input
              v-model="procQuery"
              class="rail-search"
              style="max-width: 280px"
              :placeholder="t('Filter name / pid / cmd…', '过滤名称 / PID / 命令…')"
              @keyup.enter="refreshProcesses(selectedId)"
            />
            <button type="button" class="btn" @click="refreshProcesses(selectedId)">{{ t('Apply', '应用') }}</button>
            <span class="host-meta">{{ visibleProcesses.length }}/{{ processes.length }}</span>
          </div>
          <div class="box">
            <div class="box-body" style="max-height: none">
              <table class="data dense">
                <thead>
                  <tr>
                    <th :class="{ sorted: procSort === 'pid' }" @click="procSort = 'pid'">PID</th>
                    <th :class="{ sorted: procSort === 'name' }" @click="procSort = 'name'">
                      {{ t('Name', '名称') }}
                    </th>
                    <th>{{ t('User', '用户') }}</th>
                    <th :class="{ sorted: procSort === 'cpu' }" @click="procSort = 'cpu'">CPU</th>
                    <th :class="{ sorted: procSort === 'mem' }" @click="procSort = 'mem'">MEM</th>
                    <th>{{ t('Command', '命令') }}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in visibleProcesses" :key="p.pid">
                    <td class="num">{{ p.pid }}</td>
                    <td class="ellipsis" :title="p.name">{{ p.name }}</td>
                    <td class="ellipsis">{{ p.user }}</td>
                    <td class="num metric-val">{{ formatPercent(p.cpu) }}</td>
                    <td class="num metric-val">{{ formatPercent(p.mem) }}</td>
                    <td class="mono ellipsis" :title="p.cmd">{{ shortPath(p.cmd, 64) }}</td>
                    <td style="white-space: nowrap">
                      <button
                        v-if="isJavaProcessRow(p)"
                        type="button"
                        class="btn sm"
                        :disabled="jvmBusy"
                        :title="t('JVM snapshot: jstack + GC + OOM', 'JVM 现场：线程栈 + GC + OOM')"
                        @click="runJvmSnapshot(p.pid)"
                      >
                        JVM
                      </button>
                      <button
                        type="button"
                        class="btn sm danger"
                        :disabled="p.pid <= 1 || !allowDanger"
                        @click="killTarget = p"
                      >
                        Kill
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>

        <template v-else-if="tab === 'services'">
          <div v-if="!linuxCapable" class="empty">
            {{
              servicesMessage ||
              t(
                'Service management needs Linux (systemd) or local Windows.',
                '服务管理需要 Linux（systemd）或本机 Windows。',
              )
            }}
          </div>
          <template v-else>
            <div class="panel-toolbar">
              <input
                v-model="svcQuery"
                class="rail-search"
                style="max-width: 280px"
                :placeholder="t('Filter units…', '过滤单元…')"
              />
            </div>
            <div class="box">
              <div class="box-body" style="max-height: none">
                <table class="data">
                  <thead>
                    <tr>
                      <th>Unit</th>
                      <th>Active</th>
                      <th>Sub</th>
                      <th>{{ t('Description', '描述') }}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="s in filteredServices" :key="s.unit">
                      <td class="mono">{{ s.unit }}</td>
                      <td>{{ s.active }}</td>
                      <td>{{ s.sub }}</td>
                      <td>{{ s.description }}</td>
                      <td style="white-space: nowrap">
                        <button type="button" class="btn sm" :disabled="!allowDanger" @click="svcAction = { unit: s.unit, action: 'restart' }">restart</button>
                        <button type="button" class="btn sm" :disabled="!allowDanger" @click="svcAction = { unit: s.unit, action: 'stop' }">stop</button>
                        <button type="button" class="btn sm" :disabled="!allowDanger" @click="svcAction = { unit: s.unit, action: 'start' }">start</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </template>
        </template>

        <template v-else-if="tab === 'diagnose'">
          <div class="panel-toolbar">
            <button type="button" class="btn primary" :disabled="loading" @click="runDiagnose(selectedId)">
              <PoIcon name="run" :size="14" />
              {{ t('Run diagnose', '运行诊断') }}
            </button>
            <button
              type="button"
              class="btn"
              :disabled="jvmBusy || needsCreds"
              :title="t('Capture top Java: thread dump + GC + host OOM', '采集最高负载 Java：线程栈 + GC + 宿主机 OOM')"
              @click="runJvmSnapshot()"
            >
              {{ jvmBusy ? '…' : t('JVM snapshot', 'JVM 现场') }}
            </button>
            <button type="button" class="btn" :disabled="!diagnose" @click="copyDiagnose">
              <PoIcon name="copy" :size="14" />
              {{ t('Copy summary', '复制摘要') }}
            </button>
          </div>
          <div v-if="!diagnose" class="empty">
            {{ t('Run diagnose to aggregate CPU / memory / disk / OOM clues', '运行诊断以聚合 CPU / 内存 / 磁盘 / OOM 线索') }}
          </div>
          <template v-else>
            <h3 style="margin: 0 0 8px">{{ diagnose.summary }}</h3>
            <div
              v-for="(f, i) in diagnose.findings"
              :key="i"
              class="finding"
              :class="f.severity"
            >
              <strong>{{ f.title }}</strong>
              <div class="host-meta">{{ f.detail }}</div>
            </div>
            <div class="split-2 section">
              <div class="box">
                <div class="box-head">{{ t('Top CPU', 'CPU Top') }}</div>
                <div class="box-body">
                  <table class="data dense">
                    <tbody>
                      <tr v-for="p in diagnose.topCpu" :key="'c' + p.pid">
                        <td class="num">{{ p.pid }}</td>
                        <td class="ellipsis" :title="p.name">{{ p.name }}</td>
                        <td class="num">{{ formatPercent(p.cpu) }}</td>
                        <td class="mono ellipsis" :title="p.cmd">{{ shortPath(p.cmd, 48) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div class="box">
                <div class="box-head">{{ t('Top Memory', '内存 Top') }}</div>
                <div class="box-body">
                  <table class="data dense">
                    <tbody>
                      <tr v-for="p in diagnose.topMem" :key="'m' + p.pid">
                        <td class="num">{{ p.pid }}</td>
                        <td class="ellipsis" :title="p.name">{{ p.name }}</td>
                        <td class="num">{{ formatPercent(p.mem) }}</td>
                        <td class="mono ellipsis" :title="p.cmd">{{ shortPath(p.cmd, 48) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div v-if="diagnose.oomSnippet" class="section">
              <div class="box">
                <div class="box-head">OOM</div>
                <pre class="pre mono">{{ diagnose.oomSnippet }}</pre>
              </div>
            </div>
          </template>
        </template>

        <template v-else-if="tab === 'console'">
          <div class="banner" v-if="!allowDanger">
            <span class="grow">
              {{ t('Turn on Danger to run commands. Read-only log peek is available below.', '开启危险操作后可执行命令；下方日志快看可直接使用。') }}
            </span>
          </div>
          <div class="panel-toolbar">
            <label class="gate">
              <input v-model="batchMode" type="checkbox" />
              {{ t('Batch hosts', '批量主机') }}
            </label>
            <template v-if="batchMode">
              <button type="button" class="btn sm" @click="selectAllBatchHosts">
                {{ t('Select all', '全选') }}
              </button>
              <span class="host-meta">{{ batchSelectedIds.length }} {{ t('selected', '台已选') }}</span>
            </template>
          </div>
          <div v-if="batchMode" class="batch-hosts">
            <label v-for="h in hosts" :key="h.id" class="batch-host">
              <input
                type="checkbox"
                :checked="!!batchSelected[h.id]"
                :disabled="h.kind === 'ssh' && !hostHasAuth(h)"
                @change="toggleBatchHost(h.id)"
              />
              <span class="mono">{{ h.displayName }}</span>
            </label>
          </div>
          <div class="panel-toolbar">
            <input
              v-model="consoleCmd"
              class="rail-search"
              style="flex: 1; max-width: none"
              :placeholder="
                batchMode
                  ? t('Command on selected hosts…', '对勾选主机执行命令…')
                  : t('Command… (Enter to run)', '输入命令…（回车执行）')
              "
              :disabled="consoleBusy || !allowDanger"
              @keyup.enter="runConsoleCommand()"
            />
            <button
              type="button"
              class="btn primary"
              :disabled="consoleBusy || !allowDanger || !consoleCmd.trim() || batchBusy"
              @click="runConsoleCommand()"
            >
              {{ consoleBusy ? '…' : batchMode ? t('Run batch', '批量执行') : t('Run', '执行') }}
            </button>
          </div>
          <div class="panel-toolbar">
            <button
              v-for="chip in consoleChips"
              :key="chip"
              type="button"
              class="btn sm"
              :disabled="!allowDanger || consoleBusy"
              @click="runConsoleCommand(chip)"
            >
              {{ chip }}
            </button>
          </div>
          <div class="box" style="margin-bottom: 12px">
            <div class="box-head">{{ t('Session output', '会话输出') }}</div>
            <div class="box-body console-out">
              <div v-if="!consoleHistory.length" class="empty">
                {{ t('No commands yet', '暂无命令') }}
              </div>
              <div v-for="(row, i) in consoleHistory" :key="i" class="console-block">
                <div class="console-meta">
                  <span class="mono">$ {{ row.command }}</span>
                  <span class="host-meta">exit {{ row.exitCode }} · {{ new Date(row.ts).toLocaleTimeString() }}</span>
                </div>
                <pre class="pre mono">{{ row.output }}</pre>
              </div>
            </div>
          </div>
          <div class="box">
            <div class="box-head">
              <span>{{ t('Log peek', '日志快看') }}</span>
              <span style="display: flex; gap: 6px; align-items: center">
                <select v-model="logSource" class="rail-search" style="width: auto; height: 22px">
                  <option v-for="opt in logSourceOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
                <button type="button" class="btn sm" :disabled="logBusy" @click="loadLogs">
                  {{ logBusy ? '…' : t('Fetch', '拉取') }}
                </button>
              </span>
            </div>
            <pre class="pre mono" style="max-height: 280px">{{ logContent || t('Fetch recent logs for this host.', '拉取该主机最近日志。') }}</pre>
          </div>
        </template>
      </div>

      <div
        class="split-h"
        role="separator"
        aria-orientation="horizontal"
        :aria-valuenow="dockHeight"
        tabindex="0"
        @pointerdown="onSplitPointerDown('dock', $event)"
        @pointermove="onSplitPointerMove"
        @pointerup="onSplitPointerUp"
        @pointercancel="onSplitPointerUp"
      />

      <div class="dock" :class="{ collapsed: !dockOpen }" :style="dockOpen ? { height: dockHeight + 'px' } : undefined">
        <div class="dock-bar">
          <button type="button" class="dock-tab" :class="{ active: dockTab === 'output' }" @click="dockTab = 'output'">
            {{ t('Output', '输出') }}
            <span class="host-meta">{{ logs.length }}</span>
          </button>
          <button type="button" class="dock-tab" :class="{ active: dockTab === 'alerts' }" @click="dockTab = 'alerts'">
            {{ t('Alerts', '告警') }}
            <span class="host-meta">{{ alertHistory.length }}</span>
          </button>
          <span class="topbar-spacer" />
          <button type="button" class="icon-btn" :title="dockOpen ? t('Collapse', '收起') : t('Expand', '展开')" @click="toggleDock">
            <PoIcon :name="dockOpen ? 'panel-left' : 'panel-right'" :size="14" />
          </button>
        </div>
        <div class="dock-body">
          <template v-if="dockTab === 'output'">
            <div
              v-for="(l, i) in logs"
              :key="i"
              :class="l.level === 'error' ? 'err' : l.level === 'warn' ? 'warn' : ''"
            >
              {{ new Date(l.ts).toLocaleTimeString() }} · {{ l.message }}
            </div>
            <div v-if="!logs.length" class="host-meta">{{ t('No output yet', '暂无输出') }}</div>
          </template>
          <template v-else>
            <div v-for="(a, i) in alertHistory" :key="i" class="warn">
              {{ new Date(a.ts).toLocaleTimeString() }} · {{ a.hostName }} · {{ a.kind.toUpperCase() }}
              {{ a.value.toFixed(0) }}% ≥ {{ a.threshold }}%
            </div>
            <div v-if="!alertHistory.length" class="host-meta">
              {{ t('No alerts yet — thresholds fire on rising edge while monitoring.', '暂无告警；监控中超阈值时会上升沿记录。') }}
            </div>
          </template>
        </div>
      </div>
      </div>
    </div>
    </div>

    <footer class="status-bar">
      <span class="pill">
        <span class="dot" :class="selected?.status || 'unknown'" />
        {{ selected?.status || '—' }}
      </span>
      <span class="pill">
        <span v-if="selectedMonitoring" class="live" />
        {{
          selectedMonitoring
            ? t('Monitoring', '监控中')
            : t('Idle', '未监控')
        }}
      </span>
      <span>{{ monitoringCount }} {{ t('live', '路监控') }}</span>
      <span v-if="alertCount" class="pill" style="color: var(--warn)">
        {{ alertCount }} {{ t('alerts', '告警') }}
      </span>
      <span class="spacer" />
      <span v-if="fleetBusy || refreshingQuiet" class="pill"><span class="live" />{{ t('Syncing', '同步中') }}</span>
      <span v-if="lastRefreshAt">
        {{ t('Updated', '更新于') }} {{ new Date(lastRefreshAt).toLocaleTimeString() }}
      </span>
    </footer>

    <!-- Add host: side drawer — does not close on backdrop / accidental click -->
    <aside v-if="showAdd" class="form-drawer" role="dialog" aria-modal="true">
      <div class="form-drawer-head">
        <h3>
          {{
            draft.role === 'bastion'
              ? t('Add bastion (jump host)', '添加堡垒机（跳板）')
              : draft.via
                ? t('Add host via bastion', '经堡垒添加业务机')
                : t('Add remote SSH host', '添加远程 SSH 主机')
          }}
        </h3>
        <button type="button" class="icon-btn" :title="t('Close', '关闭')" @click="closeAdd">
          <PoIcon name="close" :size="15" />
        </button>
      </div>
      <div class="form-drawer-body">
        <label class="field">
          <span>{{ t('Type', '类型') }}</span>
          <select
            :value="draft.role === 'bastion' ? 'bastion' : draft.via ? 'via' : 'host'"
            @change="onAddTypeChange(($event.target as HTMLSelectElement).value)"
          >
            <option value="bastion">{{ t('Bastion', '堡垒机') }}</option>
            <option value="host">{{ t('Direct SSH', '直连 SSH') }}</option>
            <option value="via" :disabled="!bastionHosts.length">
              {{ t('Via bastion', '经堡垒跳板') }}
            </option>
          </select>
        </label>
        <label v-if="draft.role !== 'bastion' && (draft.via || bastionHosts.length)" class="field">
          <span>{{ t('Bastion', '堡垒机') }}</span>
          <select v-model="draft.via">
            <option value="">{{ t('None (direct)', '无（直连）') }}</option>
            <option v-for="b in bastionHosts" :key="b.id" :value="b.id">{{ b.displayName }}</option>
          </select>
        </label>
        <label class="field"><span>{{ t('Display name', '显示名') }}</span><input v-model="draft.displayName" /></label>
        <label v-if="draft.role === 'bastion'" class="gate">
          <input
            type="checkbox"
            :checked="draft.bastionKind === 'jumpserver'"
            @change="
              draft.bastionKind = ($event.target as HTMLInputElement).checked ? 'jumpserver' : 'ssh';
              if (draft.bastionKind === 'jumpserver' && (!draft.port || draft.port === 22)) draft.port = 2222;
            "
          />
          {{ t('JumpServer / KoKo (Opt> asset menu)', 'JumpServer / KoKo（Opt> 资产菜单）') }}
        </label>
        <label v-if="draft.role === 'bastion' && draft.bastionKind === 'jumpserver'" class="field">
          <span>{{ t('Web API port', 'Web API 端口') }}</span>
          <input v-model.number="draft.webPort" type="number" placeholder="801" />
        </label>
        <label class="field">
          <span>Host</span>
          <input
            v-model="draft.host"
            :placeholder="draft.via ? t('Internal IP / hostname', '内网 IP / 主机名') : '127.0.0.1'"
          />
        </label>
        <label class="field"><span>Port</span><input v-model.number="draft.port" type="number" /></label>
        <label v-if="draft.via" class="gate">
          <input v-model="draft.useBastionAuth" type="checkbox" />
          {{ t('Use bastion credentials (no separate password)', '复用堡垒凭据（业务机免再填密码）') }}
        </label>
        <label v-if="!(draft.via && draft.useBastionAuth)" class="field">
          <span>User</span><input v-model="draft.user" />
        </label>
        <div v-if="draft.via && draft.useBastionAuth" class="host-meta">
          {{
            t(
              `Inner hop will authenticate as bastion user “${hostById(draft.via)?.user || '…'}”. Override by unchecking above.`,
              `内网跳转将使用堡垒账号「${hostById(draft.via)?.user || '…'}」。取消勾选可单独填写业务机凭据。`,
            )
          }}
        </div>
        <template v-if="!(draft.via && draft.useBastionAuth)">
          <SshAuthFields v-model="authDraft" :zh="zh" />
          <label class="gate"><input v-model="rememberSecrets" type="checkbox" /> {{ t('Remember credentials in this workspace', '在本工作区记住凭证') }}</label>
          <div class="host-meta">{{ t('Remembered secrets are stored in host plugin storage for this workspace only.', '勾选后凭证写入本工作区插件存储；不勾选则仅会话内存。') }}</div>
        </template>
        <div v-if="probeMsg" class="probe" :class="{ ok: probeOk === true, bad: probeOk === false }">{{ probeMsg }}</div>
        <div v-if="pendingHostKey && probeOk === false" class="modal-actions" style="justify-content: flex-start">
          <button type="button" class="btn warn" :disabled="probeBusy" @click="trustHostKeyAndProbe">
            {{ t('Trust host key & retry', '信任主机密钥并重试') }}
          </button>
        </div>
      </div>
      <div class="form-drawer-foot">
        <button type="button" class="btn" :disabled="probeBusy" @click="probeDraft()">
          {{ probeBusy ? t('Probing…', '探测中…') : t('Test connection', '测连接') }}
        </button>
        <span class="topbar-spacer" />
        <button type="button" class="btn" @click="closeAdd">{{ t('Cancel', '取消') }}</button>
        <button type="button" class="btn primary" @click="saveRemote">{{ t('Save & monitor', '保存并监控') }}</button>
      </div>
    </aside>

    <div v-if="showEdit" class="modal-backdrop">
      <div class="modal" @click.stop>
        <div class="modal-head">
          <h3>{{ t('Edit remote host', '编辑远程主机') }}</h3>
          <button type="button" class="icon-btn" @click="showEdit = false">
            <PoIcon name="close" :size="15" />
          </button>
        </div>
        <label v-if="draft.role !== 'bastion'" class="field">
          <span>{{ t('Bastion', '堡垒机') }}</span>
          <select v-model="draft.via">
            <option value="">{{ t('None (direct)', '无（直连）') }}</option>
            <option v-for="b in bastionHosts" :key="b.id" :value="b.id">{{ b.displayName }}</option>
          </select>
        </label>
        <label class="field"><span>{{ t('Display name', '显示名') }}</span><input v-model="draft.displayName" /></label>
        <label class="field"><span>Host</span><input v-model="draft.host" /></label>
        <label class="field"><span>Port</span><input v-model.number="draft.port" type="number" /></label>
        <label v-if="draft.via" class="gate">
          <input v-model="draft.useBastionAuth" type="checkbox" />
          {{ t('Use bastion credentials (no separate password)', '复用堡垒凭据（业务机免再填密码）') }}
        </label>
        <label v-if="!(draft.via && draft.useBastionAuth)" class="field">
          <span>User</span><input v-model="draft.user" />
        </label>
        <template v-if="!(draft.via && draft.useBastionAuth)">
          <SshAuthFields v-model="authDraft" :zh="zh" optional-secrets />
          <label class="gate"><input v-model="rememberSecrets" type="checkbox" /> {{ t('Remember credentials in this workspace', '在本工作区记住凭证') }}</label>
        </template>
        <div v-if="probeMsg" class="probe" :class="{ ok: probeOk === true, bad: probeOk === false }">{{ probeMsg }}</div>
        <div v-if="pendingHostKey && probeOk === false" class="modal-actions" style="justify-content: flex-start">
          <button type="button" class="btn warn" :disabled="probeBusy" @click="trustHostKeyAndProbe">
            {{ t('Trust host key & retry', '信任主机密钥并重试') }}
          </button>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn" :disabled="probeBusy" @click="probeDraft({ optionalKeep: true })">
            {{ probeBusy ? t('Probing…', '探测中…') : t('Test connection', '测连接') }}
          </button>
          <span class="topbar-spacer" />
          <button type="button" class="btn" @click="showEdit = false">{{ t('Cancel', '取消') }}</button>
          <button type="button" class="btn primary" @click="saveEdit">{{ t('Save', '保存') }}</button>
        </div>
      </div>
    </div>

    <div v-if="showCreds" class="modal-backdrop">
      <div class="modal" @click.stop>
        <div class="modal-head">
          <h3>{{ t('SSH credentials', 'SSH 凭证') }}</h3>
          <button type="button" class="icon-btn" @click="showCreds = false">
            <PoIcon name="close" :size="15" />
          </button>
        </div>
        <div class="host-meta">{{ draft.user }}@{{ draft.host }}:{{ draft.port }}</div>
        <label v-if="draft.via" class="gate">
          <input v-model="draft.useBastionAuth" type="checkbox" />
          {{ t('Use bastion credentials (no separate password)', '复用堡垒凭据（业务机免再填密码）') }}
        </label>
        <template v-if="!(draft.via && draft.useBastionAuth)">
          <SshAuthFields v-model="authDraft" :zh="zh" />
          <label class="gate"><input v-model="rememberSecrets" type="checkbox" /> {{ t('Remember credentials in this workspace', '在本工作区记住凭证') }}</label>
        </template>
        <div v-else class="host-meta">
          {{ t('Will reuse the bastion login for this host.', '将复用堡垒机登录凭据访问该主机。') }}
        </div>
        <div v-if="probeMsg" class="probe" :class="{ ok: probeOk === true, bad: probeOk === false }">{{ probeMsg }}</div>
        <div v-if="pendingHostKey && probeOk === false" class="modal-actions" style="justify-content: flex-start">
          <button type="button" class="btn warn" :disabled="probeBusy" @click="trustHostKeyAndProbe">
            {{ t('Trust host key & retry', '信任主机密钥并重试') }}
          </button>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn" :disabled="probeBusy" @click="probeDraft()">
            {{ probeBusy ? t('Probing…', '探测中…') : t('Test connection', '测连接') }}
          </button>
          <span class="topbar-spacer" />
          <button type="button" class="btn" @click="showCreds = false">{{ t('Cancel', '取消') }}</button>
          <button type="button" class="btn primary" @click="saveCreds">{{ t('Connect', '连接') }}</button>
        </div>
      </div>
    </div>

    <div v-if="showDiscover" class="modal-backdrop">
      <div class="modal" style="max-width: 520px" @click.stop>
        <div class="modal-head">
          <h3>{{ t('Discover hosts on bastion', '从堡垒机发现主机') }}</h3>
          <button type="button" class="icon-btn" @click="showDiscover = false">
            <PoIcon name="close" :size="15" />
          </button>
        </div>
        <p class="host-meta">
          {{ hostById(discoverBastionId)?.displayName || discoverBastionId }} ·
          {{ t('Pick hosts to import (add credentials after).', '勾选导入后请补齐业务机凭据。') }}
        </p>
        <div class="modal-actions" style="justify-content: flex-start; margin-bottom: 8px">
          <button type="button" class="btn" :disabled="discoverBusy" @click="runDiscover">
            {{ discoverBusy ? '…' : t('Refresh', '刷新') }}
          </button>
        </div>
        <div class="discover-list">
          <div v-if="!discoverItems.length && !discoverBusy" class="empty">
            {{ t('No candidates', '无候选主机') }}
          </div>
          <label v-for="it in discoverItems" :key="`${it.host}:${it.port || 22}`" class="discover-row">
            <input v-model="discoverSelected[`${it.host}:${it.port || 22}`]" type="checkbox" />
            <span class="grow">
              <span class="mono">{{ it.name || it.host }}</span>
              <span class="host-meta">
                {{ it.host }}:{{ it.port || 22 }}
                <template v-if="it.user"> · {{ it.user }}</template>
                · {{ it.source }}
              </span>
            </span>
          </label>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn" @click="showDiscover = false">{{ t('Cancel', '取消') }}</button>
          <button type="button" class="btn primary" :disabled="discoverBusy" @click="importDiscovered">
            {{ t('Import selected', '导入所选') }}
          </button>
        </div>
      </div>
    </div>

    <aside v-if="showJvm && jvmSnap" class="form-drawer jvm-drawer" role="dialog" aria-modal="true">
      <div class="form-drawer-head">
        <h3>
          {{ t('JVM snapshot', 'JVM 现场') }}
          <span v-if="jvmSnap.pid" class="host-meta">pid={{ jvmSnap.pid }}</span>
        </h3>
        <button type="button" class="icon-btn" @click="showJvm = false">
          <PoIcon name="close" :size="15" />
        </button>
      </div>
      <div class="form-drawer-body">
        <div class="host-meta" v-if="jvmSnap.mainClass">{{ jvmSnap.mainClass }}</div>
        <div class="mono host-meta" v-if="jvmSnap.cmd" :title="jvmSnap.cmd">{{ shortPath(jvmSnap.cmd, 100) }}</div>
        <div class="host-meta">
          CPU {{ formatPercent(jvmSnap.cpu) }} · MEM {{ formatPercent(jvmSnap.mem) }}
          <template v-if="jvmSnap.tools?.length"> · {{ jvmSnap.tools.join(', ') }}</template>
        </div>
        <div v-if="jvmSnap.notes?.length" class="probe bad">
          <div v-for="(n, i) in jvmSnap.notes" :key="i">{{ n }}</div>
        </div>
        <div v-if="jvmSnap.threadSummary" class="box">
          <div class="box-head">{{ t('Thread summary', '线程摘要') }}</div>
          <pre class="pre mono">{{ jvmSnap.threadSummary }}</pre>
        </div>
        <div v-if="jvmSnap.heapInfo" class="box">
          <div class="box-head">{{ t('Heap', '堆') }}</div>
          <pre class="pre mono">{{ jvmSnap.heapInfo }}</pre>
        </div>
        <div v-if="jvmSnap.gcUtil" class="box">
          <div class="box-head">{{ t('GC', 'GC') }}</div>
          <pre class="pre mono">{{ jvmSnap.gcUtil }}</pre>
        </div>
        <div v-if="jvmSnap.oomSnippet" class="box">
          <div class="box-head">{{ t('Host OOM', '宿主机 OOM') }}</div>
          <pre class="pre mono">{{ jvmSnap.oomSnippet }}</pre>
        </div>
        <div v-if="jvmSnap.threadDump" class="box">
          <div class="box-head">{{ t('Thread dump (truncated)', '线程栈（截断）') }}</div>
          <pre class="pre mono" style="max-height: 280px">{{ jvmSnap.threadDump }}</pre>
        </div>
        <div v-if="jvmSnap.javaCandidates?.length" class="box">
          <div class="box-head">{{ t('Other Java processes', '其他 Java 进程') }}</div>
          <div class="box-body">
            <button
              v-for="jp in jvmSnap.javaCandidates"
              :key="jp.pid"
              type="button"
              class="btn sm"
              style="margin: 2px"
              :disabled="jvmBusy"
              @click="runJvmSnapshot(jp.pid)"
            >
              {{ jp.pid }} · CPU {{ formatPercent(jp.cpu, 0) }} · MEM {{ formatPercent(jp.mem, 0) }}
            </button>
          </div>
        </div>
      </div>
      <div class="form-drawer-foot">
        <button type="button" class="btn" @click="copyJvmSnapshot">
          <PoIcon name="copy" :size="13" />
          {{ t('Copy all', '全部复制') }}
        </button>
        <span class="topbar-spacer" />
        <button type="button" class="btn" @click="showJvm = false">{{ t('Close', '关闭') }}</button>
      </div>
    </aside>

    <div v-if="showPrefs" class="modal-backdrop">
      <div class="modal" @click.stop>
        <div class="modal-head">
          <h3>{{ t('Alert thresholds', '告警阈值') }}</h3>
          <button type="button" class="icon-btn" @click="showPrefs = false">
            <PoIcon name="close" :size="15" />
          </button>
        </div>
        <p class="host-meta">{{ t('Used by fleet monitoring to mark hosts ALERT / degraded.', '多主机监控据此标记 ALERT / degraded。') }}</p>
        <label class="field"><span>{{ t('CPU warn %', 'CPU 告警 %') }}</span><input v-model.number="alertPrefs.cpuWarn" type="number" min="1" max="100" /></label>
        <label class="field"><span>{{ t('Memory warn %', '内存告警 %') }}</span><input v-model.number="alertPrefs.memWarn" type="number" min="1" max="100" /></label>
        <label class="field"><span>{{ t('Disk warn %', '磁盘告警 %') }}</span><input v-model.number="alertPrefs.diskWarn" type="number" min="1" max="100" /></label>
        <label class="gate">
          <input v-model="alertPrefs.desktopNotify" type="checkbox" @change="onDesktopNotifyToggle" />
          {{ t('Desktop notification on alert', '告警时桌面通知') }}
        </label>
        <div class="modal-actions">
          <button type="button" class="btn" @click="showPrefs = false">{{ t('Cancel', '取消') }}</button>
          <button type="button" class="btn primary" @click="savePrefs">{{ t('Save', '保存') }}</button>
        </div>
      </div>
    </div>

    <div v-if="killTarget" class="modal-backdrop" @click.self="killTarget = null">
      <div class="modal">
        <h3>{{ t('Confirm kill', '确认结束进程') }}</h3>
        <p class="mono">pid={{ killTarget.pid }} {{ killTarget.name }}</p>
        <label class="field">
          <span>Signal</span>
          <select v-model="killSignal">
            <option value="TERM">SIGTERM</option>
            <option value="KILL">SIGKILL</option>
            <option value="INT">SIGINT</option>
          </select>
        </label>
        <div class="modal-actions">
          <button type="button" class="btn" @click="killTarget = null">{{ t('Cancel', '取消') }}</button>
          <button type="button" class="btn danger" @click="confirmKill">Kill</button>
        </div>
      </div>
    </div>

    <div v-if="svcAction" class="modal-backdrop" @click.self="svcAction = null">
      <div class="modal">
        <h3>{{ t('Confirm systemctl', '确认 systemctl') }}</h3>
        <p class="mono">systemctl {{ svcAction.action }} {{ svcAction.unit }}</p>
        <div class="modal-actions">
          <button type="button" class="btn" @click="svcAction = null">{{ t('Cancel', '取消') }}</button>
          <button type="button" class="btn danger" @click="confirmServiceAction">{{ t('Confirm', '确认') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
