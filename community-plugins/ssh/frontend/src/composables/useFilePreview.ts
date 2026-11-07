import { computed, ref, type Ref } from "vue";
import { formatBytes } from "../lib/format";
import { resolvePreview } from "../lib/previewResolver";
import { MIB } from "../lib/settingsModel";
import { looksBinary } from "../lib/textSniff";

// 列表条目的最小结构（App.vue 的 SftpEntry 为局部接口，按消费字段收敛）。
type PreviewEntry = { uri: string; name: string; kind: string; size?: number };

/** 文件预览（文本/图片 + 多格式）：打开前确认（大文件/二进制嗅探/sudo 读取）、
 * 编辑草稿与脏检查、保存（sudo/write 分流）；图片/Office/PDF/媒体/表格/Markdown
 * 走 PreviewPane（分块流式 + 内嵌 viewer）。 */
export function useFilePreview(options: {
  t: (key: string, values?: Record<string, string | number>) => string;
  showNotice: (message: string) => void;
  showError: (cause: unknown, target?: "terminal" | "sftp") => void;
  session: Ref<{ sessionId?: string } | undefined>;
  sudoMode: Ref<boolean>;
  canWrite: Ref<boolean>;
  loadDirectory: (path?: string) => Promise<void>;
  downloadEntry: (entry: PreviewEntry) => Promise<void>;
  pathFromUri: (uri: string) => string;
}) {
  const { t, showNotice, showError, session, sudoMode, canWrite, loadDirectory, downloadEntry, pathFromUri } = options;

  const IMAGE_MIME_BY_EXTENSION: Record<string, string> = { png: "png", jpg: "jpeg", jpeg: "jpeg", gif: "gif", webp: "webp", svg: "svg+xml", bmp: "bmp", ico: "x-icon" };
  // 已知归档/可执行等扩展名：无 PreviewPane 多格式车道时直接提示不打开。
  // pdf/office/media/解码类图片走 resolvePreview → PreviewPane（含诚实 unavailable）。
  const BINARY_PREVIEW_EXTENSIONS = new Set(["7z", "bin", "bz2", "class", "dll", "dmg", "dylib", "exe", "gz", "iso", "jar", "lz4", "o", "obj", "otf", "pyc", "rar", "so", "tar", "ttf", "war", "woff", "woff2", "xz", "zip", "zst"]);
  // 打开预览前先读该字节数做二进制嗅探（looksBinary），避免向编辑器灌入乱码。
  const SNIFF_CHUNK_BYTES = 8 * 1024;
  const MAX_INLINE_PREVIEW_BYTES = 1024 * 1024;
  const MAX_DIRECT_WRITE_BYTES = 4 * 1024 * 1024;
  const MAX_IMAGE_PREVIEW_BYTES = 20 * MIB;

  const previewOpen = ref(false);
  const previewTitle = ref("");
  const previewText = ref("");
  const previewLoading = ref(false);
  const previewPath = ref("");
  const previewSize = ref(0);
  const previewEditable = ref(false);
  const previewDraft = ref("");
  const previewSaving = ref(false);
  const previewMode = ref<"text" | "image">("text");
  const previewImageUrl = ref("");
  const previewImageZoomed = ref(false);
  // 多格式预览：图片/Office/PDF/媒体/表格/Markdown 等走 PreviewPane
  // （分块流式 + 内嵌 viewer）；可编辑文本仍走既有内联链路。
  const multiPreviewOpen = ref(false);
  const multiPreviewPath = ref<string | null>(null);
  // Baseline snapshot of the content when it was opened (or last saved); the
  // dirty marker compares the live draft against it.
  const previewBaseline = ref("");
  // 仅加载了文件头部（大文件确认预览）时置位：预览只读，禁止保存以免整文件覆盖。
  const previewTruncated = ref(false);

  const previewDirty = computed(() => previewEditable.value && previewDraft.value !== previewBaseline.value);
  // 编辑保存走 sftp/write 整文件覆写：只有完整加载（未截断）且不超直写上限的
  // 文本才允许进入编辑，否则保存会把未加载部分丢掉。
  const previewEditableAllowed = computed(() => canWrite.value && previewMode.value === "text" && !previewTruncated.value && previewSize.value <= MAX_DIRECT_WRITE_BYTES);

  async function openEntry(entry: PreviewEntry) {
    if (previewOpen.value && previewDirty.value && !window.confirm(t("editSave.closeConfirm"))) return;

    if (entry.kind === "directory") {
      await loadDirectory(pathFromUri(entry.uri));
      return;
    }
    if (entry.kind !== "file") return;
    // 多格式车道：图片/Office/PDF/媒体/表格/诚实 unavailable + Markdown 渲染面。
    const resolution = resolvePreview(entry.name);
    if (multiPreviewStrategy(resolution)) {
      await openMultiFormatPreview(entry);
      return;
    }
    if (isImagePreviewable(entry)) {
      await openImagePreview(entry, IMAGE_MIME_BY_EXTENSION[imagePreviewExtension(entry.name)]);
      return;
    }
    const size = entry.size || 0;
    // 已知归档等：走 PreviewPane 的 capped hex（未知扩展同路径），勿静默假装预览。
    if (size > 0 && hasBinaryExtension(entry.name)) {
      await openMultiFormatPreview(entry);
      return;
    }
    // 大文件先询问：确认后仍预览，但只加载头部且只读。
    if (size > MAX_INLINE_PREVIEW_BYTES && !window.confirm(t("previewDialog.tooLargeConfirm", { name: entry.name, size: formatBytes(size), limit: formatBytes(MAX_INLINE_PREVIEW_BYTES) }))) return;

    // 内容嗅探兜底：无后缀/改名的二进制走 PreviewPane capped hex；已知文本扩展仍提示不打开。
    if (size > 0 && (await remoteFileLooksBinary(entry))) {
      if (resolution.kind === "unknown" || resolution.previewStrategy === "hex") {
        await openMultiFormatPreview(entry);
      } else {
        showNotice(t("binaryFile.notOpen", { name: entry.name }));
      }
      return;
    }
    previewMode.value = "text";
    previewImageUrl.value = "";
    previewImageZoomed.value = false;
    previewTruncated.value = false;
    previewOpen.value = true;
    previewLoading.value = true;
    previewTitle.value = entry.name;
    previewText.value = "";
    previewPath.value = pathFromUri(entry.uri);
    previewSize.value = entry.size || 0;
    previewEditable.value = false;
    previewDraft.value = "";
    previewBaseline.value = "";
    try {
      // sudo 模式下文本文件改走 sudo/readFile，避免无权限文件预览失败。
      const result = sudoMode.value
        ? await window.datawisePlugin.invoke<{ dataBase64: string; truncated: boolean }>("sudo/readFile", {
            sessionId: session.value?.sessionId,
            path: pathFromUri(entry.uri),
            offset: 0,
            length: MAX_INLINE_PREVIEW_BYTES,
          })
        : await window.datawisePlugin.invoke<{ dataBase64: string; truncated: boolean }>("sftp/read", {
            sessionId: session.value?.sessionId,
            path: pathFromUri(entry.uri),
            maxBytes: MAX_INLINE_PREVIEW_BYTES,
          });
      // 截断 = 只展示了文件头部：保持只读（保存会整文件覆写，丢掉未加载部分）。
      previewTruncated.value = result.truncated;
      previewText.value = new TextDecoder("utf-8", { fatal: false }).decode(window.datawisePlugin.decodeBase64(result.dataBase64));
      previewBaseline.value = previewText.value;
    } catch (cause) {
      previewText.value = cause instanceof Error ? cause.message : String(cause);
      previewBaseline.value = previewText.value;
    } finally {
      previewLoading.value = false;
    }
  }

  /** 多格式车道：image/file-viewer/media/unavailable/hex；Markdown 走 PreviewPane。 */
  function multiPreviewStrategy(resolution: ReturnType<typeof resolvePreview>): boolean {
    const strategy = resolution.previewStrategy;
    if (
      strategy === "image"
      || strategy === "file-viewer"
      || strategy === "media"
      || strategy === "unavailable"
      || strategy === "hex"
    ) {
      return true;
    }
    if (resolution.mime === "text/markdown") return true;
    return false;
  }

  /** 打开多格式预览弹窗（路径驱动，读取/分块/sudo 全部收口在 PreviewPane）。 */
  async function openMultiFormatPreview(entry: PreviewEntry) {
    if (multiPreviewOpen.value && multiPreviewPath.value) {
      multiPreviewPath.value = pathFromUri(entry.uri);
      return;
    }
    multiPreviewPath.value = pathFromUri(entry.uri);
    multiPreviewOpen.value = true;
  }

  function closeMultiFormatPreview() {
    multiPreviewOpen.value = false;
  }

  // 预览前的二进制嗅探：读头部 SNIFF_CHUNK_BYTES 字节交给 looksBinary 判定。
  // 嗅探失败不拦预览，交给正式读取报错。
  async function remoteFileLooksBinary(entry: PreviewEntry) {
    const sessionId = session.value?.sessionId;
    if (!sessionId) return false;
    try {
      const result = sudoMode.value
        ? await window.datawisePlugin.invoke<{ dataBase64: string }>("sudo/readFile", {
            sessionId,
            path: pathFromUri(entry.uri),
            offset: 0,
            length: SNIFF_CHUNK_BYTES,
          })
        : await window.datawisePlugin.invoke<{ dataBase64: string }>("sftp/read", {
            sessionId,
            path: pathFromUri(entry.uri),
            maxBytes: SNIFF_CHUNK_BYTES,
          });
      return looksBinary(window.datawisePlugin.decodeBase64(result.dataBase64));
    } catch {
      return false;
    }
  }

  async function openImagePreview(entry: PreviewEntry, mime: string) {
    previewMode.value = "image";
    previewTruncated.value = false;
    previewImageUrl.value = "";
    previewImageZoomed.value = false;
    previewOpen.value = true;
    previewLoading.value = true;
    previewTitle.value = entry.name;
    previewText.value = "";
    previewPath.value = pathFromUri(entry.uri);
    previewSize.value = entry.size || 0;
    previewEditable.value = false;
    previewDraft.value = "";
    previewBaseline.value = "";
    try {
      const result = await window.datawisePlugin.invoke<{ dataBase64: string; truncated: boolean }>("sftp/read", {
        sessionId: session.value?.sessionId,
        path: pathFromUri(entry.uri),
        maxBytes: MAX_IMAGE_PREVIEW_BYTES,
      });
      if (result.truncated) {
        previewOpen.value = false;
        await downloadEntry(entry);
        return;
      }
      previewImageUrl.value = `data:image/${mime};base64,${result.dataBase64}`;
    } catch (cause) {
      previewOpen.value = false;
      showError(cause);
    } finally {
      previewLoading.value = false;
    }
  }

  function fileExtension(name: string) {
    return name.includes(".") ? name.split(".").pop()?.toLowerCase() || "" : "";
  }

  function imagePreviewExtension(name: string) {
    const extension = fileExtension(name);
    return extension in IMAGE_MIME_BY_EXTENSION ? extension : "";
  }

  function isImagePreviewable(entry: PreviewEntry) {
    const size = entry.size || 0;
    return !!imagePreviewExtension(entry.name) && size > 0 && size <= MAX_IMAGE_PREVIEW_BYTES;
  }

  function hasBinaryExtension(name: string) {
    return BINARY_PREVIEW_EXTENSIONS.has(fileExtension(name));
  }

  function confirmDiscardPreviewEdits() {
    return !previewDirty.value || window.confirm(t("editSave.closeConfirm"));
  }

  function closePreview() {
    if (!confirmDiscardPreviewEdits()) return;
    previewOpen.value = false;
    previewEditable.value = false;
    previewDraft.value = "";
    previewImageUrl.value = "";
    previewImageZoomed.value = false;
  }

  function beginPreviewEdit() {
    if (!previewEditableAllowed.value) return;
    previewDraft.value = previewText.value;
    previewEditable.value = true;
  }

  function cancelPreviewEdit() {
    if (!confirmDiscardPreviewEdits()) return;
    previewEditable.value = false;
    previewDraft.value = "";
  }

  async function savePreview() {
    const sessionId = session.value?.sessionId;
    if (!sessionId || previewSaving.value || !previewPath.value) return;
    previewSaving.value = true;
    try {
      const bytes = new TextEncoder().encode(previewDraft.value);
      if (bytes.byteLength > MAX_DIRECT_WRITE_BYTES) {
        showError(new Error(t("sftpAttrs.sizeLimit")));
        return;
      }
      const dataBase64 = window.datawisePlugin.encodeBase64(bytes);
      if (sudoMode.value) {
        await window.datawisePlugin.invoke("sudo/writeFile", {
          sessionId,
          path: previewPath.value,
          dataBase64,
        });
      } else {
        await window.datawisePlugin.invoke("sftp/write", {
          sessionId,
          remotePath: previewPath.value,
          dataBase64,
        });
      }
      previewText.value = previewDraft.value;
      previewSize.value = bytes.byteLength;
      previewBaseline.value = previewText.value;
      previewEditable.value = false;
      previewDraft.value = "";
      showNotice(t("editSave.saved", { name: previewTitle.value }));
      await loadDirectory();
    } catch (cause) {
      showError(cause);
    } finally {
      previewSaving.value = false;
    }
  }

  return {
    IMAGE_MIME_BY_EXTENSION,
    MAX_INLINE_PREVIEW_BYTES,
    previewOpen,
    previewTitle,
    previewText,
    previewLoading,
    previewPath,
    previewSize,
    previewEditable,
    previewDraft,
    previewSaving,
    previewMode,
    previewImageUrl,
    previewImageZoomed,
    previewTruncated,
    previewDirty,
    previewEditableAllowed,
    multiPreviewOpen,
    multiPreviewPath,
    openEntry,
    openImagePreview,
    closePreview,
    closeMultiFormatPreview,
    beginPreviewEdit,
    cancelPreviewEdit,
    savePreview,
  };
}
