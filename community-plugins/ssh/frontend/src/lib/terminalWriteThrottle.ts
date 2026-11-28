/**
 * Coalesced terminal write scheduling (large-output rendering throttle).
 *
 * xterm.js's Terminal.write is asynchronous internally but still pays
 * per-call parse overhead; the sidecar streaming a big `cat`/build log emits
 * many small binary frames in quick succession, and writing each frame
 * straight through floods the parser. This helper buffers consecutive chunks
 * and hands xterm a merged write per animation frame, preserving chunk order.
 *
 * Motty parity (`pumpSlice` / `pumpBudget`): each scheduled emit delivers at
 * most `maxEmitBytes` (default 32 KiB) and leaves the remainder for the next
 * frame, so a sustained `tail -f` cannot dump megabytes into one xterm.parse.
 * Explicit `flush()` / DECSET 2026 release still commit the whole queue in one
 * write (sync-output semantics).
 *
 * Scheduling uses requestAnimationFrame **and** a short setTimeout fallback
 * (whichever fires first). JetBrains JCEF often starves rAF until the next
 * user input / focus paint — without the timeout, `tail -f` output sits in
 * the queue until the user hits Enter.
 *
 * The sink must invoke `done` when the chunk is accepted (xterm write
 * completion) so the next flush waits for parser/paint backpressure.
 *
 * `setHold` is DECSET 2026 synchronized output (WT-1, WezTerm parity): while
 * held, rAF scheduling pauses and writes keep accumulating; `setHold(false)`
 * commits the whole batch in one merged write. A hold older than
 * `holdFlushDelayMs` (default 100ms) force-flushes so a sync window split
 * across PTY read boundaries cannot stall rendering until the byte cap.
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
  /**
   * Max bytes per scheduled sink call (Motty `pumpSlice`, default 32 KiB).
   * `flush()` / hold-release ignore this and emit the full queue.
   */
  maxEmitBytes?: number;
  /** Fallback timer when rAF is starved (default 16 ms ≈ one frame). */
  flushDelayMs?: number;
  /** DECSET 2026 hold deadline in ms (default 100). */
  holdFlushDelayMs?: number;
  /** Schedules the hold-deadline flush. Defaults to setTimeout. */
  scheduleHold?: (callback: () => void) => unknown;
  /** Cancels a handle returned by `scheduleHold`. */
  cancelHold?: (handle: unknown) => void;
}

export interface TerminalWriteThrottle {
  /** Queue a chunk; flushed merged with its peers on the next frame. */
  write(data: Uint8Array): void;
  /** Cancel the pending frame and deliver queued bytes now (when idle). */
  flush(): void;
  /**
   * DECSET 2026 frame sync: `true` pauses scheduled flushes (queued writes
   * keep accumulating), `false` commits everything buffered so far in one
   * merged call. A hold older than `holdFlushDelayMs` flushes on its own so
   * a release stranded behind the hold cannot stall rendering until the byte
   * cap. Idempotent; repeated values are no-ops.
   */
  setHold(hold: boolean): void;
  /** Deliver any idle queued bytes, then stop scheduling. */
  dispose(): void;
  /** Whether frame sync is currently holding writes back. */
  readonly held: boolean;
  readonly pendingBytes: number;
  readonly pending: boolean;
}

/** Slightly under one display frame — sidecar already merges ~12 ms bursts. */
const DEFAULT_FLUSH_DELAY_MS = 8;
/** Motty `pumpSlice` — one xterm write per wake stays bounded. */
export const DEFAULT_MAX_EMIT_BYTES = 32 * 1024;
/** Skip the timer and flush one pump slice once this much is queued. */
const URGENT_FLUSH_BYTES = DEFAULT_MAX_EMIT_BYTES;

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
  if (chunks.length === 1) return chunks[0]!;
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

/** Take up to `limit` bytes from the front of `queue`; mutates `queue` in place. */
export function takeQueuePrefix(
  queue: Uint8Array[],
  queuedBytes: number,
  limit: number,
): { data: Uint8Array; queuedBytes: number } {
  if (!queue.length || limit <= 0 || queuedBytes <= 0) {
    return { data: new Uint8Array(0), queuedBytes: Math.max(0, queuedBytes) };
  }
  if (queuedBytes <= limit) {
    const data = mergeChunks(queue, queuedBytes);
    queue.length = 0;
    return { data, queuedBytes: 0 };
  }
  const out = new Uint8Array(limit);
  let filled = 0;
  while (filled < limit && queue.length) {
    const head = queue[0]!;
    const need = limit - filled;
    if (head.byteLength <= need) {
      out.set(head, filled);
      filled += head.byteLength;
      queue.shift();
    } else {
      out.set(head.subarray(0, need), filled);
      queue[0] = head.subarray(need);
      filled = limit;
    }
  }
  return { data: out, queuedBytes: queuedBytes - filled };
}

