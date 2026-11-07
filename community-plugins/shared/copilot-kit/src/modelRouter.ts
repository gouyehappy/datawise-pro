import type { PluginLlmRpc } from "./adapter";
import type { ModelPreference, ModelSource } from "./types";

export type ResolveResult =
  | { source: "plugin"; model?: string; profileId?: string }
  | { source: "host"; profileName?: string; model?: string }
  | { source: "none" };

export type RpcFn = (method: string, params?: unknown) => Promise<unknown>;

export type HostAiApi = {
  status: () => Promise<{ configured: boolean; profileName?: string; model?: string }>;
  chat: (opts: {
    prompt: string;
    systemPrompt?: string;
    requestId?: string;
    stream?: boolean;
  }) => Promise<{ reply?: string; content?: string; source?: string; profileName?: string; model?: string }>;
  chatCancel?: (opts: { requestId: string }) => Promise<{ ok?: boolean; cancelled?: boolean }>;
};

export type PluginModelProfile = {
  id: string;
  label: string;
  model?: string;
  baseUrl?: string;
  enabled: boolean;
  configured: boolean;
  active: boolean;
  hasApiKey: boolean;
};

export type ModelOption = {
  id: string;
  available: boolean;
  labelKey?: string;
  label?: string;
  detail?: string;
};

/**
 * Prefer `datawisePlugin.ai` (hostApi 1.6 surface); fall back to
 * `invoke("host.ai.*")` so older bootstrap builds still work when the
 * host bridge already routes those methods.
 */
export function createHostAiFromPlugin(plugin: {
  ai?: HostAiApi;
  invoke: RpcFn;
}): HostAiApi {
  if (plugin.ai?.status && plugin.ai?.chat) {
    return {
      ...plugin.ai,
      chatCancel:
        plugin.ai.chatCancel ||
        ((opts) =>
          plugin.invoke("host.ai.chatCancel", opts) as Promise<{
            ok?: boolean;
            cancelled?: boolean;
          }>),
    };
  }
  return {
    status: () =>
      plugin.invoke("host.ai.status", {}) as Promise<{
        configured: boolean;
        profileName?: string;
        model?: string;
      }>,
    chat: (opts) =>
      plugin.invoke("host.ai.chat", opts) as Promise<{
        reply?: string;
        content?: string;
        source?: string;
        profileName?: string;
        model?: string;
      }>,
    chatCancel: (opts) =>
      plugin.invoke("host.ai.chatCancel", opts) as Promise<{
        ok?: boolean;
        cancelled?: boolean;
      }>,
  };
}

function parsePluginProfiles(raw: unknown): PluginModelProfile[] {
  if (!Array.isArray(raw)) return [];
  const out: PluginModelProfile[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id) continue;
    const model = typeof row.model === "string" && row.model.trim() ? row.model.trim() : undefined;
    const labelRaw = typeof row.label === "string" ? row.label.trim() : "";
    out.push({
      id,
      label: labelRaw || model || id,
      model,
      baseUrl: typeof row.baseUrl === "string" ? row.baseUrl : undefined,
      enabled: row.enabled !== false,
      configured: row.configured === true,
      active: row.active === true,
      hasApiKey: row.hasApiKey === true,
    });
  }
  return out;
}

export type ChatResolvedOpts = {
  system?: string;
  prompt: string;
  requestId?: string;
  stream?: boolean;
  onDelta?: (delta: string) => void;
  prefer?: ModelPreference;
};

