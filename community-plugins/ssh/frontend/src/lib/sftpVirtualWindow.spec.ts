import { describe, expect, it } from "vitest";
import {
  computeWindow,
  FILE_ROW_HEIGHT_PX,
  FILE_ROW_OVERSCAN,
  SFTP_VIRTUAL_THRESHOLD,
  scrollTopForRow,
} from "./sftpVirtualWindow";

const ROW = 30;

function win(scrollTop: number, viewportHeight: number, total: number, overscan = 8, threshold = 0) {
  return computeWindow({ scrollTop, viewportHeight, rowHeight: ROW, total, overscan, threshold });
}

describe("computeWindow — 退化输入", () => {
  it("空列表返回空窗口", () => {
    expect(win(0, 600, 0)).toEqual({ start: 0, end: 0, padTop: 0, padBottom: 0 });
  });

  it("视口不可见时不渲染任何行（但也不产生 spacer）", () => {
    expect(win(0, 0, 500)).toEqual({ start: 0, end: 0, padTop: 0, padBottom: 0 });
    expect(win(0, -1, 500)).toEqual({ start: 0, end: 0, padTop: 0, padBottom: 0 });
  });

  it("负 scrollTop / 负 overscan / rowHeight<=0 都安全钳制", () => {
    const negativeScroll = win(-9999, 600, 500, 8);
    expect(negativeScroll.start).toBe(0);
    expect(negativeScroll.padTop).toBe(0);

    const negativeOverscan = computeWindow({ scrollTop: 300, viewportHeight: 600, rowHeight: ROW, total: 500, overscan: -3 });
    expect(negativeOverscan.start).toBe(10);
    expect(negativeOverscan.end).toBe(30);

    const zeroRowHeight = computeWindow({ scrollTop: 0, viewportHeight: 600, rowHeight: 0, total: 500 });
    // rowHeight 钳到 1：600 行高 1px 时 500 行全在窗口内。
    expect(zeroRowHeight.end).toBe(500);
    expect(zeroRowHeight.padBottom).toBe(0);
  });
});

describe("computeWindow — 小目录阈值（零 spacer）", () => {
  it("total <= threshold 时返回全量窗口且无 spacer", () => {
    const threshold = SFTP_VIRTUAL_THRESHOLD;
    expect(win(9999, 600, threshold, 8, threshold)).toEqual({
      start: 0,
      end: threshold,
      padTop: 0,
      padBottom: 0,
    });
    expect(win(0, 0, threshold, 8, threshold).end).toBe(threshold);
  });

  it("total = threshold + 1 才进入窗口化", () => {
    const total = SFTP_VIRTUAL_THRESHOLD + 1;
    const result = win(0, 600, total, 8, SFTP_VIRTUAL_THRESHOLD);
    expect(result.end).toBeLessThan(total);
    expect(result.padBottom).toBeGreaterThan(0);
  });

  it("阈值让首绘（viewportHeight 未知）不退化成空白列表", () => {
    expect(win(0, 0, 50, 8, SFTP_VIRTUAL_THRESHOLD).end).toBe(50);
  });
});

describe("computeWindow — 窗口与 spacer 几何", () => {
  it("首窗口：从 0 起，overscan 不产生负 padTop", () => {
    const result = win(0, 600, 1000);
    expect(result.start).toBe(0);
    expect(result.padTop).toBe(0);
    expect(result.end).toBe(Math.ceil(600 / ROW) + 2 * FILE_ROW_OVERSCAN);
  });

  it("中间窗口：上下各留 overscan，pad 与窗口行数守恒", () => {
    const total = 1000;
    for (const scrollTop of [0, 1, 29, 30, 300, 3000, 15000, 29999]) {
      const result = win(scrollTop, 600, total);
      expect(result.start).toBeGreaterThanOrEqual(0);
      expect(result.end).toBeLessThanOrEqual(total);
      expect(result.start).toBeLessThan(result.end);
      // 恒等式：spacer + 已渲染行 + spacer === 全量列表总高。
      expect(result.padTop + (result.end - result.start) * ROW + result.padBottom).toBe(total * ROW);
    }
  });

  it("滚到末尾：end 钳到 total、padBottom 归零", () => {
    const total = 1000;
    const result = win(total * ROW * 2, 600, total);
    expect(result.end).toBe(total);
    expect(result.padBottom).toBe(0);
  });

  it("列表缩短后残留的大 scrollTop 不会让 start > end / 列表全白", () => {
    // 换目录（上万行 → 三百行）时浏览器收缩滚动内容前的一帧，scrollTop
    // 仍是旧值；旧实现 start 远超 total，slice 为空且 padTop 大于总高。
    const total = 300;
    const result = win(30000, 600, total, 8, SFTP_VIRTUAL_THRESHOLD);
    expect(result.start).toBeGreaterThanOrEqual(0);
    expect(result.start).toBeLessThan(result.end);
    expect(result.end).toBe(total);
    expect(result.padTop + (result.end - result.start) * ROW + result.padBottom).toBe(total * ROW);
  });

  it("overscan 越大窗口越宽，但恒等式始终成立", () => {
    const total = 5000;
    for (const overscan of [0, 1, 8, 40]) {
      const result = win(9000, 600, total, overscan);
      expect(result.padTop + (result.end - result.start) * ROW + result.padBottom).toBe(total * ROW);
    }
    expect(win(9000, 600, total, 0).end - win(9000, 600, total, 0).start).toBeLessThan(
      win(9000, 600, total, 40).end - win(9000, 600, total, 40).start,
    );
  });

  it("使用真实行高常量时窗口覆盖整个视口", () => {
    const result = computeWindow({
      scrollTop: 3000,
      viewportHeight: 600,
      rowHeight: FILE_ROW_HEIGHT_PX,
      total: 5000,
      overscan: FILE_ROW_OVERSCAN,
      threshold: SFTP_VIRTUAL_THRESHOLD,
    });
    expect(result.start * FILE_ROW_HEIGHT_PX).toBeLessThanOrEqual(3000);
    expect(result.end * FILE_ROW_HEIGHT_PX).toBeGreaterThanOrEqual(3000 + 600);
  });
});

