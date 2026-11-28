/**
 * 终端浮层键权仲裁器（P0 前置债务，参照 dbx-plugin-ssh
 * `docs/IMPL_PLAN_OVERLAY_KEY_ARBITER.zh-CN.md` 的「收口消费」范式）。
 *
 * 迁移前 dw 的 `handleTerminalKey` 有两类手工互斥矩阵：
 *  - Esc 分支是 7 层手写 `if (xxxOpen.value) { close(); return consume(); }` 链；
 *  - 裸 ↓ 唤起补全是 5 个手写 `!xxxOpen.value` 门。
 * 这正是 dbx #150/#152 整个返工周期证明「超过手工维护能力」的形态：新增第
 * N 个浮层要改 N 处门 + N² 个组合测试。
 *
 * 本模块把矩阵显式化为**一张优先级表 + 一个决策函数**：
 *  - 判定逻辑零迁移：各浮层「是否可见/开门」仍由 App.vue 既有判定给出，
 *    这里只接收已判定的布尔（dbx 所谓「表是数据不是逻辑」）；
 *  - `buildTerminalOverlayClaims` 把状态快照摊平成 claims，
 *    `resolveKeyOwners` 对每个键维度选出唯一持有者；
 *  - 新增第 9 个浮层 = 在 `ARBITER_PRIORITIES` 加一行 + state 加一个布尔，
 *    不再需要改 Esc 链或 ↓ 门。
 *
 * 优先级数值从 2026-11 `handleTerminalKey` 的**真实链序**逐字推导（与 dbx
 * 的表不同：dw 的链是 historyPanel 在 completion 之前），由 spec 快照钉死。
 * 改表先改 spec。
 */

export type OverlayId =
  | "acceptKeyHintMenu"
  | "commandPalette"
  | "search"
  | "quickPalette"
  | "historyPanel"
  | "completion"
  | "commandSuggest"
  | "argumentHint"
  | "ghost";

/**
 * 仲裁的键维度。enter / tab / accept(→ 族) 拆三维不是过度设计——三者让位
 * 规则不同：ghost 的 → 接受不受补全菜单影响（同屏共存），但 Tab 接受在
 * 菜单开着时必须让位（编码在 `ghostTabAcceptEnabled` 可见性里）。
 * 物理键到维度的映射（Ctrl+F / Ctrl+E / 带修饰的 →）留在 handleTerminalKey，
 * 那是「哪个物理键映射到哪个维度」，不是「这个维度归谁」。
 */
export type ClaimKey =
  | "arrowUp"
  | "arrowDown"
  | "enter"
  | "tab"
  | "accept"
  | "escape"
  | "anchor";

export interface ArbiterClaim {
  overlay: OverlayId;
  key: ClaimKey;
  /** 数值越大优先级越高；同键维度取最大者获胜。 */
  priority: number;
  /** 沿用各浮层既有判定（open 布尔）——判定不迁移。 */
  visible: boolean;
}

export type KeyOwners = Record<ClaimKey, OverlayId | null>;

export const CLAIM_KEYS: readonly ClaimKey[] = [
  "arrowUp",
  "arrowDown",
  "enter",
  "tab",
  "accept",
  "escape",
  "anchor",
];

/**
 * 优先级表（快照 spec 钉死）。推导规则：
 * - `escape` = 迁移前 Esc 分支的 7 层 if 顺序（先判者大）：
 *   acceptKeyHintMenu → commandPalette → search → quickPalette →
 *   historyPanel → completion → commandSuggest；
 * - `arrowUp`/`arrowDown`/`enter` = 迁移前 `completionOpen` / `commandSuggestOpen`
 *   分支的先后（completion 在前），历史面板与快速面板由各自 @keydown 消费，
 *   在表中登记以保证「谁持有键」可查；
 * - `tab` 额外登记 ghost(500)：其 claim 可见性由 `ghostTabAcceptEnabled`
 *   控制（补全菜单开着时置 false，让位给 completion）；
 * - `accept`(→ 族) 只有 ghost 一个 claimant，与菜单同屏共存不让位；
 * - `argumentHint` 是只读提示条（beta.42）：只登记 escape 一个维度，优先级
 *   最低（50），任何真浮层开着都优先关闭真浮层；不参与导航 / 接受键，
 *   因此裸 ↓ 门与其它 claim 完全不受影响；
 * - `anchor` 预留维度：dw 目前无引导条锚点浮层，留空以便新增时一行接入。
 */
