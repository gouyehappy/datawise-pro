import { describe, expect, it, vi } from "vitest";
import {
  createZmodemSentry,
  decideZmodemDetection,
  mergeZmodemChunks,
  receiveZmodemSession,
  sanitizeZmodemFileName,
  sendZmodemFiles,
  validTransferOffset,
  type ZmodemSentryHandlers,
} from "./terminalZmodem";

function stubDetection(role: string) {
  return {
    get_session_role: () => role,
    deny: vi.fn(),
    confirm: vi.fn(),
  };
}

describe("zmodem detection decision", () => {
  it("confirms a send-role session while an upload is pending", () => {
    expect(decideZmodemDetection(stubDetection("send"), true)).toEqual({ action: "confirm", role: "send" });
  });

  it("confirms a receive-role session when downloads are allowed (sz auto-receive)", () => {
    expect(decideZmodemDetection(stubDetection("receive"), false, true)).toEqual({ action: "confirm", role: "receive" });
  });

  it("denies a receive-role session while an upload is pending", () => {
    const detection = stubDetection("receive");
    expect(decideZmodemDetection(detection, true, true)).toEqual({ action: "deny", reason: "uploadPending" });
    expect(detection.deny).not.toHaveBeenCalled();
  });

  it("denies a receive-role session when downloads are unavailable (trzsz owns the stream)", () => {
    expect(decideZmodemDetection(stubDetection("receive"), false, false)).toEqual({ action: "deny", reason: "roleMismatch" });
  });

  it("denies a send-role offer when nothing is queued locally", () => {
    expect(decideZmodemDetection(stubDetection("send"), false)).toEqual({ action: "deny", reason: "roleMismatch" });
  });

  it("classifies unrecognized roles against the same table", () => {
    expect(decideZmodemDetection(stubDetection("unknown"), true)).toEqual({ action: "deny", reason: "uploadPending" });
    expect(decideZmodemDetection(stubDetection("unknown"), false)).toEqual({ action: "deny", reason: "roleMismatch" });
    expect(decideZmodemDetection(stubDetection(""), true)).toEqual({ action: "deny", reason: "uploadPending" });
    expect(decideZmodemDetection(stubDetection("Send"), true)).toEqual({ action: "deny", reason: "uploadPending" });
  });
});

describe("sanitizeZmodemFileName (path-injection guard)", () => {
  it("strips POSIX and Windows path segments to the final basename", () => {
    expect(sanitizeZmodemFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeZmodemFileName("..\\..\\windows\\system32\\evil.exe")).toBe("evil.exe");
    expect(sanitizeZmodemFileName("/tmp/report.pdf")).toBe("report.pdf");
    expect(sanitizeZmodemFileName("C:\\Users\\x\\data.csv")).toBe("data.csv");
    expect(sanitizeZmodemFileName("a/../b/../../c.txt")).toBe("c.txt");
  });

  it("falls back to a safe name for empty or traversal-only offers", () => {
    expect(sanitizeZmodemFileName("")).toBe("download");
    expect(sanitizeZmodemFileName("..")).toBe("download");
    expect(sanitizeZmodemFileName(".")).toBe("download");
    expect(sanitizeZmodemFileName("///")).toBe("download");
  });

  it("removes control characters and Windows-illegal glyphs", () => {
    expect(sanitizeZmodemFileName("a\u0000b\u001fc.txt")).toBe("abc.txt");
    expect(sanitizeZmodemFileName('a<b>c:d"e|f?g*h.txt')).toBe("a_b_c_d_e_f_g_h.txt");
    expect(sanitizeZmodemFileName("name\u007f.txt")).toBe("name.txt");
  });

  it("neutralizes Windows reserved device names and trailing dots/spaces", () => {
    expect(sanitizeZmodemFileName("con")).toBe("_con");
    expect(sanitizeZmodemFileName("con.txt")).toBe("_con.txt");
    expect(sanitizeZmodemFileName("COM1.tar.gz")).toBe("_COM1.tar.gz");
    expect(sanitizeZmodemFileName("name. ")).toBe("name");
    expect(sanitizeZmodemFileName("normal-name_1.0.tar.bz2")).toBe("normal-name_1.0.tar.bz2");
  });

  it("caps pathological lengths while keeping the result usable", () => {
    const long = `${"a".repeat(500)}.bin`;
    const sanitized = sanitizeZmodemFileName(long);
    expect(sanitized.length).toBeLessThanOrEqual(180);
    expect(sanitized.startsWith("aaa")).toBe(true);
    expect(sanitized).not.toBe("download");
  });
});

