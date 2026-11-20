// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import { flushPromises, mount } from "@vue/test-utils";
import MonitorPanel from "./MonitorPanel.vue";
import { GROUP_COLOR_PALETTE, groupColorIndex } from "./MonitorCard.vue";
import {
  MONITOR_GROUPS_KEY,
  MONITOR_PRIVACY_KEY,
  MONITOR_WATCHED_KEY,
  type MonitorHistoryEntry,
  type MonitorSample,
  type MonitorSnapshot,
} from "../composables/useMonitorPanel";
import { uiStorage } from "../lib/uiStorage";

// 监控面板组件单测：假 api（stub window.datawisePlugin）+ uiStorage（happy-dom
// 下走 localStorage）。编排逻辑本身已在 useMonitorPanel.spec.ts 覆盖。

type Row = Record<string, unknown>;

function connectionRow(id: string, extra: Row = {}): Row {
  return { id, name: id.toUpperCase(), dbType: "ssh", connected: true, isConnected: true, providerId: "io.datawise.community.ssh.connection", connectionType: "ssh", ...extra };
}

function sample(cpuPct: number): MonitorSample {
  return { t: 1, cpuPct, memTotalMb: 2048, memUsedMb: 1024, netRxKbps: 12.5, netTxKbps: 3.5, iface: "eth0" };
}

function snapshot(state: MonitorSnapshot["state"], history: MonitorHistoryEntry[], details: MonitorSnapshot["details"] = null): MonitorSnapshot {
  const samples = history.filter((entry): entry is MonitorSample => !("gap" in entry && entry.gap === true));
  return { state, live: state === "live" ? samples[samples.length - 1] ?? null : null, history, details };
}

function fakeApi(options: { rows?: Row[]; samples?: Record<string, MonitorSnapshot> } = {}) {
  const invokeCalls: string[] = [];
  const terminals: Array<{ contributionId: string; context: Row; options: Row }> = [];
  const api = {
    locale: "en",
    invoke: async (method: string, params?: unknown) => {
      invokeCalls.push(`${method}:${JSON.stringify(params ?? {})}`);
      if (method === "monitor/status") {
        return { tasks: Object.keys(options.samples ?? {}).map((connectionId) => ({ connectionId, state: options.samples![connectionId].state, since: 1 })) };
      }
      if (method === "monitor/snapshot") return { samples: options.samples ?? {} };
      if (method === "monitor/start") return { state: "connecting", since: 1 };
      if (method === "monitor/stop") return { state: "stopped" };
      return {};
    },
    request: async (method: string) => {
      if (method === "host.listConnections") return { connections: options.rows ?? [] };
      return null;
    },
    openWorkbench: async (contributionId: string, context: Row, openOptions: Row) => {
      terminals.push({ contributionId, context, options: openOptions });
      return undefined;
    },
    onLocaleChange: () => () => {},
    onEvent: () => () => {},
  };
  return { api, invokeCalls, terminals };
}

async function mountPanel(options: { rows?: Row[]; samples?: Record<string, MonitorSnapshot> } = {}): Promise<{ wrapper: VueWrapper; invokeCalls: string[]; terminals: Array<{ contributionId: string; context: Row; options: Row }> }> {
  const ctx = fakeApi(options);
  vi.stubGlobal("datawisePlugin", ctx.api);
  const wrapper = mount(MonitorPanel, { props: { context: {} } });
  await flushPromises();
  return { wrapper, invokeCalls: ctx.invokeCalls, terminals: ctx.terminals };
}

