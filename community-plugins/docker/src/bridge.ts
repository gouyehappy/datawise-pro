// DataWise host bridge: window.datawisePlugin is injected by the workbench sandbox.
export interface PluginContext {
  connectionId?: string;
  providerId?: string;
  connectionType?: string;
  workbenchId?: string;
  connection?: { id: string; name: string; host: string; port: number; username: string; readOnly: boolean };
  [key: string]: unknown;
}

export interface PluginTheme {
  appearance?: 'light' | 'dark';
  tokens?: Record<string, string>;
}

/** datawise-plugin-env / HostInfo payload fields used by this workbench. */
export interface PluginEnvPayload {
  locale?: string;
  theme?: PluginTheme;
}

interface DatawisePlugin {
  ready: Promise<unknown>;
  context: PluginContext;
  locale?: string;
  theme?: PluginTheme;
  invoke<T>(method: string, params?: Record<string, unknown>, options?: { timeoutMs?: number }): Promise<T>;
  onContext?(fn: (context: PluginContext) => void): () => void;
  onContextChange?(fn: (context: PluginContext) => void): () => void;
  onBinary(fn: (payload: { channel: string; data?: Uint8Array; dataBase64?: string }) => void): () => void;
  sendBinary(channel: string, data: string | Uint8Array | ArrayBuffer): Promise<unknown>;
  encodeBase64?(value: Uint8Array | ArrayBuffer): string;
  decodeBase64?(value: string): Uint8Array;
  clipboard?: { readText(): Promise<string>; writeText(text: string): Promise<void> };
  fileTransfer?: {
    beginSave(options: { name: string; contentType?: string; size?: number }): Promise<{ handleId: string; chunkBytes: number }>;
    write(handleId: string, offset: number, data: Uint8Array | ArrayBuffer | string): Promise<{ written: number; nextOffset: number }>;
    finish(handleId: string): Promise<void>;
    cancel(handleId: string): Promise<void>;
  };
  /**
   * Optional desktop helper (Host API extensions / k8s desktop shim).
   * Prefer fileTransfer / local/saveFile when absent.
   */
  saveFile?(
    options?: { fileName?: string; contentType?: string },
    data?: Uint8Array | ArrayBuffer | string,
  ): Promise<{ path?: string } | null>;
}

declare global {
  interface Window {
    datawisePlugin?: DatawisePlugin;
  }
}

export function getPlugin(): DatawisePlugin {
  if (!window.datawisePlugin) {
    throw new Error('此页面需要在 DataWise 插件沙箱中运行 / This page must run inside the DataWise plugin sandbox');
  }
  return window.datawisePlugin;
}

export async function invoke<T>(connectionId: string, method: string, params: Record<string, unknown> = {}): Promise<T> {
  return getPlugin().invoke<T>(method, { ...params, connectionId }, { timeoutMs: 120000 });
}

export function onBinary(fn: (payload: { channel: string; data: Uint8Array }) => void): () => void {
  const plugin = getPlugin();
  return plugin.onBinary((event) => {
    let data = event.data;
    if (!(data instanceof Uint8Array)) {
      const b64 = event.dataBase64;
      if (typeof b64 === 'string' && plugin.decodeBase64) {
        data = plugin.decodeBase64(b64);
      } else if (typeof b64 === 'string') {
        const raw = atob(b64);
        data = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
      } else {
        data = new Uint8Array();
      }
    }
    fn({ channel: event.channel, data });
  });
}

export function currentLocale(): string {
  return getPlugin().locale || 'en';
}

/** Save bytes via host helpers; returns absolute path (desktop) or file name (web), or null if cancelled. */
export async function saveBytes(
  fileName: string,
  contentType: string,
  bytes: Uint8Array,
): Promise<{ path: string } | null> {
  const plugin = getPlugin();
  if (plugin.saveFile) {
    const result = await plugin.saveFile({ fileName, contentType }, bytes);
    if (result == null) return null;
    return { path: typeof result.path === 'string' && result.path ? result.path : fileName };
  }
  const ft = plugin.fileTransfer;
  if (ft?.beginSave && ft.write && ft.finish) {
    const target = await ft.beginSave({ name: fileName, contentType, size: bytes.length });
    let offset = 0;
    const chunk = Math.max(64 * 1024, target.chunkBytes || 256 * 1024);
    while (offset < bytes.length) {
      const end = Math.min(offset + chunk, bytes.length);
      const written = await ft.write(target.handleId, offset, bytes.subarray(offset, end));
      offset = written.nextOffset ?? end;
    }
    await ft.finish(target.handleId);
    return { path: fileName };
  }
  const dataBase64 = plugin.encodeBase64
    ? plugin.encodeBase64(bytes)
    : btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
  const saved = await plugin.invoke<{ localPath?: string; name?: string; path?: string } | null>('local/saveFile', {
    fileName,
    contentType,
    dataBase64,
  });
  if (saved == null) return null;
  const path = saved.localPath || saved.path || saved.name || fileName;
  return { path };
}

export async function copyText(text: string): Promise<void> {
  const plugin = getPlugin();
  if (plugin.clipboard?.writeText) {
    await plugin.clipboard.writeText(text);
    return;
  }
  await navigator.clipboard.writeText(text);
}