/** Bind BYOK RPC method names for one plugin adapter. */
export function createModelRouter(llm: PluginLlmRpc) {
  async function probeModels(
    rpc: RpcFn,
    hostAi?: Pick<HostAiApi, "status">,
  ): Promise<{
    plugin: {
      configured: boolean;
      model?: string;
      activeId?: string;
      profiles: PluginModelProfile[];
    };
    host: { configured: boolean; profileName?: string; model?: string };
  }> {
    let plugin = {
      configured: false,
      model: undefined as string | undefined,
      activeId: undefined as string | undefined,
      profiles: [] as PluginModelProfile[],
    };
    let host = {
      configured: false,
      profileName: undefined as string | undefined,
      model: undefined as string | undefined,
    };
    try {
      const status = (await rpc(llm.status, {})) as {
        configured?: boolean;
        model?: string;
        activeId?: string;
        profiles?: unknown;
      };
      const profiles = parsePluginProfiles(status?.profiles);
      const active =
        profiles.find((p) => p.active) ||
        profiles.find((p) => p.id === status?.activeId) ||
        profiles.find((p) => p.configured) ||
        profiles[0];
      const configured =
        !!status?.configured || profiles.some((p) => p.configured) || !!active?.configured;
      plugin = {
        configured,
        model:
          active?.model ||
          (typeof status?.model === "string" && status.model.trim() ? status.model.trim() : undefined),
        activeId: active?.id || (typeof status?.activeId === "string" ? status.activeId : undefined),
        profiles,
      };
    } catch {
      // Plugin LLM unavailable.
    }
    if (hostAi) {
      try {
        const st = await hostAi.status();
        host = {
          configured: !!st?.configured,
          profileName: st?.profileName,
          model: typeof st?.model === "string" && st.model.trim() ? st.model.trim() : undefined,
        };
      } catch {
        // Host AI missing or permission denied.
      }
    }
    return { plugin, host };
  }

  function buildModelOptions(probe: Awaited<ReturnType<typeof probeModels>>): ModelOption[] {
    const hostDetail =
      [probe.host.profileName, probe.host.model].filter(Boolean).join(" · ") || undefined;
    const options: ModelOption[] = [
      {
        id: "auto",
        available: probe.plugin.configured || probe.host.configured,
        labelKey: "copilot.modelAuto",
      },
    ];
    const readyProfiles = probe.plugin.profiles.filter((p) => p.configured);
    if (readyProfiles.length) {
      for (const profile of readyProfiles) {
        options.push({
          id: `plugin:${profile.id}`,
          available: true,
          label: profile.label,
          detail: profile.model && profile.model !== profile.label ? profile.model : undefined,
        });
      }
    } else if (probe.plugin.configured && probe.plugin.model) {
      options.push({
        id: "plugin",
        available: true,
        labelKey: "copilot.modelPlugin",
        detail: probe.plugin.model,
      });
    } else {
      options.push({
        id: "plugin",
        available: false,
        labelKey: "copilot.modelPlugin",
      });
    }
    options.push({
      id: "host",
      available: probe.host.configured,
      labelKey: "copilot.modelHost",
      detail: hostDetail,
    });
    return options;
  }

  async function resolveModel(
    rpc: RpcFn,
    hostAi?: Pick<HostAiApi, "status">,
    prefer: ModelPreference = "auto",
  ): Promise<ResolveResult> {
    const probe = await probeModels(rpc, hostAi);
    if (prefer.startsWith("plugin:")) {
      const id = prefer.slice("plugin:".length);
      const profile = probe.plugin.profiles.find((p) => p.id === id);
      if (profile?.configured) {
        return { source: "plugin", model: profile.model, profileId: id };
      }
      if (probe.plugin.profiles.length) return { source: "none" };
      return probe.plugin.configured
        ? { source: "plugin", model: probe.plugin.model, profileId: id }
        : { source: "none" };
    }
    if (prefer === "plugin") {
      const active =
        probe.plugin.profiles.find((p) => p.active && p.configured) ||
        probe.plugin.profiles.find((p) => p.configured);
      return probe.plugin.configured
        ? {
            source: "plugin",
            model: active?.model || probe.plugin.model,
            profileId: active?.id || probe.plugin.activeId,
          }
        : { source: "none" };
    }
    if (prefer === "host") {
      return probe.host.configured
        ? { source: "host", profileName: probe.host.profileName, model: probe.host.model }
        : { source: "none" };
    }
    const ready =
      probe.plugin.profiles.find((p) => p.active && p.configured) ||
      probe.plugin.profiles.find((p) => p.configured);
    if (ready || probe.plugin.configured) {
      return {
        source: "plugin",
        model: ready?.model || probe.plugin.model,
        profileId: ready?.id || probe.plugin.activeId,
      };
    }
    if (probe.host.configured) {
      return { source: "host", profileName: probe.host.profileName, model: probe.host.model };
    }
    return { source: "none" };
  }

  async function chatWithResolvedModel(
    rpc: RpcFn,
    hostAi: HostAiApi | undefined,
    opts: ChatResolvedOpts,
  ): Promise<{ content: string; source: Exclude<ModelSource, "none"> }> {
    const resolved = await resolveModel(rpc, hostAi, opts.prefer ?? "auto");
    if (resolved.source === "plugin") {
      const requestId = opts.requestId || `copilot-${Date.now()}`;
      const result = (await rpc(llm.chat, {
        system: opts.system ?? "",
        prompt: opts.prompt,
        stream: opts.stream !== false,
        requestId,
        ...(resolved.profileId ? { profileId: resolved.profileId } : {}),
      })) as { content?: string; source?: string };
      // Empty content is allowed here: reasoning-only streams paint via thinkingDelta.
      // Callers must treat empty content + no thinking as EMPTY_LLM_RESPONSE.
      const content = typeof result?.content === "string" ? result.content : "";
      return { content, source: "plugin" };
    }
    if (resolved.source === "host") {
      if (!hostAi) throw new Error("host AI is not available");
      const requestId = opts.requestId || `copilot-host-${Date.now()}`;
      const result = await hostAi.chat({
        prompt: opts.prompt,
        systemPrompt: opts.system,
        requestId,
        stream: opts.stream !== false,
      });
      const content =
        (typeof result?.reply === "string" && result.reply) ||
        (typeof result?.content === "string" && result.content) ||
        "";
      // Same as plugin: host may stream reasoning-only; UI validates surface.
      return { content, source: "host" };
    }
    throw new Error("no LLM configured (plugin BYOK or host AI)");
  }

  async function cancelResolvedChat(
    rpc: RpcFn,
    hostAi: HostAiApi | undefined,
    requestId: string,
    source: "plugin" | "host" | "none",
  ): Promise<void> {
    if (!requestId) return;
    if (source === "host" && hostAi?.chatCancel) {
      await hostAi.chatCancel({ requestId }).catch(() => undefined);
      return;
    }
    if (source === "plugin") {
      await rpc(llm.cancel, { requestId }).catch(() => undefined);
    }
  }

  return {
    llm,
    probeModels,
    buildModelOptions,
    resolveModel,
    chatWithResolvedModel,
    cancelResolvedChat,
  };
}

