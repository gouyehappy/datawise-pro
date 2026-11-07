// 宿主工作台 UI 存储包装（hostApi 1.2）。
//
// 工作台 iframe 以 sandbox="allow-scripts" 运行（opaque origin），
// 「访问 window.localStorage 属性」本身就抛 SecurityError，偏好/历史
// 一律经 datawisePlugin.storage 落到宿主插件数据目录。
//
// 语义：
// - main.ts 在挂载前 await initUiStorage()，预取全部键值进内存缓存；
//   此后 getItem/setItem/removeItem 与 localStorage 同步语义一致。
// - 写入先更新缓存再异步落宿主（fire-and-forget，失败仅失去持久化）。
// - 无桥（独立 dev / 老宿主）时回退到 try 包裹的 localStorage。

type BridgeStorage = {
  getAll?: () => Promise<Record<string, unknown>>;
  get?: (key: string) => Promise<string | null>;
  set?: (key: string, value: string) => Promise<void>;
  remove?: (key: string) => Promise<void>;
};

let bridgeStorage: BridgeStorage | null = null;
let cache: Record<string, string> | null = null;

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string | null): void {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // localStorage 不可用：仅失去持久化。
  }
}

function localSnapshot(): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key == null) continue;
      const value = window.localStorage.getItem(key);
      if (value != null) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** 预取宿主存储进缓存；无桥/失败时缓存为本地快照（可能为空表）。 */
export async function initUiStorage(): Promise<void> {
  const plugin = (window as unknown as { datawisePlugin?: { storage?: BridgeStorage } })
    .datawisePlugin;
  const storage = plugin?.storage;
  if (storage && typeof storage.getAll === "function") {
    try {
      const values = await storage.getAll();
      if (values && typeof values === "object") {
        const plain: Record<string, string> = {};
        for (const [key, value] of Object.entries(values)) {
          if (typeof value === "string") plain[key] = value;
        }
        cache = plain;
        bridgeStorage = storage;
        return;
      }
    } catch {
      // 桥不可用：回退本地。
    }
  }
  cache = localSnapshot();
}

/** localStorage 同步语义的宿主存储视图；initUiStorage 之后读写才命中宿主缓存。 */
export const uiStorage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = {
  getItem(key: string): string | null {
    if (cache) return Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : null;
    return readLocal(key);
  },
  setItem(key: string, value: string): void {
    if (cache) cache[key] = value;
    if (bridgeStorage?.set) {
      void bridgeStorage.set(key, value).catch(() => {});
    } else {
      writeLocal(key, value);
    }
  },
  removeItem(key: string): void {
    if (cache) delete cache[key];
    if (bridgeStorage?.remove) {
      void bridgeStorage.remove(key).catch(() => {});
    } else {
      writeLocal(key, null);
    }
  },
};
