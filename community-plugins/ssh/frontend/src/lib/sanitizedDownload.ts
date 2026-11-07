/** Save a pre-sanitized JSON export without relying on post-1.0 host APIs alone. */

export interface SanitizedDownloadEnvironment {
  self: unknown;
  top: unknown;
  frameElement: { hasAttribute(name: string): boolean } | null;
  datawisePlugin: Pick<DatawisePluginApi, "fileTransfer">;
  Blob: typeof Blob;
  URL: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
  document: Pick<Document, "body" | "createElement">;
  showSaveFilePicker?: Window["showSaveFilePicker"];
}

function isTopLevelUnsandboxed(env: SanitizedDownloadEnvironment): boolean {
  if (env.self !== env.top) return false;
  return !env.frameElement?.hasAttribute("sandbox");
}

function browserDownloadEnvironment(): SanitizedDownloadEnvironment {
  return {
    self: window.self,
    top: window.top,
    frameElement: window.frameElement,
    datawisePlugin: window.datawisePlugin,
    Blob,
    URL,
    document,
    showSaveFilePicker: window.showSaveFilePicker,
  };
}

export async function exportSanitizedJson(
  bytes: Uint8Array,
  fileName: string,
  env: SanitizedDownloadEnvironment = browserDownloadEnvironment(),
): Promise<"saved" | "downloaded" | "cancelled"> {
  if (env.showSaveFilePicker) {
    try {
      const handle = await env.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
      return "saved";
    } catch (cause) {
      const name = cause instanceof Error ? cause.name : "";
      if (name === "AbortError") return "cancelled";
      // Fall through to fileTransfer / browser download.
    }
  }
  if (env.datawisePlugin.fileTransfer) {
    const transfer = env.datawisePlugin.fileTransfer;
    const target = await transfer.beginSave({
      name: fileName,
      contentType: "application/json",
      size: bytes.byteLength,
    });
    await transfer.write(target.handleId, 0, bytes);
    await transfer.finish(target.handleId);
    return "saved";
  }
  if (!isTopLevelUnsandboxed(env)) {
    throw new Error(
      "Sanitized export requires fileTransfer or a top-level browser context. Open it outside the sandboxed workbench or upgrade the host.",
    );
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const url = env.URL.createObjectURL(new env.Blob([copy.buffer], { type: "application/json" }));
  const anchor = env.document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  env.document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    env.URL.revokeObjectURL(url);
  }
  return "downloaded";
}