afterEach(() => {
  uiStorage.removeItem(MONITOR_WATCHED_KEY);
  uiStorage.removeItem(MONITOR_PRIVACY_KEY);
  uiStorage.removeItem(MONITOR_GROUPS_KEY);
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("MonitorPanel", () => {
  it("renders grouped sections from plugin group config and falls back to a flat grid without config", async () => {
    uiStorage.setItem(
      MONITOR_GROUPS_KEY,
      JSON.stringify({
        groups: [
          { id: "g1", name: "Prod", color: GROUP_COLOR_PALETTE[2], connectionIds: ["c1", "c2"] },
          { id: "g2", name: "Staging", color: "", connectionIds: ["c3"] },
        ],
      }),
    );
    const grouped = await mountPanel({
      rows: [connectionRow("c1"), connectionRow("c2"), connectionRow("c3")],
      samples: { c1: snapshot("live", [sample(10)]), c2: snapshot("live", [sample(20)]), c3: snapshot("live", [sample(30)]) },
    });
    const headers = grouped.wrapper.findAll("[data-group-id]");
    expect(headers.map((header) => header.attributes("data-group-id"))).toEqual(["g1", "g2"]);
    expect(headers[0].text()).toContain("Prod");
    expect(headers[1].text()).toContain("Staging");
    expect(headers[0].text()).toContain("2");
    expect(headers[1].text()).toContain("1");
    expect(headers[0].find(".monitor-group-accent").attributes("style")).toContain(GROUP_COLOR_PALETTE[2]);
    expect(headers[1].find(".monitor-group-accent").attributes("style")).toContain(GROUP_COLOR_PALETTE[groupColorIndex("g2")]);
    const tabs = grouped.wrapper.findAll(".monitor-tab");
    expect(tabs.map((tab) => tab.text())).toEqual(["All", "Prod", "Staging", "Manage groups"]);
    expect(grouped.wrapper.findAll("article")).toHaveLength(3);
    grouped.wrapper.unmount();

    uiStorage.removeItem(MONITOR_GROUPS_KEY);
    const flat = await mountPanel({
      rows: [connectionRow("c1"), connectionRow("c2"), connectionRow("c3")],
      samples: { c1: snapshot("live", [sample(10)]), c2: snapshot("live", [sample(20)]), c3: snapshot("live", [sample(30)]) },
    });
    expect(flat.wrapper.findAll("article")).toHaveLength(3);
    expect(flat.wrapper.find("[data-group-id]").exists()).toBe(false);
    expect(flat.wrapper.findAll(".monitor-tab").map((tab) => tab.text())).toEqual(["All", "Manage groups"]);
    flat.wrapper.unmount();
  });

  it("masks server names with per-group ordinals under privacy mode", async () => {
    const rows = [
      connectionRow("c1", { groupId: "g1", groupName: "Prod" }),
      connectionRow("c2", { groupId: "g1", groupName: "Prod" }),
    ];
    const samples = { c1: snapshot("live", [sample(10)]), c2: snapshot("live", [sample(20)]) };
    const plain = await mountPanel({ rows, samples });
    expect(plain.wrapper.findAll(".monitor-card-name").map((node) => node.text())).toEqual(["C1", "C2"]);
    plain.wrapper.unmount();

    uiStorage.setItem(MONITOR_PRIVACY_KEY, "1");
    const masked = await mountPanel({ rows, samples });
    expect(masked.wrapper.findAll(".monitor-card-name").map((node) => node.text())).toEqual(["#1", "#2"]);
    await masked.wrapper.find("[data-testid='monitor-privacy-toggle']").trigger("click");
    await flushPromises();
    expect(uiStorage.getItem(MONITOR_PRIVACY_KEY)).toBe("0");
    masked.wrapper.unmount();
  });

  it("renders the five-state badge, dims failed cards and only shows Retry there", async () => {
    const mounted = await mountPanel({
      rows: [connectionRow("c1"), connectionRow("c2"), connectionRow("c3"), connectionRow("c4"), connectionRow("c5")],
      samples: {
        c1: snapshot("live", [sample(10)]),
        c2: snapshot("failed", [sample(10)]),
        c3: snapshot("unsupported", []),
        c4: snapshot("connecting", []),
        c5: snapshot("stopped", []),
      },
    });
    const badges = mounted.wrapper.findAll(".monitor-badge");
    expect(badges.map((badge) => `${badge.attributes("data-state")}:${badge.text()}`)).toEqual([
      "live:Live",
      "failed:Failed",
      "unsupported:Not supported",
      "connecting:Connecting",
      "stopped:Stopped",
    ]);
    const article = (id: string) => mounted.wrapper.find(`article[data-connection-id='${id}']`);
    expect(article("c2").classes()).toContain("monitor-card--dimmed");
    expect(article("c2").findAll("button").some((button) => button.text() === "Retry")).toBe(true);
    for (const id of ["c1", "c3", "c4", "c5"]) {
      expect(article(id).findAll("button").some((button) => button.text() === "Retry")).toBe(false);
    }
    expect(article("c3").find(".monitor-placeholder").text()).toContain("Not supported");
    expect(article("c1").find("button[aria-label='Open terminal']").exists()).toBe(true);
    await article("c1").find("button[aria-label='Open terminal']").trigger("click");
    await flushPromises();
    expect(mounted.terminals).toEqual([
      {
        contributionId: "io.datawise.community.ssh.workbench",
        context: { connectionId: "c1", providerId: "io.datawise.community.ssh.connection", connectionType: "ssh", connection: { id: "c1", name: "C1", readOnly: false } },
        options: { forceNew: true, target: "tab" },
      },
    ]);
    mounted.wrapper.unmount();
  });

  it("splits sparklines into segments at gap markers and renders none for all-gap history", async () => {
    const history: MonitorHistoryEntry[] = [sample(1), { t: 2, gap: true }, sample(3)];
    const mounted = await mountPanel({
      rows: [connectionRow("c1"), connectionRow("c2")],
      samples: {
        c1: snapshot("live", history),
        c2: snapshot("connecting", [{ t: 1, gap: true }, { t: 2, gap: true }]),
      },
    });
    const cpu = mounted.wrapper.find("article[data-connection-id='c1'] svg[data-metric='cpu']");
    expect(cpu.findAll("polyline")).toHaveLength(2);
    const allGap = mounted.wrapper.find("article[data-connection-id='c2'] svg[data-metric='cpu']");
    expect(allGap.findAll("polyline")).toHaveLength(0);
    mounted.wrapper.unmount();
  });

  it("mirrors the dock tree: host groupId rows render as tree tabs/sections and member chips group by tree", async () => {
    uiStorage.setItem(
      MONITOR_GROUPS_KEY,
      JSON.stringify({ groups: [{ id: "g-mon", name: "My monitor", color: "", connectionIds: [] }] }),
    );
    const mounted = await mountPanel({
      rows: [
        connectionRow("c1", { groupId: "h1", groupName: "Prod" }),
        connectionRow("c2", { groupId: "h1", groupName: "Prod" }),
        connectionRow("c3", { groupId: "h2", groupName: "Staging" }),
      ],
      samples: { c1: snapshot("live", [sample(10)]), c2: snapshot("live", [sample(20)]), c3: snapshot("live", [sample(30)]) },
    });
    const tabs = mounted.wrapper.findAll(".monitor-tab").map((tab) => tab.text());
    expect(tabs).toEqual(["All", "Prod", "Staging", "My monitor", "Manage groups"]);
    const headers = mounted.wrapper.findAll("[data-group-id]");
    expect(headers.map((header) => header.attributes("data-group-id"))).toEqual(["h1", "h2"]);
    expect(headers[0].text()).toContain("Prod");
    expect(headers[0].text()).toContain("2");
    await mounted.wrapper.findAll(".monitor-tab").filter((tab) => tab.text() === "Staging")[0].trigger("click");
    const stagingHeaders = mounted.wrapper.findAll("[data-group-id]");
    expect(stagingHeaders.map((header) => header.attributes("data-group-id"))).toEqual(["h2"]);
    mounted.wrapper.unmount();
  });

  it("wires the watch toggle to monitor/start and monitor/stop with the watched key persisted", async () => {
    const mounted = await mountPanel({ rows: [connectionRow("c1")] });
    const add = mounted.wrapper.find("article[data-connection-id='c1'] button[aria-label='Add to monitor']");
    expect(add).toBeTruthy();
    await add!.trigger("click");
    await flushPromises();
    expect(mounted.invokeCalls).toContain('monitor/start:{"connectionId":"c1"}');
    const raw = JSON.parse(uiStorage.getItem(MONITOR_WATCHED_KEY) as string) as { watched: Record<string, { addedAt: number }> };
    expect(Object.keys(raw.watched)).toEqual(["c1"]);

    const stop = mounted.wrapper.find("article[data-connection-id='c1'] button[aria-label='Remove from monitor']");
    expect(stop).toBeTruthy();
    await stop!.trigger("click");
    await flushPromises();
    expect(mounted.invokeCalls).toContain('monitor/stop:{"connectionId":"c1"}');
    const rawAfter = JSON.parse(uiStorage.getItem(MONITOR_WATCHED_KEY) as string) as { watched: Record<string, unknown> };
    expect(rawAfter.watched).toEqual({});
    mounted.wrapper.unmount();
  });
});
