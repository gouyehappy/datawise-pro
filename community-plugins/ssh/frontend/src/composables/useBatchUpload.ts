import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from "vue";
import {
  addBatchUploadFiles,
  batchUploadTotalBytes,
  joinUploadPath,
  removeBatchUploadFile,
  resolveUploadDir,
  selectableUploadTargets,
  shouldAutoDismissBatchUpload,
  summarizeBatchUploadRows,
  type BatchUploadFile,
  type BatchUploadPolicy,
  type BatchUploadRow,
  type BatchUploadSummary,
} from "../lib/batchUpload";
import { batchTargetLabel, type BatchSendTarget } from "../lib/batchSend";
import { uiStorage } from "../lib/uiStorage";

/**
 * 批量上传（对标批量发送命令的多目标语义）：目标会话复用批量条的勾选列表，
 * 每个目标按自身 sessionId 走 sidecar 的 `sftp/upload/*` 分块通道。
 */

const UPLOAD_RESULT_AUTO_DISMISS_MS = 3500;
const UPLOAD_DIR_KEY = "ssh-batch-upload-dir";

function loadUploadDir(): string {
  try {
    return uiStorage.getItem(UPLOAD_DIR_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

function persistUploadDir(value: string) {
  try {
    uiStorage.setItem(UPLOAD_DIR_KEY, value);
  } catch {
    // 存储不可用只失去记忆，上传本身不受影响。
  }
}

export interface BatchUploadProgress {
  targetIndex: number;
  targetCount: number;
  fileIndex: number;
  fileCount: number;
  label: string;
  fileName: string;
}

export function useBatchUpload(options: {
  t: (key: string, values?: Record<string, string | number>) => string;
  showError: (cause: unknown, target?: "terminal" | "sftp") => void;
  uploadSource: (
    name: string,
    size: number,
    readChunk: (offset: number, length: number) => Promise<Uint8Array>,
    resume?: { taskId: string; remotePath: string },
    targetDir?: string,
    extra?: { duplicatePreCheckedAbsent?: boolean; sessionId?: string },
  ) => Promise<boolean>;
  batchTargets: Ref<BatchSendTarget[]>;
  batchSelected: Ref<string[]>;
  homeDir: ComputedRef<string>;
  fileInput: Ref<HTMLInputElement | undefined>;
}) {
  const { t, showError, uploadSource, batchTargets, batchSelected, homeDir, fileInput } = options;

  const batchMode = ref<"command" | "upload">("command");
  const uploadDir = ref(loadUploadDir());
  const uploadPolicy = ref<BatchUploadPolicy>("overwrite");
  const uploadFiles = ref<BatchUploadFile[]>([]);
  const uploading = ref(false);
  const uploadProgress = ref<BatchUploadProgress>();
  const uploadSummary = ref<BatchUploadSummary>();
  const uploadError = ref("");
  const uploadFilesOpen = ref(false);
  let uploadResultTimer: number | undefined;
  let fileSeq = 0;

  const uploadTotalBytes = computed(() => batchUploadTotalBytes(uploadFiles.value));
  const uploadTargetCount = computed(() => selectableUploadTargets(batchTargets.value, batchSelected.value).length);
  const uploadReady = computed(() => !uploading.value && uploadFiles.value.length > 0 && uploadTargetCount.value > 0);

  function clearUploadResultTimer() {
    if (uploadResultTimer !== undefined) {
      window.clearTimeout(uploadResultTimer);
      uploadResultTimer = undefined;
    }
  }

  function enterUploadMode() {
    batchMode.value = "upload";
    if (!uploadDir.value.trim()) uploadDir.value = homeDir.value || "/";
    uploadError.value = "";
  }

  function setBatchMode(mode: "command" | "upload") {
    if (mode === "upload") {
      enterUploadMode();
      return;
    }
    batchMode.value = "command";
    uploadFilesOpen.value = false;
  }

  function pickUploadFiles() {
    fileInput.value?.click();
  }

  function onUploadFilesInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const chosen = Array.from(input.files ?? []);
    input.value = "";
    if (!chosen.length) return;
    uploadFiles.value = addBatchUploadFiles(
      uploadFiles.value,
      chosen.map((file) => ({ id: `batch-upload-${++fileSeq}`, name: file.name, size: file.size, file })),
    );
    if (uploadFiles.value.length > 1) uploadFilesOpen.value = true;
  }

  function removeUploadFile(id: string) {
    uploadFiles.value = removeBatchUploadFile(uploadFiles.value, id);
    if (!uploadFiles.value.length) uploadFilesOpen.value = false;
  }

  function clearUploadFiles() {
    uploadFiles.value = [];
    uploadFilesOpen.value = false;
  }

  function dismissUploadResult() {
    clearUploadResultTimer();
    uploadSummary.value = undefined;
    uploadError.value = "";
  }

  async function remoteExists(sessionId: string, path: string): Promise<boolean> {
    try {
      const probe = await window.datawisePlugin.invoke<{ exists: boolean }>("sftp/exists", { sessionId, path });
      return probe.exists === true;
    } catch {
      return false;
    }
  }

  async function uniqueRemoteName(sessionId: string, dir: string, name: string): Promise<string> {
    try {
      const result = await window.datawisePlugin.invoke<{ name: string }>("sftp/rename-unique", { sessionId, dir, name });
      return result?.name || name;
    } catch {
      return name;
    }
  }

  function readChunkOf(entry: BatchUploadFile) {
    return async (offset: number, length: number) => new Uint8Array(await entry.file.slice(offset, offset + length).arrayBuffer());
  }

  async function runBatchUpload() {
    if (uploading.value) return;
    const targets = selectableUploadTargets(batchTargets.value, batchSelected.value);
    if (!targets.length) {
      uploadError.value = t("batchUploadNeedTargets");
      return;
    }
    if (!uploadFiles.value.length) {
      uploadError.value = t("batchUploadNeedFiles");
      return;
    }
    const dir = resolveUploadDir(uploadDir.value, homeDir.value);
    uploadDir.value = dir;
    const policy = uploadPolicy.value;
    const files = [...uploadFiles.value];
    uploading.value = true;
    uploadError.value = "";
    uploadSummary.value = undefined;
    clearUploadResultTimer();
    const rows: BatchUploadRow[] = [];
    try {
      for (const [targetIndex, target] of targets.entries()) {
        for (const [fileIndex, entry] of files.entries()) {
          uploadProgress.value = {
            targetIndex: targetIndex + 1,
            targetCount: targets.length,
            fileIndex: fileIndex + 1,
            fileCount: files.length,
            label: batchTargetLabel(target),
            fileName: entry.name,
          };
          let name = entry.name;
          try {
            if (policy !== "overwrite") {
              const probePath = joinUploadPath(dir, entry.name);
              const exists = await remoteExists(target.sessionId, probePath);
              if (exists && policy === "skip") {
                rows.push({ sessionId: target.sessionId, fileName: entry.name, status: "skipped", remotePath: probePath });
                continue;
              }
              if (exists && policy === "rename") name = await uniqueRemoteName(target.sessionId, dir, entry.name);
            }
            const remotePath = joinUploadPath(dir, name);
            const done = await uploadSource(name, entry.size, readChunkOf(entry), undefined, dir, {
              sessionId: target.sessionId,
              duplicatePreCheckedAbsent: true,
            });
            rows.push({
              sessionId: target.sessionId,
              fileName: entry.name,
              status: done ? "uploaded" : "failed",
              remotePath: done ? remotePath : undefined,
              error: done ? undefined : t("batchUploadFailed"),
            });
          } catch (cause) {
            rows.push({
              sessionId: target.sessionId,
              fileName: entry.name,
              status: "failed",
              error: cause instanceof Error ? cause.message : String(cause),
            });
          }
        }
      }
    } catch (cause) {
      showError(cause, "sftp");
    } finally {
      uploadProgress.value = undefined;
      uploading.value = false;
    }
    uploadSummary.value = summarizeBatchUploadRows(rows);
    if (shouldAutoDismissBatchUpload(uploadSummary.value)) {
      clearUploadResultTimer();
      uploadResultTimer = window.setTimeout(dismissUploadResult, UPLOAD_RESULT_AUTO_DISMISS_MS);
    }
  }

  watch(uploadDir, (value) => {
    if (value.trim()) persistUploadDir(value.trim());
  });
  watch(batchMode, (mode) => {
    if (mode === "command") uploadFilesOpen.value = false;
  });
  onBeforeUnmount(clearUploadResultTimer);

  return {
    batchMode,
    uploadDir,
    uploadPolicy,
    uploadFiles,
    uploading,
    uploadProgress,
    uploadSummary,
    uploadError,
    uploadFilesOpen,
    uploadTotalBytes,
    uploadTargetCount,
    uploadReady,
    setBatchMode,
    enterUploadMode,
    pickUploadFiles,
    onUploadFilesInput,
    removeUploadFile,
    clearUploadFiles,
    runBatchUpload,
    dismissUploadResult,
  };
}
