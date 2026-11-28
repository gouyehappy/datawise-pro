import { describe, expect, it } from "vitest";
import {
  ARBITER_PRIORITIES,
  buildTerminalOverlayClaims,
  resolveKeyOwners,
  resolveTerminalOverlayOwners,
  type ArbiterClaim,
  type ClaimKey,
  type OverlayId,
  type TerminalOverlayState,
} from "./overlayArbiter";

// 快照与场景守卫：优先级表是从 2026-11 `handleTerminalKey` 的真实顺序链
// 逐字推导的（与 dbx 表不同：dw 的 historyPanel 在 completion 之前）。
// 改表必须同步本 spec——迁移前的 7 层 Esc 链 / 5 个 ↓ 门在此钉死。

const ALL_CLOSED: TerminalOverlayState = {
  acceptKeyHintMenuOpen: false,
  commandPaletteOpen: false,
  searchOpen: false,
  quickPaletteOpen: false,
  historyPanelOpen: false,
  completionOpen: false,
  commandSuggestOpen: false,
  ghostVisible: false,
  ghostTabAcceptEnabled: true,
  argumentHintVisible: false,
};

function state(patch: Partial<TerminalOverlayState> = {}): TerminalOverlayState {
  return { ...ALL_CLOSED, ...patch };
}

function claim(overlay: OverlayId, key: ClaimKey, visible = true): ArbiterClaim {
  return { overlay, key, priority: ARBITER_PRIORITIES[key][overlay] ?? 0, visible };
}

describe("overlayArbiter priority table snapshot", () => {
  it("pins the table derived from the dw 2026-11 key routing chain", () => {
    expect(ARBITER_PRIORITIES).toEqual({
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
    });
  });
});

describe("resolveTerminalOverlayOwners: migrated Esc chain", () => {
  it("all seven overlays open: the first guard in the old chain owns Esc", () => {
    const owners = resolveTerminalOverlayOwners(state({
      acceptKeyHintMenuOpen: true,
      commandPaletteOpen: true,
      searchOpen: true,
      quickPaletteOpen: true,
      historyPanelOpen: true,
      completionOpen: true,
      commandSuggestOpen: true,
    }));
    expect(owners.escape).toBe("acceptKeyHintMenu");
  });

  it("peeling the chain from the top yields exactly the old guard order", () => {
    const order: OverlayId[] = [
      "acceptKeyHintMenu",
      "commandPalette",
      "search",
      "quickPalette",
      "historyPanel",
      "completion",
      "commandSuggest",
    ];
    const flags: Record<OverlayId, keyof TerminalOverlayState> = {
      acceptKeyHintMenu: "acceptKeyHintMenuOpen",
      commandPalette: "commandPaletteOpen",
      search: "searchOpen",
      quickPalette: "quickPaletteOpen",
      historyPanel: "historyPanelOpen",
      completion: "completionOpen",
      commandSuggest: "commandSuggestOpen",
      ghost: "ghostVisible",
      argumentHint: "argumentHintVisible",
    };
    for (let i = 0; i < order.length; i += 1) {
      const patch: Partial<TerminalOverlayState> = {};
      for (const overlay of order.slice(i)) patch[flags[overlay]] = true;
      expect(resolveTerminalOverlayOwners(state(patch)).escape, `chain step ${i}`).toBe(order[i]);
    }
  });

  it("everything closed: Esc belongs to the remote shell (no overlay to close)", () => {
    expect(resolveTerminalOverlayOwners(state()).escape).toBeNull();
  });
});

describe("resolveTerminalOverlayOwners: migrated bare ArrowDown gates", () => {
  it("any of the four nav overlays open blocks the completion raise", () => {
    for (const flag of [
      "completionOpen",
      "commandSuggestOpen",
      "historyPanelOpen",
      "quickPaletteOpen",
    ] as const) {
      expect(
        resolveTerminalOverlayOwners(state({ [flag]: true })).arrowDown,
        `${flag} must claim arrowDown`,
      ).not.toBeNull();
    }
  });

  it("all closed: arrowDown has no owner, so the completion raise is allowed", () => {
    const owners = resolveTerminalOverlayOwners(state());
    expect(owners.arrowDown).toBeNull();
  });

  it("completion outranks commandSuggest on shared nav keys (old branch order)", () => {
    const owners = resolveTerminalOverlayOwners(state({ completionOpen: true, commandSuggestOpen: true }));
    expect(owners.arrowUp).toBe("completion");
    expect(owners.arrowDown).toBe("completion");
    expect(owners.enter).toBe("completion");
    expect(owners.tab).toBe("completion");
  });

  it("issue #150 analogue: with no claim, every key belongs to the remote readline", () => {
    // 交互提示待答时 App.vue 不组装唤起 claim；仲裁器见不到持有者，↑/↓/Enter
    // 归远端（堡垒机选目标 / OTP 输入），不会被本地浮层吞掉。
    expect(resolveTerminalOverlayOwners(state())).toEqual({
      arrowUp: null,
      arrowDown: null,
      enter: null,
      tab: null,
      accept: null,
      escape: null,
      anchor: null,
    });
  });
});