export const ARBITER_PRIORITIES: Readonly<Record<ClaimKey, Partial<Record<OverlayId, number>>>> = {
  arrowUp: { completion: 400, commandSuggest: 300, historyPanel: 200, quickPalette: 100 },
  arrowDown: { completion: 400, commandSuggest: 300, historyPanel: 200, quickPalette: 100 },
  enter: { completion: 400, commandSuggest: 300, historyPanel: 200, quickPalette: 100 },
  tab: { ghost: 500, completion: 400, commandSuggest: 300, historyPanel: 200 },
  accept: { ghost: 500 },
  escape: {
    acceptKeyHintMenu: 700,
    commandPalette: 600,
    search: 500,
    quickPalette: 400,
    historyPanel: 300,
    completion: 200,
    commandSuggest: 100,
    argumentHint: 50,
  },
  anchor: {},
};

/** 对每个键维度选出可见 claim 中优先级最高者；同分取先声明者（同分是表
 *  配置错误的味道，spec 有守卫）。全不可见 = 无人持有（null），按键归远端 shell。 */
export function resolveKeyOwners(claims: readonly ArbiterClaim[]): KeyOwners {
  const owners = {} as KeyOwners;
  for (const key of CLAIM_KEYS) {
    let best: ArbiterClaim | undefined;
    for (const claim of claims) {
      if (claim.key !== key || !claim.visible) continue;
      if (!best || claim.priority > best.priority) best = claim;
    }
    owners[key] = best?.overlay ?? null;
  }
  return owners;
}

/** App.vue 传入的状态快照：全部是**已判定**的布尔，本函数不做任何门判定。 */
export interface TerminalOverlayState {
  acceptKeyHintMenuOpen: boolean;
  commandPaletteOpen: boolean;
  searchOpen: boolean;
  quickPaletteOpen: boolean;
  historyPanelOpen: boolean;
  completionOpen: boolean;
  commandSuggestOpen: boolean;
  ghostVisible: boolean;
  /** 参数即时提示条是否可见（只读、不抢导航键；仅 Esc 可关闭）。 */
  argumentHintVisible: boolean;
  /** 「Tab 接受建议」是否生效：补全菜单开着时必须置 false（让位编码在可见性）。 */
  ghostTabAcceptEnabled: boolean;
}

/** 把状态快照摊平成 claims。新增浮层只需在 `ARBITER_PRIORITIES` 加一行，
 *  并在这里的 `visible` 映射补一个布尔——Esc 链 / ↓ 门无需任何改动。 */
export function buildTerminalOverlayClaims(state: TerminalOverlayState): ArbiterClaim[] {
  const visible: Record<OverlayId, boolean> = {
    acceptKeyHintMenu: state.acceptKeyHintMenuOpen,
    commandPalette: state.commandPaletteOpen,
    search: state.searchOpen,
    quickPalette: state.quickPaletteOpen,
    historyPanel: state.historyPanelOpen,
    completion: state.completionOpen,
    commandSuggest: state.commandSuggestOpen,
    argumentHint: state.argumentHintVisible,
    ghost: state.ghostVisible,
  };
  const claims: ArbiterClaim[] = [];
  for (const key of CLAIM_KEYS) {
    const row = ARBITER_PRIORITIES[key];
    for (const overlay of Object.keys(row) as OverlayId[]) {
      if (overlay === "ghost" && key === "tab" && !state.ghostTabAcceptEnabled) continue;
      claims.push({ overlay, key, priority: row[overlay] ?? 0, visible: visible[overlay] });
    }
  }
  return claims;
}

/** 便捷入口：一次拿到全部键维度的持有者。 */
export function resolveTerminalOverlayOwners(state: TerminalOverlayState): KeyOwners {
  return resolveKeyOwners(buildTerminalOverlayClaims(state));
}
