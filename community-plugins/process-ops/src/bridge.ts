export interface PluginContext {
  connectionId?: string;
  connection?: { id: string; name: string };
  [key: string]: unknown;
}

export interface PluginTheme {
  appearance?: 'light' | 'dark';
  tokens?: Record<string, string>;
}

interface DatawisePlugin {
  ready: Promise<unknown>;
  context: PluginContext;
  locale?: string;
  theme?: PluginTheme;
  invoke<T>(method: string, params?: Record<string, unknown>, options?: { timeoutMs?: number }): Promise<T>;
  onContext?(fn: (context: PluginContext) => void): () => void;
  onContextChange?(fn: (context: PluginContext) => void): () => void;
  getHostInfo?(): Promise<{ locale?: string; theme?: PluginTheme } | null>;
  onHostInfo?(fn: (info: { locale?: string; theme?: PluginTheme }) => void): () => void;
  clipboard?: { readText(): Promise<string>; writeText(text: string): Promise<void> };
  storage?: {
    get(key: string): Promise<string | null | undefined>;
    set(key: string, value: string): Promise<void>;
    remove?(key: string): Promise<void>;
  };
}

declare global {
  interface Window {
    datawisePlugin?: DatawisePlugin;
  }
}

export function getPlugin(): DatawisePlugin {
  if (!window.datawisePlugin) {
    throw new Error('This page must run inside the DataWise plugin sandbox');
  }
  return window.datawisePlugin;
}

export async function invoke<T>(connectionId: string, method: string, params: Record<string, unknown> = {}): Promise<T> {
  return getPlugin().invoke<T>(method, { ...params, connectionId }, { timeoutMs: 120000 });
}

export async function storageGet(key: string): Promise<string> {
  try {
    const p = getPlugin();
    if (!p.storage) return '';
    return (await p.storage.get(key)) || '';
  } catch {
    return '';
  }
}

export async function storageSet(key: string, value: string): Promise<void> {
  try {
    const p = getPlugin();
    if (p.storage) await p.storage.set(key, value);
  } catch {
    /* ignore */
  }
}

export async function clipboardWrite(text: string): Promise<void> {
  const p = getPlugin();
  if (p.clipboard?.writeText) {
    await p.clipboard.writeText(text);
    return;
  }
  await navigator.clipboard.writeText(text);
}

/** Align plugin chrome with host light/dark (rail + stage must share the same scheme). */
export function applyTheme(appearance?: string): void {
  const theme = appearance === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-dw-theme', theme);
}
