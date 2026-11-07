import { describe, expect, it, vi } from "vitest";
import { createDualFrameSchedule, createTerminalWriteThrottle } from "./terminalWriteThrottle";

interface ManualScheduler {
  schedule: (callback: () => void) => number;
  run: () => void;
  cancel: (handle: unknown) => void;
  cancels: () => number;
}

function manualScheduler(): ManualScheduler {
  let callback: (() => void) | undefined;
  let cancelCount = 0;
  return {
    schedule(cb) {
      callback = cb;
      return 1;
    },
    run() {
      const cb = callback;
      callback = undefined;
      cb?.();
    },
    cancel() {
      cancelCount += 1;
      callback = undefined;
    },
    cancels: () => cancelCount,
  };
}

const encoder = new TextEncoder();

function bytes(text: string): Uint8Array {
  return encoder.encode(text);
}

function text(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

/** Sync sink that completes immediately (unit tests). */
function syncSink(delivered: string[]) {
  return (data: Uint8Array, done: () => void) => {
    delivered.push(text(data));
    done();
  };
}

describe("createTerminalWriteThrottle", () => {
  it("coalesces consecutive writes into a single ordered sink call per frame", () => {
    const scheduler = manualScheduler();
    const delivered: string[] = [];
    const throttle = createTerminalWriteThrottle({
      sink: syncSink(delivered),
      schedule: scheduler.schedule,
      cancel: () => undefined,
    });
    throttle.write(bytes("$ "));
    throttle.write(bytes("ls"));
    throttle.write(bytes("\r\n"));
    expect(delivered).toEqual([]);
    scheduler.run();
    expect(delivered).toEqual(["$ ls\r\n"]);
    expect(throttle.pending).toBe(false);
    expect(throttle.pendingBytes).toBe(0);
  });

  it("keeps byte-level order across the cap boundary and multiple frames", () => {
    const scheduler = manualScheduler();
    const delivered: string[] = [];
    const throttle = createTerminalWriteThrottle({
      sink: syncSink(delivered),
      schedule: scheduler.schedule,
      cancel: () => undefined,
      maxBufferBytes: 10,
    });
    throttle.write(bytes("aaaaa"));
    throttle.write(bytes("bbbbb")); // 10 bytes queued, still within cap
    throttle.write(bytes("ccccc")); // exceeds cap -> flush of queued
    expect(delivered).toEqual(["aaaaabbbbb"]);
    scheduler.run();
    expect(delivered).toEqual(["aaaaabbbbb", "ccccc"]);
  });

  it("flush() cancels the pending frame and delivers the merged payload exactly once", () => {
    const scheduler = manualScheduler();
    const delivered: string[] = [];
    const throttle = createTerminalWriteThrottle({
      sink: syncSink(delivered),
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
    });
    throttle.write(bytes("hello "));
    throttle.write(bytes("world"));
    throttle.flush();
    expect(delivered).toEqual(["hello world"]);
    expect(scheduler.cancels()).toBe(1);
    // Running the (cancelled) scheduled callback must not double-deliver.
    scheduler.run();
    expect(delivered).toEqual(["hello world"]);
    throttle.flush();
    expect(delivered).toEqual(["hello world"]);
  });

  it("dispose flushes remaining bytes and stops scheduling", () => {
    const scheduler = manualScheduler();
    const delivered: string[] = [];
    const throttle = createTerminalWriteThrottle({
      sink: syncSink(delivered),
      schedule: scheduler.schedule,
      cancel: () => undefined,
    });
    throttle.write(bytes("tail"));
    throttle.dispose();
    expect(delivered).toEqual(["tail"]);
    scheduler.run();
    expect(delivered).toEqual(["tail"]);
    expect(throttle.pending).toBe(false);
  });

  it("does not call the sink for an empty queue", () => {
    const scheduler = manualScheduler();
    let calls = 0;
    const throttle = createTerminalWriteThrottle({
      sink: (_data, done) => {
        calls += 1;
        done();
      },
      schedule: scheduler.schedule,
      cancel: () => undefined,
    });
    throttle.write(new Uint8Array(0));
    throttle.flush();
    expect(calls).toBe(0);
    expect(throttle.pending).toBe(false);
  });

  it("single chunks larger than the cap are delivered in one piece on the next frame", () => {
    const scheduler = manualScheduler();
    const delivered: string[] = [];
    const throttle = createTerminalWriteThrottle({
      sink: syncSink(delivered),
      schedule: scheduler.schedule,
      cancel: () => undefined,
      maxBufferBytes: 4,
    });
    throttle.write(bytes("0123456789"));
    expect(delivered).toEqual(["0123456789"]);
    scheduler.run();
    expect(delivered).toEqual(["0123456789"]);
  });

  it("flushes immediately once urgent flood bytes are queued", () => {
    const scheduler = manualScheduler();
    const delivered: string[] = [];
    const throttle = createTerminalWriteThrottle({
      sink: syncSink(delivered),
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
      maxBufferBytes: 1_000_000,
    });
    throttle.write(new Uint8Array(32 * 1024));
    expect(delivered.length).toBe(1);
    expect(delivered[0]!.length).toBe(32 * 1024);
  });

  it("waits for sink done before flushing the next queued merge (backpressure)", () => {
    const scheduler = manualScheduler();
    const delivered: string[] = [];
    let release: (() => void) | undefined;
    const throttle = createTerminalWriteThrottle({
      sink: (data, done) => {
        delivered.push(text(data));
        release = done;
      },
      schedule: scheduler.schedule,
      cancel: () => undefined,
    });
    throttle.write(bytes("one"));
    scheduler.run();
    expect(delivered).toEqual(["one"]);
    throttle.write(bytes("two"));
    scheduler.run(); // must not deliver while first write is in flight
    expect(delivered).toEqual(["one"]);
    release?.();
    scheduler.run();
    expect(delivered).toEqual(["one", "two"]);
  });
});

describe("createDualFrameSchedule", () => {
  it("fires via timeout when requestAnimationFrame never runs", () => {
    vi.useFakeTimers();
    const rafIds: number[] = [];
    const originalRaf = globalThis.requestAnimationFrame;
    const originalCancel = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      const id = rafIds.length + 1;
      rafIds.push(id);
      void cb;
      return id;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((id: number) => {
      void id;
    }) as typeof cancelAnimationFrame;

    try {
      const { schedule, cancel } = createDualFrameSchedule(16);
      let fired = 0;
      const handle = schedule(() => {
        fired += 1;
      });
      expect(fired).toBe(0);
      vi.advanceTimersByTime(16);
      expect(fired).toBe(1);
      cancel(handle);
      vi.advanceTimersByTime(16);
      expect(fired).toBe(1);
    } finally {
      globalThis.requestAnimationFrame = originalRaf;
      globalThis.cancelAnimationFrame = originalCancel;
      vi.useRealTimers();
    }
  });
});