describe("receiveZmodemSession", () => {
  function stubSession() {
    const handlers = new Map<string, (...args: never[]) => void>();
    return {
      on: vi.fn((event: string, callback: (...args: never[]) => void) => {
        handlers.set(event, callback);
        return undefined;
      }),
      has_ended: () => false,
      start: vi.fn(() => Promise.resolve()),
      emit: (event: string, ...args: never[]) => handlers.get(event)?.(...args),
    };
  }

  it("starts the session: the ZRINIT invite is emitted by start(), not confirm()", async () => {
    const session = stubSession();
    receiveZmodemSession(session as never, vi.fn());
    expect(session.start).toHaveBeenCalledTimes(1);
  });

  it("resolves once the session ends and forwards offers to the handler", async () => {
    const session = stubSession();
    const onOffer = vi.fn();
    const done = receiveZmodemSession(session as never, onOffer);
    session.emit("offer", { get_details: () => ({ name: "x" }) } as never);
    await Promise.resolve();
    expect(onOffer).toHaveBeenCalledTimes(1);
    session.emit("session_end");
    await expect(done).resolves.toEqual({});
  });

  it("resolves with the error when an offer handler throws", async () => {
    const session = stubSession();
    const done = receiveZmodemSession(session as never, () => {
      throw new Error("save failed");
    });
    session.emit("offer", {} as never);
    await expect(done).resolves.toEqual({ error: expect.any(Error) });
  });

  it("resolves immediately for a session that already ended", async () => {
    const session = stubSession();
    session.has_ended = () => true;
    await expect(receiveZmodemSession(session as never, vi.fn())).resolves.toEqual({});
  });
});

describe("mergeZmodemChunks", () => {
  it("concatenates spooled chunks byte-exactly and handles empty spools", () => {
    const merged = mergeZmodemChunks([new Uint8Array([1, 2]), new Uint8Array([]), new Uint8Array([3, 4, 5])]);
    expect([...merged]).toEqual([1, 2, 3, 4, 5]);
    expect(mergeZmodemChunks([]).byteLength).toBe(0);
  });
});

describe("validTransferOffset clamping", () => {
  it("accepts in-range offsets and clamps adversarial values to zero", () => {
    expect(validTransferOffset({ get_offset: () => 4096 } as never, 8192)).toBe(4096);
    expect(validTransferOffset({ get_offset: () => 0 } as never, 8192)).toBe(0);
    expect(validTransferOffset({ get_offset: () => -1 } as never, 8192)).toBe(0);
    expect(validTransferOffset({ get_offset: () => 9000 } as never, 8192)).toBe(0);
    expect(validTransferOffset({ get_offset: () => Number.NaN } as never, 8192)).toBe(0);
    expect(validTransferOffset({ get_offset: () => Number.POSITIVE_INFINITY } as never, 8192)).toBe(0);
  });
});

describe("createZmodemSentry", () => {
  it("returns a usable sentry wired to the caller's handlers", () => {
    const handlers: ZmodemSentryHandlers = {
      send: vi.fn(),
      toTerminal: vi.fn(),
      onDetect: vi.fn(),
      onRetract: vi.fn(),
    };
    expect(createZmodemSentry(handlers)).toBeDefined();
  });
});

describe("sendZmodemFiles", () => {
  it("rejects when the session is aborted mid-transfer", async () => {
    const transfer = {
      get_offset: () => 0,
      send: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
    };
    const session = {
      aborted: () => true,
      send_offer: vi.fn().mockResolvedValue(transfer),
      close: vi.fn().mockResolvedValue(undefined),
    } as never;
    const file = new File([new Uint8Array(8)], "a.bin");
    await expect(sendZmodemFiles(session, [file])).rejects.toThrow("ZMODEM session aborted");
  });

  it("skips a file whose offer was rejected and still closes the session", async () => {
    const session = {
      aborted: () => false,
      send_offer: vi.fn().mockResolvedValue(null),
      close: vi.fn().mockResolvedValue(undefined),
    } as never;
    const file = new File([new Uint8Array(4)], "b.bin");
    await sendZmodemFiles(session, [file]);
    expect((session as { close: ReturnType<typeof vi.fn> }).close).toHaveBeenCalledTimes(1);
  });
});
