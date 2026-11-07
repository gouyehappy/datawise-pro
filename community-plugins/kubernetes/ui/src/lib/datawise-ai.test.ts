import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import i18n from "@/i18n";

import {
  datawiseAIPage,
  datawiseAIRecommendations,
  openDatawiseAIConversation,
  useDatawiseRecommendations,
} from "./datawise-ai";

describe("datawiseAIPage", () => {
  it("maps overview and namespaced resource routes", () => {
    expect(datawiseAIPage("/dashboard")).toEqual({ route: "/dashboard" });
    expect(datawiseAIPage("/pods/default/demo")).toEqual({
      route: "/pods/default/demo",
      resource: "pods",
      namespace: "default",
      name: "demo",
    });
  });
});

afterEach(cleanup);

describe("host recommendations", () => {
  it("reuses translated resource scenes with safe host placeholders and five-item limit", async () => {
    await i18n.changeLanguage("zh-CN");
    expect(datawiseAIRecommendations(datawiseAIPage("/"))).toHaveLength(5);
    expect(datawiseAIRecommendations(datawiseAIPage("/deployments"))[0].prompt).toContain(
      "rollout",
    );
    expect(
      datawiseAIRecommendations(datawiseAIPage("/pods/ns/demo"))[0].prompt,
    ).toContain("{{resource.name}}");
    expect(datawiseAIPage("/crds/widgets/example")).toEqual({
      route: "/crds/widgets/example",
      resource: "widgets",
      name: "example",
    });
    expect(datawiseAIPage("/crds/widgets.example.com")).toEqual({
      route: "/crds/widgets.example.com",
      resource: "widgets.example.com",
    });
  });

  it("publishes the latest snapshot only when navigation races an old request", async () => {
    let resolveOld!: (value: unknown) => void;
    const invoke = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValue({ schemaVersion: 1, data: { current: true } });
    const setRecommendations = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, "datawisePlugin", {
      configurable: true,
      value: {
        ready: Promise.resolve(),
        context: { connectionId: "cluster-a" },
        capabilities: { ai: true, aiRecommendations: true },
        invoke,
        ai: { setRecommendations },
      },
    });
    const { rerender, unmount } = renderHook(
      ({ path }) => useDatawiseRecommendations(datawiseAIPage(path)),
      { initialProps: { path: "/pods/ns/old" } },
    );
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    rerender({ path: "/deployments/ns/new" });
    await waitFor(() =>
      expect(setRecommendations).toHaveBeenLastCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            resource: { kind: "deployment", namespace: "ns", name: "new" },
            data: { current: true },
            connectionId: "cluster-a",
          }),
          items: expect.arrayContaining([
            expect.objectContaining({ id: "deploymentDetail-releaseCheck" }),
          ]),
        }),
      ),
    );
    await act(async () => resolveOld({ data: { obsolete: true } }));
    expect(JSON.stringify(setRecommendations.mock.calls)).not.toContain(
      "obsolete",
    );
    unmount();
  });

  it("keeps route recommendations when snapshot retrieval fails", async () => {
    const setRecommendations = vi.fn().mockResolvedValue(undefined);
    const openConversation = vi.fn();
    Object.defineProperty(window, "datawisePlugin", {
      configurable: true,
      value: {
        ready: Promise.resolve(),
        context: { connectionId: "cluster-a" },
        capabilities: { aiRecommendations: true },
        invoke: vi.fn().mockRejectedValue(new Error("offline")),
        ai: { setRecommendations, openConversation },
      },
    });
    renderHook(() => useDatawiseRecommendations(datawiseAIPage("/pods/ns/demo")));
    await waitFor(() =>
      expect(setRecommendations).toHaveBeenLastCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            resource: { kind: "pod", namespace: "ns", name: "demo" },
          }),
          items: expect.arrayContaining([
            expect.objectContaining({ id: "podDetail-rootCause" }),
          ]),
        }),
      ),
    );
    expect(openConversation).not.toHaveBeenCalled();
  });

  it("does not call the new API in older hosts", async () => {
    const invoke = vi.fn();
    const setRecommendations = vi.fn();
    Object.defineProperty(window, "datawisePlugin", {
      configurable: true,
      value: {
        ready: Promise.resolve(),
        context: { connectionId: "cluster-a" },
        capabilities: { ai: true },
        invoke,
        ai: { openConversation: vi.fn(), setRecommendations },
      },
    });
    renderHook(() => useDatawiseRecommendations(datawiseAIPage("/pods")));
    await waitFor(() => expect(invoke).not.toHaveBeenCalled());
    expect(setRecommendations).not.toHaveBeenCalled();
  });

  it("opens an agent conversation with the current snapshot", async () => {
    const openConversation = vi.fn().mockResolvedValue(undefined);
    const invoke = vi.fn().mockResolvedValue({
      schemaVersion: 1,
      data: { overview: { pods: 2 } },
    });
    Object.defineProperty(window, "datawisePlugin", {
      configurable: true,
      value: {
        ready: Promise.resolve(),
        context: { connectionId: "cluster-a" },
        capabilities: { ai: true },
        invoke,
        ai: { openConversation },
      },
    });
    await openDatawiseAIConversation(
      datawiseAIPage("/pods/default/demo"),
      "Ask DataWise AI",
      "Diagnose this pod",
    );
    expect(invoke).toHaveBeenCalledWith("ai/snapshot", {
      connectionId: "cluster-a",
      page: datawiseAIPage("/pods/default/demo"),
    });
    expect(openConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Ask DataWise AI",
        prompt: "Diagnose this pod",
        send: true,
        mode: "agent",
        context: expect.objectContaining({
          data: { overview: { pods: 2 } },
          connectionId: "cluster-a",
        }),
      }),
    );
  });
});
