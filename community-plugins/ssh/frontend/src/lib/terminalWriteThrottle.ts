/**
 * Coalesced terminal write scheduling (large-output rendering throttle).
 *
 * xterm.js's Terminal.write is asynchronous internally but still pays
 * per-call parse overhead; the sidecar streaming a big `cat`/build log emits
 * many small binary frames in quick succession, and writing each frame
 * straight through floods the parser. This helper buffers consecutive chunks
 * and hands xterm a single merged write per animation frame, preserving
 * chunk order exactly. A byte cap flushes once the queued payload grows past
 * it, so a sustained burst cannot balloon the buffer.
 *
 * Scheduling uses requestAnimationFrame **and** a short setTimeout fallback
 * (whichever fires first). JetBrains JCEF often starves rAF until the next
 * user input / focus paint — without the timeout, `tail -f` output sits in
 * the queue until the user hits Enter.
 *
 * The sink must invoke `done` when the chunk is accepted (xterm write
 * completion) so the next flush waits for parser/paint backpressure.
 */

export interface TerminalWriteThrottleOptions {
  /**
   * Receives the merged payload (one call per flush, never re-entrant).
   * Must invoke `done` when the sink has accepted the chunk.
   */
  sink: (data: Uint8Array, done: () => void) => void;
  /** Schedules the deferred flush and returns a cancellable handle. Defaults to rAF + timeout. */
  schedule?: (callback: () => void) => unknown;
  /** Cancels a handle returned by `schedule`. */
  cancel?: (handle: unknown) => void;
  /** Flush once queued bytes exceed this cap (default 1 MiB). */
  maxBufferBytes?: number;
  /** Fallback timer when rAF is starved (default 16 ms ≈ one frame). */
  flushDelayMs?: number;
}

export interface TerminalWriteThrottle {
  /** Queue a chunk; flushed merged with its peers on the next frame. */
  write(data: Uint8Array): void;
  /** Cancel the pending frame and deliver queued bytes now (when idle). */
  flush(): void;
  /** Deliver any idle queued bytes, then stop scheduling. */
  dispose(): void;
  readonly pendingBytes: number;
  readonly pending: boolean;
}

/** Slightly under one display frame — sidecar already merges ~12 ms bursts. */
const DEFAULT_FLUSH_DELAY_MS = 8;
/** Skip the timer and flush now once this much is queued (flood catch-up). */
const URGENT_FLUSH_BYTES = 32 * 1024;

type DualScheduleHandle = {
  raf: number | null;
  timeout: ReturnType<typeof setTimeout> | null;
  cancelled: boolean;
};

/** rAF + setTimeout: first win. Keeps JCEF flushing when animation frames stall. */
export function createDualFrameSchedule(flushDelayMs = DEFAULT_FLUSH_DELAY_MS): {
  schedule: (callback: () => void) => DualScheduleHandle;
  cancel: (handle: unknown) => void;
} {
  const delay = Math.max(0, flushDelayMs);
  return {
    schedule(callback) {
      const handle: DualScheduleHandle = { raf: null, timeout: null, cancelled: false };
      const run = () => {
        if (handle.cancelled) return;
        handle.cancelled = true;
        if (handle.raf != null && typeof cancelAnimationFrame === "function") {
          cancelAnimationFrame(handle.raf);
          handle.raf = null;
        }
        if (handle.timeout != null) {
          clearTimeout(handle.timeout);
          handle.timeout = null;
        }
        callback();
      };
      if (typeof requestAnimationFrame === "function") {
        handle.raf = requestAnimationFrame(run);
      }
      handle.timeout = setTimeout(run, delay);
      return handle;
    },
    cancel(raw) {
      const handle = raw as DualScheduleHandle | null;
      if (!handle || handle.cancelled) return;
      handle.cancelled = true;
      if (handle.raf != null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(handle.raf);
        handle.raf = null;
      }
      if (handle.timeout != null) {
        clearTimeout(handle.timeout);
        handle.timeout = null;
      }
    },
  };
}

function mergeChunks(chunks: Uint8Array[], total: number): Uint8Array {
  if (chunks.length === 1) return chunks[0];
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

export function createTerminalWriteThrottle(options: TerminalWriteThrottleOptions): TerminalWriteThrottle {
  const maxBufferBytes = options.maxBufferBytes ?? 1_048_576;
  const dual = options.schedule && options.cancel
    ? null
    : createDualFrameSchedule(options.flushDelayMs ?? DEFAULT_FLUSH_DELAY_MS);
  const schedule = options.schedule ?? dual!.schedule;
  const cancel = options.cancel ?? dual!.cancel;
  let queue: Uint8Array[] = [];
  let queuedBytes = 0;
  let handle: unknown = null;
  let emitting = false;
  let disposed = false;

  function scheduleEmit() {
    if (disposed || emitting || handle !== null || !queue.length) return;
    handle = schedule(emit);
  }

  function emit() {
    handle = null;
    if (disposed || emitting || !queue.length) return;
    emitting = true;
    const data = mergeChunks(queue, queuedBytes);
    queue = [];
    queuedBytes = 0;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      emitting = false;
      if (disposed) return;
      if (queuedBytes >= maxBufferBytes) {
        emit();
        return;
      }
      scheduleEmit();
    };
    try {
      options.sink(data, done);
    } catch {
      done();
    }
  }

  return {
    write(data: Uint8Array) {
      if (disposed || !data.byteLength) return;
      // Burst past the cap: flush the current merge first (when idle) so memory
      // stays bounded and chunk order is preserved.
      if (!emitting && handle !== null && queuedBytes + data.byteLength > maxBufferBytes) {
        cancel(handle);
        handle = null;
        emit();
      }
      queue.push(data);
      queuedBytes += data.byteLength;
      if (!emitting && queuedBytes >= maxBufferBytes) {
        if (handle !== null) {
          cancel(handle);
          handle = null;
        }
        emit();
        return;
      }
      // Large pending bursts should not wait a full animation frame on JCEF.
      if (!emitting && queuedBytes >= URGENT_FLUSH_BYTES) {
        if (handle !== null) {
          cancel(handle);
          handle = null;
        }
        emit();
        return;
      }
      scheduleEmit();
    },
    flush() {
      if (disposed) return;
      if (handle !== null) {
        cancel(handle);
        handle = null;
      }
      if (!emitting) emit();
    },
    dispose() {
      if (handle !== null) {
        cancel(handle);
        handle = null;
      }
      if (!emitting && queue.length) {
        // Last chance delivery before teardown (terminal still alive in App.vue).
        emit();
      }
      disposed = true;
      if (!emitting) {
        queue = [];
        queuedBytes = 0;
      }
    },
    get pendingBytes() {
      return queuedBytes;
    },
    get pending() {
      return handle !== null || queue.length > 0 || emitting;
    },
  };
}
