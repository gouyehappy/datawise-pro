// SFTP 文件列表窗口化（虚拟滚动）的纯计算层。
//
// 背景：.file-rows 原先对 visibleEntries 全量 v-for，一个上万条目的目录会
// 生成上万行 DOM + 图标组件，换目录/搜索/排序时主线程长时间停顿、滚动掉帧。
// 参考 dbx-plugin-ssh 的 computeWindow：渲染层只挂可见窗口的行，上下用等高
// spacer 撑起总高，滚动条比例保持真实；选中、范围选择、右键等逻辑层始终
// 作用于全量 visibleEntries，与窗口无关。
//
// 与参考实现的差异：小目录（total <= threshold）直接返回「全量窗口 / 零 spacer」，
// 保证常见目录的 DOM 结构、sticky 表头几何与既有行为完全不变，只在真正会卡
// 的大目录启用窗口化。阈值也让 ResizeObserver 尚未上报视口高度时（首绘
// viewportHeight=0）不会退化成空白列表。

/** 与 style.css 的 `.file-row { height: 30px }` 保持一致；改动 CSS 时同步这里。 */
export const FILE_ROW_HEIGHT_PX = 30;
/** 窗口上下各多渲染的行数，滚动时减少白边。 */
export const FILE_ROW_OVERSCAN = 8;
/** 低于该条目数不启用窗口化：小目录保持零 spacer 的原始几何。 */
export const SFTP_VIRTUAL_THRESHOLD = 200;

export interface VirtualWindow {
  /** 窗口首行下标（含）。 */
  start: number;
  /** 窗口末行下标（不含）。 */
  end: number;
  /** 窗口上方 spacer 高度（px）。 */
  padTop: number;
  /** 窗口下方 spacer 高度（px）。 */
  padBottom: number;
}

export interface VirtualWindowInput {
  scrollTop: number;
  /** 滚动视口高度（px）；<=0 时若已启用窗口化则渲染空窗口。 */
  viewportHeight: number;
  /** 单行总高（px，含分隔线）；非正数按 1 处理防除零。 */
  rowHeight: number;
  total: number;
  /** 窗口上下各多渲染的行数，滚动时减少白边。 */
  overscan?: number;
  /** 条目数不超过该值时返回全量窗口（零 spacer）。0/undefined 表示总是窗口化。 */
  threshold?: number;
}

const EMPTY_WINDOW: VirtualWindow = { start: 0, end: 0, padTop: 0, padBottom: 0 };

export function computeWindow(input: VirtualWindowInput): VirtualWindow {
  const total = Math.max(0, Math.floor(input.total));
  if (total === 0) return { ...EMPTY_WINDOW };

  const threshold = Math.max(0, Math.floor(input.threshold ?? 0));
  if (total <= threshold) {
    // 小目录：不做任何裁切，也不产生 spacer；sticky 表头与空态的文档流
    // 与窗口化前逐字节一致。
    return { start: 0, end: total, padTop: 0, padBottom: 0 };
  }
  if (input.viewportHeight <= 0) return { ...EMPTY_WINDOW };

  const rowHeight = Math.max(1, Math.floor(input.rowHeight));
  const overscan = Math.max(0, Math.floor(input.overscan ?? 0));
  const scrollTop = Math.max(0, input.scrollTop);
  const visibleCount = Math.ceil(input.viewportHeight / rowHeight) + 2 * overscan;
  // 钳制 start：scrollTop 可能因换目录后列表变短而暂时远超总高（浏览器收
  // 缩滚动内容前的一帧），不钳会让 start > end，slice 出空列表且 padTop
  // 超过内容总高，表现为「列表突然全白」。超末尾时对齐到最后一批行。
  const idealStart = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const start = Math.min(idealStart, Math.max(0, total - visibleCount));
  const end = Math.min(total, start + visibleCount);
  return {
    start,
    end,
    padTop: start * rowHeight,
    padBottom: (total - end) * rowHeight,
  };
}

/**
 * 把「逻辑选中行」滚动进视口所需的最小 scrollTop。
 * 键盘/程序化选中（如搜索后定位、范围选择的端点）可能落在窗口之外；
 * 返回的 target 可直接赋给容器的 scrollTop，再触发 scroll 事件刷新窗口。
 * 返回 null 表示无需滚动。
 */
export function scrollTopForRow(
  index: number,
  input: { scrollTop: number; viewportHeight: number; rowHeight: number; headerHeight?: number },
): number | null {
  const rowHeight = Math.max(1, Math.floor(input.rowHeight));
  const headerHeight = Math.max(0, input.headerHeight ?? 0);
  const viewportHeight = Math.max(0, input.viewportHeight - headerHeight);
  if (viewportHeight <= 0 || index < 0) return null;
  const rowTop = index * rowHeight;
  const rowBottom = rowTop + rowHeight;
  const current = Math.max(0, input.scrollTop);
  if (rowTop >= current && rowBottom <= current + viewportHeight) return null;
  // 行在上方 → 顶对齐；在下方 → 底对齐。两者都不做「居中」以避免来回跳。
  return rowTop < current ? rowTop : Math.max(0, rowBottom - viewportHeight);
}
