# @datawise/community-copilot-kit

Portable **session copilot engine** for DataWise community plugins.

Use this package when you want Ask/Agent chat, BYOK + `host.ai`, action-card JSON,
thinking/references parsing — without copying code out of the SSH plugin.

The kit has **no** `ssh/…` (or other plugin) RPC names. Target-specific behavior
lives in a **`CopilotAdapter`** inside your plugin.

## Layout

```text
community-plugins/shared/copilot-kit/   ← this package (discoverable)
community-plugins/ssh/.../copilot/      ← SSH adapter (reference implementation)
```

## Wire a plugin

1. Alias the kit from your frontend Vite/`tsconfig` (UI must stay self-contained; the kit is bundled at build time):

```ts
// vite resolve.alias
"@datawise/community-copilot-kit": path.resolve(root, "../../shared/copilot-kit/src/index.ts")
```

2. Implement an adapter (see SSH `frontend/src/copilot/adapter.ts`):

```ts
import { createModelRouter, type CopilotAdapter } from "@datawise/community-copilot-kit";

export const myAdapter: CopilotAdapter = {
  id: "git",
  intents: ["explain_diff", "suggest_commit"],
  llm: {
    status: "git/copilot/llm/status",
    chat: "git/copilot/chat",
    cancel: "git/copilot/chat/cancel",
  },
  cardPolicy: { isToolAllowed, toolRisk },
  systemPrompt: (mode) => (mode === "ask" ? ASK : AGENT),
};

export const modelRouter = createModelRouter(myAdapter.llm);
```

3. Reuse dock UX by copying/adapting `ssh/frontend/src/components/CopilotDock.vue`
   (it depends on that plugin’s UI primitives). Or build your own panel on the same
   message/card types from the kit.

## Adapter knobs (configure per plugin)

| Field | Purpose |
|-------|---------|
| `llm` / `pluginDeltaEvent` / `hostDeltaEvent` | BYOK + stream event names |
| `confirmRpc` | Risky-card approval RPC |
| `dockWidth` | `{ min, max, default }` drag bounds |
| `followUpMaxDepth` | Auto tool→LLM follow-ups |
| `systemPrompt` / `intents` / `buildDefaultCards` | Target-specific behavior |
| `cardPolicy` | Tool allowlist + risk |

Kit also exports portable helpers: `appendAssistantStreamDelta`, `composeUserPrompt`,
`formatCardUserTurn`, `clampCopilotDockWidth`, `looksDestructiveCommand`, thinking/refs/cards.

## What stays in the plugin

| Responsibility | Where |
|----------------|--------|
| System prompts, intents | adapter |
| Session context publish/get | plugin RPC + App wiring |
| Tool allowlist + `runToolCard` switch | plugin |
| BYOK vault sidecar | plugin (`…/copilot/llm/*`) |
| Dock chrome / i18n keys | plugin UI (bounds from adapter) |

## Reference

- SSH adapter: `community-plugins/ssh/frontend/src/copilot/adapter.ts`
- AGENTS.md → “会话副驾” points here
