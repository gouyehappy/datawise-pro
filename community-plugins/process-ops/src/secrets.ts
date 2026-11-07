import { storageGet, storageSet } from './bridge';

const SECRETS_KEY = 'process-ops.secrets.v1';
const PREFS_KEY = 'process-ops.prefs.v1';

export interface StoredSecret {
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export interface AlertPrefs {
  cpuWarn: number;
  memWarn: number;
  diskWarn: number;
  /** Raise browser Notification when a threshold is crossed */
  desktopNotify: boolean;
}

export const defaultAlertPrefs: AlertPrefs = {
  cpuWarn: 85,
  memWarn: 90,
  diskWarn: 90,
  desktopNotify: false,
};

export interface AlertEvent {
  ts: number;
  targetId: string;
  hostName: string;
  kind: 'cpu' | 'mem' | 'disk';
  value: number;
  threshold: number;
}

const ALERTS_KEY = 'process-ops.alerts.v1';

export async function loadAlertHistory(): Promise<AlertEvent[]> {
  const raw = await storageGet(ALERTS_KEY);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as AlertEvent[];
    return Array.isArray(list) ? list.slice(0, 100) : [];
  } catch {
    return [];
  }
}

export async function saveAlertHistory(events: AlertEvent[]): Promise<void> {
  await storageSet(ALERTS_KEY, JSON.stringify(events.slice(0, 100)));
}

export async function loadSecretsVault(): Promise<Record<string, StoredSecret>> {
  const raw = await storageGet(SECRETS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, StoredSecret>;
  } catch {
    return {};
  }
}

export async function saveSecretsVault(vault: Record<string, StoredSecret>): Promise<void> {
  await storageSet(SECRETS_KEY, JSON.stringify(vault));
}

export async function upsertSecret(id: string, secret: StoredSecret): Promise<void> {
  const vault = await loadSecretsVault();
  vault[id] = {
    password: secret.password || undefined,
    privateKey: secret.privateKey || undefined,
    passphrase: secret.passphrase || undefined,
  };
  if (!vault[id].password && !vault[id].privateKey) {
    delete vault[id];
  }
  await saveSecretsVault(vault);
}

export async function removeSecret(id: string): Promise<void> {
  const vault = await loadSecretsVault();
  if (vault[id]) {
    delete vault[id];
    await saveSecretsVault(vault);
  }
}

export async function loadAlertPrefs(): Promise<AlertPrefs> {
  const raw = await storageGet(PREFS_KEY);
  if (!raw) return { ...defaultAlertPrefs };
  try {
    return { ...defaultAlertPrefs, ...(JSON.parse(raw) as Partial<AlertPrefs>) };
  } catch {
    return { ...defaultAlertPrefs };
  }
}

export async function saveAlertPrefs(prefs: AlertPrefs): Promise<void> {
  await storageSet(PREFS_KEY, JSON.stringify(prefs));
}
