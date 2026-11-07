import { computed, ref, type Ref } from "vue";
import { enqueueWatchModified, popWatchModified, registerWatch, watchName, type ModifiedPrompt, type WatchRegistry } from "../lib/watchEdits";
import { loadEditorConfig, resolveEditorForFile, sanitizeEditorConfig, saveEditorConfig, type EditorConfig, type KnownEditor, type ResolvedEditor } from "../lib/editorRules";
import type { SftpEntryKind } from "../lib/sftpEntries";

/** 外部编辑条目（App.vue 局部接口按消费字段收敛）。 */
interface ExternalEditEntry {
  uri: string;
  name: string;
  kind: SftpEntryKind;
}

/** 外部编辑写入传输面板所需的最小字段（App.vue TransferTask 的可写子集）。 */
type ExternalEditTransferSlot = {
  taskId: string;
  sessionId?: string;
  direction: "upload" | "download";
  fileName: string;
  size: number;
  transferred: number;
  status: string;
  joinedAt?: number;
  compression?: string;
  localPath?: string;
};

interface ExternalEditDownloadInfo {
  taskId: string;
  fileName: string;
  size: number;
  compression?: string;
}

/**
 * 外部编辑器回传：watch/file-modified 确认状态机 + watch/upload 串行链 +
 * 「打开方式」下载/打开入口。下载走 saveToLocal 直落 remote-edit 目录。
 */
