import { describe, expect, it } from "vitest";
import {
  collectDrainBatch,
  TERMINAL_DRAIN_BATCH_BYTES,
  type DrainFrame,
} from "./terminalDrainBatch";

const frame = (size: number, stream = 1): DrainFrame => ({ stream, data: new Uint8Array(size) });

function pendingOf(...sequences: [number, DrainFrame][]): Map<number, DrainFrame> {
  return new Map(sequences);
}

describe("collectDrainBatch (有界排水)", () => {
  it("空队列不推进序号、不需要续排", () => {
    const pending = pendingOf();
    expect(collectDrainBatch(pending, 7, { now: () => 0 })).toEqual({
      batch: [],
      lastSequence: 7,
      hasMore: false,
      bytes: 0,
    });
  });

  it("预算内的连续帧全部收齐并从 pending 移除", () => {
    const pending = pendingOf([1, frame(10)], [2, frame(20)], [3, frame(30)]);
    const result = collectDrainBatch(pending, 0, { now: () => 0 });
    expect(result.batch).toHaveLength(3);
    expect(result.lastSequence).toBe(3);
    expect(result.bytes).toBe(60);
    expect(result.hasMore).toBe(false);
    expect(pending.size).toBe(0);
  });

  it("序号缺口处停止，缺口之后的帧保持不动", () => {
    const later = frame(5);
    const pending = pendingOf([1, frame(10)], [3, frame(30)], [4, later]);
    const result = collectDrainBatch(pending, 0, { now: () => 0 });
    expect(result.batch).toHaveLength(1);
    expect(result.lastSequence).toBe(1);
    expect(result.hasMore).toBe(false);
    expect(pending.get(3)).toBeDefined();
    expect(pending.get(4)).toBe(later);
  });

  it("超过字节预算时停止，剩余连续帧留给下一次 rAF", () => {
    const pending = pendingOf(
      [1, frame(100)],
      [2, frame(100)],
      [3, frame(100)],
      [4, frame(100)],
    );
    const result = collectDrainBatch(pending, 0, { maxBytes: 150, now: () => 0 });
    expect(result.batch).toHaveLength(2);
    expect(result.lastSequence).toBe(2);
    expect(result.bytes).toBe(200);
    expect(result.hasMore).toBe(true);
    expect(pending.size).toBe(2);

    // 第二次调用从新序号继续，最终排空。
    const second = collectDrainBatch(pending, result.lastSequence, { maxBytes: 150, now: () => 0 });
    expect(second.batch).toHaveLength(2);
    expect(second.hasMore).toBe(false);
    expect(pending.size).toBe(0);
  });

  it("单帧超过预算仍至少推进一帧（慢机器/大帧也前进）", () => {
    const pending = pendingOf([1, frame(TERMINAL_DRAIN_BATCH_BYTES * 4)], [2, frame(1)]);
    const result = collectDrainBatch(pending, 0, { now: () => 0 });
    expect(result.batch).toHaveLength(1);
    expect(result.lastSequence).toBe(1);
    expect(result.hasMore).toBe(true);
  });

  it("墙钟预算到点即停，剩余帧续排", () => {
    let clock = 0;
    const pending = pendingOf([1, frame(1)], [2, frame(1)], [3, frame(1)]);
    const result = collectDrainBatch(pending, 0, {
      maxBytes: 1 << 20,
      budgetMs: 4,
      now: () => {
        const value = clock;
        clock += 3; // 每帧 3ms：第 2 帧后累计 6ms > 4ms
        return value;
      },
    });
    expect(result.batch).toHaveLength(2);
    expect(result.hasMore).toBe(true);
  });

  it("控制帧（stream=2）同样按序号收集，不打乱顺序", () => {
    const pending = pendingOf([1, frame(4, 1)], [2, frame(6, 2)], [3, frame(8, 1)]);
    const result = collectDrainBatch(pending, 0, { now: () => 0 });
    expect(result.batch.map((item) => item.stream)).toEqual([1, 2, 1]);
    expect(result.bytes).toBe(18);
  });
});
