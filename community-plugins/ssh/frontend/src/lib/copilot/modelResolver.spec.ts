import { describe, expect, it, vi } from "vitest";
import { cancelResolvedChat, chatWithResolvedModel, resolveModel } from "./modelResolver";

describe("resolveModel", () => {
  it("prefers plugin BYOK when configured (auto)", async () => {
    const rpc = vi.fn(async (method: string) => {
      if (method === "ssh/copilot/llm/status") {
        return {
          configured: true,
          model: "gpt-x",
          activeId: "p1",
          profiles: [
            {
              id: "p1",
              label: "GPT",
              model: "gpt-x",
              enabled: true,
              configured: true,
              active: true,
              hasApiKey: true,
            },
          ],
        };
      }
      throw new Error(`unexpected ${method}`);
    });
    const hostAi = { status: vi.fn(async () => ({ configured: true, profileName: "host" })) };
    await expect(resolveModel(rpc, hostAi, "auto")).resolves.toEqual({
      source: "plugin",
      model: "gpt-x",
      profileId: "p1",
    });
  });

  it("resolves a specific plugin profile id", async () => {
    const rpc = vi.fn(async () => ({
      configured: true,
      activeId: "a",
      profiles: [
        { id: "a", label: "A", model: "m-a", enabled: true, configured: true, active: true, hasApiKey: true },
        { id: "b", label: "B", model: "m-b", enabled: true, configured: true, active: false, hasApiKey: true },
      ],
    }));
    await expect(resolveModel(rpc, undefined, "plugin:b")).resolves.toEqual({
      source: "plugin",
      model: "m-b",
      profileId: "b",
    });
  });

  it("does not silently swap a missing plugin id to another profile", async () => {
    const rpc = vi.fn(async () => ({
      configured: true,
      activeId: "a",
      profiles: [
        { id: "a", label: "A", model: "m-a", enabled: true, configured: true, active: true, hasApiKey: true },
      ],
    }));
    await expect(resolveModel(rpc, undefined, "plugin:gone")).resolves.toEqual({ source: "none" });
  });

  it("falls back to host when plugin is not configured", async () => {
    const rpc = vi.fn(async () => ({ configured: false }));
    const hostAi = { status: vi.fn(async () => ({ configured: true, profileName: "default" })) };
    await expect(resolveModel(rpc, hostAi)).resolves.toEqual({
      source: "host",
      profileName: "default",
      model: undefined,
    });
  });

  it("honors forced host preference even when plugin is ready", async () => {
    const rpc = vi.fn(async () => ({ configured: true, model: "p" }));
    const hostAi = {
      status: vi.fn(async () => ({ configured: true, profileName: "h", model: "m" })),
    };
    await expect(resolveModel(rpc, hostAi, "host")).resolves.toEqual({
      source: "host",
      profileName: "h",
      model: "m",
    });
  });

  it("returns none when neither model is ready", async () => {
    const rpc = vi.fn(async () => ({ configured: false }));
    const hostAi = { status: vi.fn(async () => ({ configured: false })) };
    await expect(resolveModel(rpc, hostAi)).resolves.toEqual({ source: "none" });
  });
});

describe("chatWithResolvedModel", () => {
  it("does not call host when plugin chat succeeds", async () => {
    const rpc = vi.fn(async (method: string) => {
      if (method === "ssh/copilot/llm/status") return { configured: true };
      if (method === "ssh/copilot/chat") return { content: "from-plugin", source: "plugin" };
      throw new Error(method);
    });
    const hostAi = {
      status: vi.fn(async () => ({ configured: true })),
      chat: vi.fn(async () => ({ reply: "from-host" })),
    };
    const result = await chatWithResolvedModel(rpc, hostAi, { prompt: "hi" });
    expect(result).toEqual({ content: "from-plugin", source: "plugin" });
    expect(hostAi.chat).not.toHaveBeenCalled();
  });

  it("throws without issuing empty requests when nothing is configured", async () => {
    const rpc = vi.fn(async () => ({ configured: false }));
    const hostAi = {
      status: vi.fn(async () => ({ configured: false })),
      chat: vi.fn(async () => ({ reply: "nope" })),
    };
    await expect(chatWithResolvedModel(rpc, hostAi, { prompt: "hi" })).rejects.toThrow(/no LLM configured/i);
    expect(hostAi.chat).not.toHaveBeenCalled();
  });

  it("streams host chat with requestId", async () => {
    const rpc = vi.fn(async () => ({ configured: false }));
    const hostAi = {
      status: vi.fn(async () => ({ configured: true, profileName: "h" })),
      chat: vi.fn(async (opts: { requestId?: string; stream?: boolean; systemPrompt?: string }) => {
        expect(opts.requestId).toBe("req-1");
        expect(opts.stream).toBe(true);
        expect(opts.systemPrompt).toContain("copilot");
        return { reply: "host-ok", source: "host" };
      }),
    };
    const result = await chatWithResolvedModel(rpc, hostAi, {
      prompt: "hi",
      system: "You are the SSH session copilot",
      requestId: "req-1",
      stream: true,
    });
    expect(result).toEqual({ content: "host-ok", source: "host" });
  });
});

describe("cancelResolvedChat", () => {
  it("cancels plugin BYOK via rpc", async () => {
    const rpc = vi.fn(async () => ({ ok: true, cancelled: true }));
    await cancelResolvedChat(rpc, undefined, "r1", "plugin");
    expect(rpc).toHaveBeenCalledWith("ssh/copilot/chat/cancel", { requestId: "r1" });
  });

  it("cancels host via chatCancel", async () => {
    const chatCancel = vi.fn(async () => ({ ok: true, cancelled: true }));
    await cancelResolvedChat(vi.fn(), { status: async () => ({ configured: true }), chat: async () => ({}), chatCancel }, "r2", "host");
    expect(chatCancel).toHaveBeenCalledWith({ requestId: "r2" });
  });
});