export function useExternalEdits(options: {
  t: (key: string, values?: Record<string, string | number>) => string;
  showNotice: (message: string) => void;
  showError: (cause: unknown, target?: "terminal" | "sftp") => void;
  loadDirectory: (path?: string) => Promise<void>;
  session: Ref<{ sessionId: string } | undefined>;
  openTransferPanel: () => void;
  /** 与 App 共用 reactive 表；写入时只填外部编辑关心的字段。 */
  transferTasks: Record<string, ExternalEditTransferSlot>;
  pathFromUri: (uri: string) => string;
  waitWhilePaused: (taskId: string) => Promise<void> | undefined;
  waitForDownloadChunk: (taskId: string, offset: number) => Promise<unknown>;
  cancelledTransferTasks: Set<string>;
  downloadChunkWaiters: Map<string, { timer: number }>;
  probeLocalCapabilities: () => Promise<{ canSaveLocal: boolean; downloadsDir: string } | null | undefined>;
  loadDownloadDir: () => string;
  copyTextToClipboard: (value: string, noticeKey: string, values?: Record<string, string | number>) => void;
  closeFileMenu: () => void;
}) {
  const {
    t,
    showNotice,
    showError,
    loadDirectory,
    session,
    openTransferPanel,
    transferTasks,
    pathFromUri,
    waitWhilePaused,
    waitForDownloadChunk,
    cancelledTransferTasks,
    downloadChunkWaiters,
    probeLocalCapabilities,
    loadDownloadDir,
    copyTextToClipboard,
    closeFileMenu,
  } = options;

  const externalEditBusy = ref(false);
  const activeExternalWatches = ref<WatchRegistry>({});
  const watchModifiedQueue = ref<ModifiedPrompt[]>([]);
  const watchModifiedPrompt = computed<ModifiedPrompt | null>(() => watchModifiedQueue.value[0] ?? null);
  const alwaysUploadWatches = new Set<string>();
  let watchUploadChain: Promise<void> = Promise.resolve();

  const editorConfig = ref<EditorConfig>(loadEditorConfig());
  const externalEditors = ref<KnownEditor[]>([]);
  let externalEditorsLoaded = false;

  function updateEditorConfig(next: EditorConfig) {
    editorConfig.value = sanitizeEditorConfig(next);
    saveEditorConfig(editorConfig.value);
  }

  async function ensureExternalEditors(): Promise<KnownEditor[]> {
    if (externalEditorsLoaded) return externalEditors.value;
    try {
      const payload = await window.datawisePlugin.invoke<{ editors: KnownEditor[] }>("local/editors/list");
      externalEditors.value = payload.editors ?? [];
      externalEditorsLoaded = true;
    } catch (cause) {
      showError(cause, "sftp");
    }
    return externalEditors.value;
  }

  function handleWatchModified(watchId: string) {
    if (!activeExternalWatches.value[watchId]) return;
    if (alwaysUploadWatches.has(watchId) || editorConfig.value.uploadPolicy === "auto") {
      void uploadWatchedFile(watchId);
      return;
    }
    watchModifiedQueue.value = enqueueWatchModified(watchModifiedQueue.value, activeExternalWatches.value, watchId);
  }

  function resolveWatchHead(watchId: string) {
    const next = popWatchModified(watchModifiedQueue.value, watchId);
    if (next) watchModifiedQueue.value = next;
  }

  function uploadWatchedFile(watchId: string) {
    watchUploadChain = watchUploadChain.then(() => invokeWatchUpload(watchId));
  }

  async function invokeWatchUpload(watchId: string) {
    externalEditBusy.value = true;
    try {
      await window.datawisePlugin.invoke<{ remotePath: string; size: number }>("watch/upload", { watchId });
      showNotice(t("sftpEdit.uploaded", { name: watchName(activeExternalWatches.value, watchId) }));
      await loadDirectory();
    } catch (cause) {
      showError(cause, "sftp");
    } finally {
      externalEditBusy.value = false;
    }
  }

  function dismissWatchModified() {
    const prompt = watchModifiedPrompt.value;
    if (prompt) resolveWatchHead(prompt.watchId);
  }

  function uploadWatchedFileOnce() {
    const prompt = watchModifiedPrompt.value;
    if (!prompt) return;
    resolveWatchHead(prompt.watchId);
    void uploadWatchedFile(prompt.watchId);
  }

  function uploadWatchedFileAlways() {
    const prompt = watchModifiedPrompt.value;
    if (!prompt) return;
    alwaysUploadWatches.add(prompt.watchId);
    resolveWatchHead(prompt.watchId);
    void uploadWatchedFile(prompt.watchId);
  }

  function joinLocalPath(dir: string, suffix: string): string {
    return `${dir.replace(/[\\/]+$/, "")}/${suffix.replace(/^\/+/, "")}`;
  }

  async function downloadForExternalEdit(entry: ExternalEditEntry, downloadDir: string): Promise<string | undefined> {
    if (!session.value || entry.kind !== "file") return undefined;
    openTransferPanel();
    const info = await window.datawisePlugin.invoke<ExternalEditDownloadInfo>("sftp/download/start", {
      sessionId: session.value.sessionId,
      remotePath: pathFromUri(entry.uri),
      saveToLocal: true,
      downloadDir,
      conflict: "overwrite",
    });
    transferTasks[info.taskId] = {
      taskId: info.taskId,
      sessionId: session.value.sessionId,
      direction: "download",
      fileName: info.fileName,
      size: info.size,
      transferred: 0,
      status: "queued",
      joinedAt: Date.now(),
      compression: info.compression === "gzip" ? "gzip" : undefined,
    };
    try {
      let offset = 0;
      while (offset < info.size) {
        await waitWhilePaused(info.taskId);
        const chunkPromise = waitForDownloadChunk(info.taskId, offset);
        const nextPromise = window.datawisePlugin.invoke<{ length: number; eof: boolean }>("sftp/download/next", {
          taskId: info.taskId,
          offset,
        });
        nextPromise.catch(() => undefined);
        const result = await nextPromise;
        await chunkPromise;
        offset += result.length;
        const task = transferTasks[info.taskId];
        if (task) {
          task.status = "running";
          task.transferred = offset;
        }
        if (result.eof) break;
      }
      const finish = await window.datawisePlugin.invoke<{ localPath?: string }>("sftp/download/finish", { taskId: info.taskId });
      cancelledTransferTasks.delete(info.taskId);
      const task = transferTasks[info.taskId];
      if (task) {
        task.status = "completed";
        task.transferred = info.size;
        if (finish?.localPath) task.localPath = finish.localPath;
      }
      return finish?.localPath;
    } catch (cause) {
      const waiter = downloadChunkWaiters.get(info.taskId);
      if (waiter) {
        window.clearTimeout(waiter.timer);
        downloadChunkWaiters.delete(info.taskId);
      }
      await window.datawisePlugin.invoke("sftp/transfer/cancel", { taskId: info.taskId }).catch(() => undefined);
      throw cause;
    }
  }

  async function invokeOpenFor(localPath: string, resolved: ResolvedEditor): Promise<void> {
    if (resolved.kind === "system") {
      await window.datawisePlugin.invoke("local/open", { path: localPath });
      return;
    }
    if (resolved.kind === "known") {
      await window.datawisePlugin.invoke("local/open-with", { path: localPath, editorId: resolved.editor.id });
      return;
    }
    await window.datawisePlugin.invoke("local/open-with", {
      path: localPath,
      custom: { name: resolved.editor.name, command: resolved.editor.command },
    });
  }

  async function openInExternalEditor(entry: ExternalEditEntry, override?: ResolvedEditor) {
    closeFileMenu();
    if (!session.value) return;
    const local = await probeLocalCapabilities();
    if (!local?.canSaveLocal) {
      showNotice(t("sftpEdit.desktopOnly"));
      return;
    }
    try {
      const editors = await ensureExternalEditors();
      const resolved = override ?? resolveEditorForFile(entry.name, editorConfig.value, editors);
      const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      const dir = joinLocalPath(loadDownloadDir() || local.downloadsDir, `remote-edit/${stamp}`);
      const localPath = await downloadForExternalEdit(entry, dir);
      if (!localPath || !session.value) return;
      const remotePath = pathFromUri(entry.uri);
      const watch = await window.datawisePlugin.invoke<{ watchId: string }>("watch/start", {
        sessionId: session.value.sessionId,
        remotePath,
        localPath,
      });
      alwaysUploadWatches.delete(watch.watchId);
      activeExternalWatches.value = registerWatch(activeExternalWatches.value, {
        watchId: watch.watchId,
        name: entry.name,
        remotePath,
      });
      try {
        await invokeOpenFor(localPath, resolved);
      } catch {
        await window.datawisePlugin.invoke("local/reveal", { path: localPath });
      }
      copyTextToClipboard(localPath, "sftpEdit.pathCopied");
      showNotice(
        t(
          editorConfig.value.uploadPolicy === "auto" ? "sftpEdit.watchingAuto" : "sftpEdit.watching",
          { name: entry.name },
        ),
      );
    } catch (cause) {
      showError(cause, "sftp");
    }
  }

  return {
    externalEditBusy,
    activeExternalWatches,
    watchModifiedQueue,
    watchModifiedPrompt,
    alwaysUploadWatches,
    handleWatchModified,
    dismissWatchModified,
    uploadWatchedFileOnce,
    uploadWatchedFileAlways,
    joinLocalPath,
    openInExternalEditor,
    editorConfig,
    updateEditorConfig,
    externalEditors,
    ensureExternalEditors,
  };
}