describe("scrollTopForRow — 程序化选中滚动", () => {
  const base = { viewportHeight: 300, rowHeight: ROW, headerHeight: 28 };

  it("行已在视口内时返回 null（不做无谓滚动）", () => {
    expect(scrollTopForRow(5, { ...base, scrollTop: 0 })).toBeNull();
    expect(scrollTopForRow(5, { ...base, scrollTop: 150 })).toBeNull();
  });

  it("行在上方 → 顶对齐；在下方 → 底对齐", () => {
    expect(scrollTopForRow(2, { ...base, scrollTop: 600 })).toBe(60);
    expect(scrollTopForRow(50, { ...base, scrollTop: 0 })).toBe(50 * ROW + ROW - (300 - 28));
  });

  it("表头高度计入可用视口，不把行藏在 sticky header 后面", () => {
    const withHeader = scrollTopForRow(50, { ...base, scrollTop: 0 });
    const withoutHeader = scrollTopForRow(50, { ...base, headerHeight: 0, scrollTop: 0 });
    expect(withHeader).toBeGreaterThan(withoutHeader!);
  });

  it("负下标 / 不可见视口返回 null", () => {
    expect(scrollTopForRow(-1, { ...base, scrollTop: 0 })).toBeNull();
    expect(scrollTopForRow(5, { ...base, viewportHeight: 0, scrollTop: 0 })).toBeNull();
  });
});

/**
 * 2000 行真实滚动序列回归夹具（计算层）。
 *
 * vitest 的 environment 是 `node`（无 DOM / 无 ResizeObserver），无法挂载
 * App.vue 去数真实 DOM 节点，所以夹具落在「渲染层唯一依赖的纯计算」上：
 * 模拟用户滚轮产生的连续 scrollTop 序列，断言每一行窗口都满足 DOM 行数
 * 有界、spacer 总高守恒、当前滚动位置命中的逻辑行不空白、行切片与全量
 * 数据一一对应。模板里 `windowedEntries` 的窗口化由 workbench 结构守卫覆盖。
 */
