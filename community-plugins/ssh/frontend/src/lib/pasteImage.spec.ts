import { describe, expect, it } from "vitest";
import {
  PASTE_IMAGE_MAX_BYTES,
  pasteImageFileName,
  pasteImageInsertText,
  pickPasteImage,
  resolvePasteImageKind,
  shellQuotePath,
} from "./pasteImage";

function fakeFile(name: string, type: string, size: number): File {
  const blob = new Blob([new Uint8Array(Math.min(size, 16))], { type });
  const file = new File([blob], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("pasteImage helpers", () => {
  it("picks the first image under the size cap", () => {
    const img = fakeFile("shot.png", "image/png", 1024);
    expect(pickPasteImage([img])).toEqual({ ok: true, file: img });
    expect(pickPasteImage([])).toEqual({ ok: false, reason: "none" });
    expect(pickPasteImage([fakeFile("a.txt", "text/plain", 10)])).toEqual({ ok: false, reason: "not-image" });
    expect(pickPasteImage([fakeFile("big.png", "image/png", PASTE_IMAGE_MAX_BYTES + 1)])).toEqual({
      ok: false,
      reason: "too-large",
    });
  });

  it("resolves session kind for local vs ssh vs unsupported", () => {
    expect(resolvePasteImageKind({ sshConnected: false, protocolKind: "local" })).toBe("local");
    expect(resolvePasteImageKind({ sshConnected: true, protocolKind: null })).toBe("ssh");
    expect(resolvePasteImageKind({ sshConnected: false, protocolKind: "telnet" })).toBe("unsupported");
  });

  it("builds a stamp filename and shell-quotes paths", () => {
    const name = pasteImageFileName(fakeFile("x", "image/png", 8), new Date("2026-11-25T07:08:09Z"));
    expect(name).toMatch(/^paste-\d{8}-\d{6}-[a-z0-9]+\.png$/);
    expect(shellQuotePath("/tmp/a b.png")).toBe("'/tmp/a b.png'");
    expect(shellQuotePath("a'b")).toBe(`'a'\\''b'`);
    expect(pasteImageInsertText("/tmp/x.png")).toBe("'/tmp/x.png' ");
  });
});