export function normalizeModelPreference(value: unknown): ModelPreference | null {
  if (value === "auto" || value === "plugin" || value === "host") return value;
  if (typeof value === "string" && value.startsWith("plugin:")) {
    const id = value.slice("plugin:".length);
    if (id && /^[A-Za-z0-9_-]{1,64}$/.test(id)) return value as ModelPreference;
  }
  return null;
}

export function pluginProfileIdFromPreference(prefer: ModelPreference): string | undefined {
  if (prefer.startsWith("plugin:")) return prefer.slice("plugin:".length);
  return undefined;
}

/** Format attachments into a prompt suffix (size-capped). */
export function formatAttachmentsForPrompt(
  attachments: Array<{ name: string; content: string }>,
  maxChars = 24_000,
): string {
  if (!attachments.length) return "";
  const parts: string[] = ["", "Attached context:"];
  let used = 0;
  for (const file of attachments) {
    const header = `\n### ${file.name}\n\`\`\`\n`;
    const footer = "\n```";
    const budget = Math.max(0, maxChars - used - header.length - footer.length);
    if (budget <= 0) {
      parts.push(`\n### ${file.name}\n(truncated: attachment budget exhausted)`);
      break;
    }
    const body =
      file.content.length > budget
        ? `${file.content.slice(0, budget)}\n…(truncated)`
        : file.content;
    parts.push(`${header}${body}${footer}`);
    used += header.length + body.length + footer.length;
  }
  return parts.join("");
}