export function createTerminalWriteThrottle(options: TerminalWriteThrottleOptions): TerminalWriteThrottle {
  const maxBufferBytes = options.maxBufferBytes ?? 1_048_576;
  const maxEmitBytes = Math.max(1, Math.floor(options.maxEmitBytes ?? DEFAULT_MAX_EMIT_BYTES));
  const dual = options.schedule && options.cancel
    ? null
    : createDualFrameSchedule(options.flushDelayMs ?? DEFAULT_FLUSH_DELAY_MS);
  const schedule = options.schedule ?? dual!.schedule;
  const cancel = options.cancel ?? dual!.cancel;
  const holdFlushDelayMs = options.holdFlushDelayMs ?? 100;
  const scheduleHold = options.scheduleHold ?? ((callback: () => void) => setTimeout(callback, holdFlushDelayMs));
  const cancelHold = options.cancelHold ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let queue: Uint8Array[] = [];
  let queuedBytes = 0;
  let handle: unknown = null;
  let holdHandle: unknown = null;
  let emitting = false;
  let held = false;
  let disposed = false;

  function armHoldDeadline() {
    if (holdHandle !== null) return;
    holdHandle = scheduleHold(() => {
      holdHandle = null;
      // Deadline mid-hold: one pump slice so a stranded sync window cannot OOM.
      if (!emitting) emit(false);
    });
  }

  function disarmHoldDeadline() {
    if (holdHandle === null) return;
    cancelHold(holdHandle);
    holdHandle = null;
  }

  function scheduleEmit() {
    if (disposed || emitting || held || handle !== null || !queue.length) return;
    handle = schedule(() => emit(false));
  }

  function emit(all: boolean) {
    handle = null;
    if (disposed || emitting || !queue.length) return;
    emitting = true;
    const taken = takeQueuePrefix(queue, queuedBytes, all ? queuedBytes : maxEmitBytes);
    queuedBytes = taken.queuedBytes;
    const data = taken.data;
    if (!data.byteLength) {
      emitting = false;
      return;
    }
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      emitting = false;
      if (disposed) return;
      if (held) {
        if (queue.length) armHoldDeadline();
        return;
      }
      // Motty: remainder waits for the next wake — never sync-chain megabytes
      // into xterm on one call stack.
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
      // Cap / hold: flush one slice first (when idle) so memory stays bounded.
      if (!emitting && (handle !== null || held) && queuedBytes + data.byteLength > maxBufferBytes) {
        if (handle !== null) {
          cancel(handle);
          handle = null;
        }
        emit(false);
      }
      queue.push(data);
      queuedBytes += data.byteLength;
      if (!emitting && queuedBytes >= maxBufferBytes) {
        if (handle !== null) {
          cancel(handle);
          handle = null;
        }
        emit(false);
        return;
      }
      if (held) {
        armHoldDeadline();
        return;
      }
      // Large pending bursts: start the first pump slice now (JCEF catch-up).
      if (!emitting && queuedBytes >= URGENT_FLUSH_BYTES) {
        if (handle !== null) {
          cancel(handle);
          handle = null;
        }
        emit(false);
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
      // Explicit flush / sync-output release: commit the whole queue once.
      if (!emitting) emit(true);
    },
    setHold(next: boolean) {
      if (held === next) return;
      held = next;
      if (next) {
        if (handle !== null) {
          cancel(handle);
          handle = null;
        }
        armHoldDeadline();
      } else {
        disarmHoldDeadline();
        this.flush();
      }
    },
    dispose() {
      disarmHoldDeadline();
      if (handle !== null) {
        cancel(handle);
        handle = null;
      }
      if (!emitting && queue.length) {
        emit(true);
      }
      disposed = true;
      if (!emitting) {
        queue = [];
        queuedBytes = 0;
      }
    },
    get held() {
      return held;
    },
    get pendingBytes() {
      return queuedBytes;
    },
    get pending() {
      return handle !== null || queue.length > 0 || emitting;
    },
  };
}