describe("resolveTerminalOverlayOwners: ghost yield rules", () => {
  it("→ (accept) is ghost's sole dimension and coexists with the completion menu", () => {
    const owners = resolveTerminalOverlayOwners(state({ ghostVisible: true, completionOpen: true }));
    expect(owners.accept).toBe("ghost");
    expect(owners.arrowUp).toBe("completion");
    expect(owners.escape).toBe("completion");
  });

  it("Tab accept yields to the completion menu via claim visibility, not priority", () => {
    // ghost.tab 的数值(500) 高于 completion.tab(400)，靠 visible=false 让位。
    expect(
      resolveTerminalOverlayOwners(state({ ghostVisible: true, completionOpen: true, ghostTabAcceptEnabled: false })).tab,
    ).toBe("completion");
    expect(resolveTerminalOverlayOwners(state({ ghostVisible: true, ghostTabAcceptEnabled: true })).tab).toBe("ghost");
  });

  it("ghost alone owns tab + accept but never escape", () => {
    const owners = resolveTerminalOverlayOwners(state({ ghostVisible: true }));
    expect(owners.tab).toBe("ghost");
    expect(owners.accept).toBe("ghost");
    expect(owners.escape).toBeNull();
  });
});

describe("ninth overlay: argument hint bar (beta.42)", () => {
  it("owns Esc only when every real overlay is closed", () => {
    expect(resolveTerminalOverlayOwners(state({ argumentHintVisible: true })).escape).toBe("argumentHint");
    expect(resolveTerminalOverlayOwners(state({ argumentHintVisible: true, historyPanelOpen: true })).escape).toBe("historyPanel");
    expect(resolveTerminalOverlayOwners(state({ argumentHintVisible: true, commandSuggestOpen: true })).escape).toBe("commandSuggest");
  });

  it("claims no navigation / accept dimension, so the bare ArrowDown gate is unchanged", () => {
    const owners = resolveTerminalOverlayOwners(state({ argumentHintVisible: true }));
    expect(owners.arrowUp).toBeNull();
    expect(owners.arrowDown).toBeNull();
    expect(owners.enter).toBeNull();
    expect(owners.tab).toBeNull();
    expect(owners.accept).toBeNull();
    expect(owners.anchor).toBeNull();
  });

  it("costs exactly one priority-table row, with no new guard anywhere", () => {
    const rows = Object.entries(ARBITER_PRIORITIES).filter(([, row]) => "argumentHint" in row);
    expect(rows.map(([key]) => key)).toEqual(["escape"]);
    expect(ARBITER_PRIORITIES.escape.argumentHint).toBe(50);
  });
});

describe("resolveKeyOwners: extension and determinism", () => {
  it("adding a ninth overlay costs one claim line and wins by priority", () => {
    // 迁移后新增浮层（如 AI 搜索条）的演练：不碰 Esc 链 / ↓ 门，只声明一次。
    const extra: ArbiterClaim = { overlay: "search", key: "escape", priority: 800, visible: true };
    const claims = [
      ...buildTerminalOverlayClaims(state({ acceptKeyHintMenuOpen: true, commandPaletteOpen: true })),
      extra,
    ];
    expect(resolveKeyOwners(claims).escape).toBe("search");
  });

  it("invisible claims never take ownership even at the highest priority", () => {
    const invisible: ArbiterClaim = { overlay: "search", key: "escape", priority: 9999, visible: false };
    expect(resolveKeyOwners([claim("completion", "escape"), invisible]).escape).toBe("completion");
  });

  it("ties resolve to the first declared claim (deterministic; a table smell)", () => {
    const tied: ArbiterClaim[] = [
      { overlay: "commandSuggest", key: "enter", priority: 400, visible: true },
      { overlay: "completion", key: "enter", priority: 400, visible: true },
    ];
    expect(resolveKeyOwners(tied).enter).toBe("commandSuggest");
  });

  it("no claims at all: every dimension is null", () => {
    expect(resolveKeyOwners([])).toEqual({
      arrowUp: null,
      arrowDown: null,
      enter: null,
      tab: null,
      accept: null,
      escape: null,
      anchor: null,
    });
  });
});