describe("2000 行滚动序列回归夹具（计算层）", () => {
  const TOTAL = 2000;
  const VIEWPORT = 600;
  const OVERSCAN = FILE_ROW_OVERSCAN;
  const THRESHOLD = SFTP_VIRTUAL_THRESHOLD;
  const VISIBLE_COUNT = Math.ceil(VIEWPORT / ROW) + 2 * OVERSCAN;
  const entries = Array.from({ length: TOTAL }, (_, i) => ({
    name: `file-${i.toString().padStart(4, "0")}.log`,
  }));
  const maxScrollTop = TOTAL * ROW - VIEWPORT;

  /** Mirrors App.vue: windowedEntries = visibleEntries.slice(start, end). */
  function render(scrollTop: number) {
    const w = computeWindow({
      scrollTop,
      viewportHeight: VIEWPORT,
      rowHeight: ROW,
      total: TOTAL,
      overscan: OVERSCAN,
      threshold: THRESHOLD,
    });
    return { ...w, rows: entries.slice(w.start, w.end) };
  }

  const nameAt = (index: number) => `file-${index.toString().padStart(4, "0")}.log`;

  it("大目录启用窗口化：DOM 行数远小于 2000 且首行正确", () => {
    const { start, end, rows, padTop, padBottom } = render(0);
    expect(start).toBe(0);
    expect(end).toBe(VISIBLE_COUNT);
    expect(rows.length).toBe(VISIBLE_COUNT);
    expect(rows.length).toBeLessThan(50);
    expect(rows[0].name).toBe("file-0000.log");
    expect(padTop).toBe(0);
    expect(padBottom).toBe((TOTAL - end) * ROW);
  });

  it("从顶滚到底（非整行步长 37px）：恒等式 / 有界 / 不空白 / start 单调不减", () => {
    let previousStart = -1;
    let peakRows = 0;
    for (let scrollTop = 0; scrollTop <= maxScrollTop + ROW; scrollTop += 37) {
      const w = render(scrollTop);
      expect(w.start).toBeGreaterThanOrEqual(0);
      expect(w.start).toBeLessThan(w.end);
      expect(w.end).toBeLessThanOrEqual(TOTAL);
      expect(w.end - w.start).toBeLessThanOrEqual(VISIBLE_COUNT);
      expect(w.rows.length).toBe(w.end - w.start);
      // 恒等式：上 spacer + 已渲染行 + 下 spacer === 全量列表总高。
      expect(w.padTop + w.rows.length * ROW + w.padBottom).toBe(TOTAL * ROW);
      expect(w.padTop).toBe(w.start * ROW);
      expect(w.padBottom).toBe((TOTAL - w.end) * ROW);
      // 行切片必须与全量数据一一对应（不是重复行 / 错位行）。
      expect(w.rows[0].name).toBe(nameAt(w.start));
      expect(w.rows[w.rows.length - 1].name).toBe(nameAt(w.end - 1));
      // 当前滚动位置命中的逻辑行必须落在窗口内，否则用户看到空白。
      const target = Math.min(TOTAL - 1, Math.floor(scrollTop / ROW));
      expect(target).toBeGreaterThanOrEqual(w.start);
      expect(target).toBeLessThan(w.end);
      expect(w.start).toBeGreaterThanOrEqual(previousStart);
      previousStart = w.start;
      peakRows = Math.max(peakRows, w.rows.length);
    }
    expect(peakRows).toBeLessThan(50);
  });

  it("从底滚回顶（步长 131px）：start 单调不增，仍守恒且不空白", () => {
    let previousStart = Number.POSITIVE_INFINITY;
    for (let scrollTop = maxScrollTop + 500; scrollTop >= 0; scrollTop -= 131) {
      const w = render(scrollTop);
      expect(w.start).toBeLessThanOrEqual(previousStart);
      expect(w.start).toBeLessThan(w.end);
      expect(w.padTop + w.rows.length * ROW + w.padBottom).toBe(TOTAL * ROW);
      const target = Math.min(TOTAL - 1, Math.floor(scrollTop / ROW));
      expect(target).toBeGreaterThanOrEqual(w.start);
      expect(target).toBeLessThan(w.end);
      previousStart = w.start;
    }
  });

  it("scrollTopForRow 对全部 2000 行都能把该行带进窗口", () => {
    for (let index = 0; index < TOTAL; index += 1) {
      const target = scrollTopForRow(index, {
        scrollTop: 0,
        viewportHeight: VIEWPORT,
        rowHeight: ROW,
        headerHeight: 28,
      });
      const w = render(target ?? 0);
      expect(index).toBeGreaterThanOrEqual(w.start);
      expect(index).toBeLessThan(w.end);
    }
  });

  it("极值：视口为 0 / scrollTop 远超总高 / 小目录阈值", () => {
    expect(
      computeWindow({
        scrollTop: 0, viewportHeight: 0, rowHeight: ROW,
        total: TOTAL, overscan: OVERSCAN, threshold: THRESHOLD,
      }),
    ).toEqual({ start: 0, end: 0, padTop: 0, padBottom: 0 });

    const clamped = render(TOTAL * ROW * 10);
    expect(clamped.end).toBe(TOTAL);
    expect(clamped.padBottom).toBe(0);
    expect(clamped.rows.length).toBeGreaterThan(0);
    expect(clamped.rows[clamped.rows.length - 1].name).toBe(nameAt(TOTAL - 1));

    const small = computeWindow({
      scrollTop: 99_999, viewportHeight: VIEWPORT, rowHeight: ROW,
      total: THRESHOLD, overscan: OVERSCAN, threshold: THRESHOLD,
    });
    expect(small).toEqual({ start: 0, end: THRESHOLD, padTop: 0, padBottom: 0 });
  });
});
