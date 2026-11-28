/**
 * 终端帧排水的有界收集（借鉴 motty `pumpBudget` 时间预算泵 + dbx #302 洪峰治理）。
 *
 * 背景：#302 之后下行帧先入 pending map、再由 rAF 统一排水，但排水循环会
 * 一次性收齐所有连续序号帧。洪流（`tail -f` / 构建日志 / `sz` 大文件）时，
 * 一个 rAF 里可能同步合帧并扫过数 MiB，zmodem sentry / trzsz / 关键字高亮
 * 这条中间件链会把主线程吃满，输入与绘制一起卡住。
 *
 * 这里把「收多少」做成有界纯函数：至少推进一帧（慢机器也前进），达到字节
 * 预算或墙钟预算就把剩余连续帧留在 pending map，由调用方再调度一次 rAF。
 * 与 dw 已有的合帧上限（256 KiB）、write throttle（1 MiB 强制 flush）、
 * outputGate（ strained 降级）叠加，形成「接收有界 → 排水有界 → 渲染有界」
 * 的完整链路，而不是只在渲染侧降级。
 */

export interface DrainFrame {
  stream: number;
  data: Uint8Array;
}

/** 单次 rAF 排水的字节预算：与 `TERMINAL_MERGED_FLUSH_BYTES` 对齐。 */
export const TERMINAL_DRAIN_BATCH_BYTES = 256 * 1024;
/** 单次排水的墙钟预算（≈ 120 Hz 的半帧，对齐 motty `pumpBudget`）。 */
export const TERMINAL_DRAIN_BUDGET_MS = 4;

export interface DrainBatchResult {
  batch: DrainFrame[];
  /** 已消费到的序号；调用方应写回 lastSequence。 */
  lastSequence: number;
  /** 预算用尽后仍有连续帧待处理，调用方应再调度一次 rAF。 */
  hasMore: boolean;
  /** 本次批次的字节数（诊断/单测用）。 */
  bytes: number;
}

export interface CollectDrainBatchOptions {
  maxBytes?: number;
  budgetMs?: number;
  /** 注入时钟以便单测确定性验证时间预算；默认 performance.now()。 */
  now?: () => number;
}

/**
 * 从 `pending` 中按序号取连续帧并删除。遇到序号缺口即停；预算用尽即停。
 * `pending` 是就地修改的（与调用方原本的 delete 语义一致），但不触碰 DOM、
 * 不做 I/O，可穷尽单测。
 */
export function collectDrainBatch(
  pending: Map<number, DrainFrame>,
  lastSequence: number,
  options: CollectDrainBatchOptions = {},
): DrainBatchResult {
  const maxBytes = Math.max(1, Math.floor(options.maxBytes ?? TERMINAL_DRAIN_BATCH_BYTES));
  const budgetMs = Math.max(0, options.budgetMs ?? TERMINAL_DRAIN_BUDGET_MS);
  const now = options.now ?? (() => performance.now());
  const started = now();

  const batch: DrainFrame[] = [];
  let cursor = lastSequence;
  let bytes = 0;
  for (;;) {
    const frame = pending.get(cursor + 1);
    if (!frame) break;
    pending.delete(cursor + 1);
    cursor += 1;
    batch.push(frame);
    bytes += frame.data.length;
    // 至少推进一帧；达到字节或时间预算后把剩余连续帧留给下一次 rAF。
    if (bytes >= maxBytes || now() - started >= budgetMs) break;
  }

  return { batch, lastSequence: cursor, hasMore: pending.has(cursor + 1), bytes };
}
