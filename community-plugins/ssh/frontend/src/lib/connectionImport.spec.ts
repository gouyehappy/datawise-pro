import { describe, expect, it } from "vitest";
import {
  IMPORT_CHUNK_LIMIT,
  IMPORT_TOTAL_LIMIT,
  importErrorCode,
  importPreviewChunk,
  importPreviewChunkParams,
  importPreviewStartParams,
  parseImportSessions,
} from "./connectionImport";

describe("connectionImport", () => {
  it("parses sanitized preview rows", () => {
    const rows = parseImportSessions({
      sessions: [
        {
          index: 2,
          name: "prod",
          host: "10.0.0.1",
          port: 22,
          username: "ops",
          groupPath: "prod/app",
          description: "",
          authKind: "password",
          hasSecret: false,
          secretNote: "encrypted",
        },
        null,
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ index: 2, name: "prod", host: "10.0.0.1", secretNote: "encrypted" });
  });

  it("rejects oversized preview start budgets", () => {
    expect(() => importPreviewStartParams("moba", IMPORT_TOTAL_LIMIT + 1, 0, "")).toThrow(
      /import-size-limit/,
    );
  });

  it("builds windterm start params with optional user.config", () => {
    expect(importPreviewStartParams("windterm", 100, 50, "secret")).toEqual({
      kind: "windterm",
      mainSize: 100,
      userConfigSize: 50,
      masterPassword: "secret",
    });
  });

  it("frames import chunks with a big-endian offset prefix", () => {
    const payload = new Uint8Array([1, 2, 3]);
    const frame = importPreviewChunk(0x100, payload);
    expect(frame.byteLength).toBe(11);
    expect(new DataView(frame.buffer).getBigUint64(0)).toBe(0x100n);
    expect([...frame.slice(8)]).toEqual([1, 2, 3]);
    expect(() => importPreviewChunk(0, new Uint8Array(IMPORT_CHUNK_LIMIT + 1))).toThrow(
      /import-chunk-limit/,
    );
  });

  it("builds RPC chunk params with base64 payload", () => {
    const payload = new Uint8Array([1, 2, 3]);
    expect(importPreviewChunkParams("task-1", "main", 10, payload)).toEqual({
      taskId: "task-1",
      part: "main",
      offset: 10,
      dataBase64: btoa(String.fromCharCode(1, 2, 3)),
    });
  });

  it("maps known import errors", () => {
    expect(importErrorCode(new Error("WindTerm master password is required"))).toBe("masterPassword");
    expect(importErrorCode("import-size-limit")).toBe("sizeLimit");
    expect(importErrorCode("boom")).toBe("");
  });
});
