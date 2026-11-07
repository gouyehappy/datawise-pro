<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { ChevronRight, ExternalLink, Folder, Play, Plus, Send, Server, Sparkles, Square, UserRound, X } from "@lucide/vue";
import { Switch } from "./ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import MarkdownRender from "./MarkdownRender.vue";
import {
  clampCopilotDockWidth,
  COPILOT_DOCK_WIDTH,
  type CopilotDockWidthBounds,
} from "@datawise/community-copilot-kit";
import { formatAttachmentsForPrompt } from "../lib/copilot/modelResolver";
import { stripActionCardJson } from "../lib/copilot/toolRunner";
import { stripOpenThinkTail } from "../lib/copilot/thinking";
import type {
  ActionCard,
  CopilotAttachment,
  CopilotChatMode,
  CopilotIntent,
  CopilotMessage,
  ModelPreference,
  ModelSource,
  SessionContext,
} from "../lib/copilot/types";
import type { ModelOption } from "../lib/copilot/modelResolver";

const ATTACH_MAX_FILES = 5;
const ATTACH_MAX_BYTES = 128 * 1024;

const props = defineProps<{
  open: boolean;
  enabled: boolean;
  chatMode: CopilotChatMode;
  modelPreference: ModelPreference;
  modelOptions: ModelOption[];
  context: SessionContext;
  modelSource: ModelSource;
  messages: CopilotMessage[];
  busy: boolean;
  width?: number;
  /** From adapter.dockWidth — drives drag clamp. */
  widthBounds?: Partial<CopilotDockWidthBounds>;
  /** Quick-intent chips; from plugin adapter (e.g. sshCopilotAdapter.intents). */
  intents?: CopilotIntent[];
  t: (key: string, values?: Record<string, string | number>) => string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "toggle-enabled", value: boolean): void;
  (e: "intent", intent: CopilotIntent): void;
  (e: "run-card", card: ActionCard): void;
  (e: "open-settings"): void;
  (e: "send-prompt", prompt: string): void;
  (e: "stop"): void;
  (e: "notice", message: string): void;
  (e: "update:width", value: number): void;
  (e: "update:chatMode", value: CopilotChatMode): void;
  (e: "update:modelPreference", value: ModelPreference): void;
}>();

const isAskMode = computed(() => props.chatMode === "ask");
const hasMessages = computed(() => props.messages.length > 0);
const promptPlaceholder = computed(() =>
  isAskMode.value ? props.t("copilot.promptPlaceholderAsk") : props.t("copilot.promptPlaceholder"),
);
const greeting = computed(() =>
  isAskMode.value ? props.t("copilot.greetingAsk") : props.t("copilot.greetingAgent"),
);
const greetingSub = computed(() =>
  isAskMode.value ? props.t("copilot.greetingAskSub") : props.t("copilot.greetingAgentSub"),
);
const selectedPaths = computed(() => props.context.selectedPaths ?? []);

const promptDraft = ref("");
const attachments = ref<CopilotAttachment[]>([]);
const fileInputEl = ref<HTMLInputElement | null>(null);
const listEl = ref<HTMLElement>();
let resizeCleanup: (() => void) | null = null;
let attachSeq = 0;

const intentChips = computed(() => props.intents ?? []);
const widthBounds = computed<CopilotDockWidthBounds>(() => ({
  min: props.widthBounds?.min ?? COPILOT_DOCK_WIDTH.min,
  max: props.widthBounds?.max ?? COPILOT_DOCK_WIDTH.max,
  default: props.widthBounds?.default ?? COPILOT_DOCK_WIDTH.default,
}));
const dockWidth = ref(
  clampCopilotDockWidth(props.width ?? widthBounds.value.default, widthBounds.value),
);

const sessionHost = computed(() => props.context.host || "–");
const sessionUser = computed(() => props.context.user || "–");
const sessionPath = computed(() => props.context.shellCwd || props.context.sftpPath || "–");
const selectedCount = computed(() => props.context.selectedPaths?.length ?? 0);
const contextChip = computed(() =>
  [sessionHost.value, sessionUser.value, sessionPath.value, props.t("copilot.selectedCount", { count: selectedCount.value })].join(" · "),
);
const modeShortLabel = computed(() =>
  props.chatMode === "ask" ? props.t("copilot.chatModeAsk") : props.t("copilot.chatModeAgent"),
);
const modelShortLabel = computed(() => {
  const opt = props.modelOptions.find((o) => o.id === props.modelPreference);
  if (!opt) return props.t("copilot.modelAuto");
  return opt.label || (opt.labelKey ? props.t(opt.labelKey) : props.t("copilot.modelAuto"));
});

const sourceBadge = computed(() => {
  if (props.modelSource === "plugin") return props.t("copilot.sourcePlugin");
  if (props.modelSource === "host") return props.t("copilot.sourceHost");
  return props.t("copilot.sourceNone");
});

const modelSelectLabel = computed(() => {
  const opt = props.modelOptions.find((o) => o.id === props.modelPreference);
  if (!opt) return props.t("copilot.modelAuto");
  return optionLabel(opt);
});

const dockStyle = computed(() => ({
  width: `${dockWidth.value}px`,
  flexBasis: `${dockWidth.value}px`,
  minWidth: `${widthBounds.value.min}px`,
  maxWidth: `${widthBounds.value.max}px`,
}));

watch(
  () => props.width,
  (value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      dockWidth.value = clampWidth(value);
    }
  },
);

watch(
  () =>
    [
      props.messages.length,
      props.messages[props.messages.length - 1]?.content,
      props.messages[props.messages.length - 1]?.thinking,
      props.busy,
    ] as const,
  async () => {
    await nextTick();
    const el = listEl.value;
    if (el) el.scrollTop = el.scrollHeight;
  },
);

onBeforeUnmount(() => {
  resizeCleanup?.();
  resizeCleanup = null;
});

function displayBody(msg: CopilotMessage): string {
  if (msg.role !== "assistant") return msg.content;
  return stripOpenThinkTail(stripActionCardJson(msg.content));
}

function hasAssistantSurface(msg: CopilotMessage): boolean {
  return Boolean(
    displayBody(msg) ||
      msg.thinking?.trim() ||
      (!isAskMode.value && msg.cards?.length) ||
      msg.references?.length,
  );
}

function isStreamingAssistant(index: number): boolean {
  return props.busy && index === props.messages.length - 1;
}

function isToolTurn(msg: CopilotMessage): boolean {
  return msg.role === "user" && msg.variant === "tool";
}

function toolStepTitle(msg: CopilotMessage): string {
  const first = (msg.content || "").split("\n")[0]?.trim() || "";
  return first || msg.content;
}

function toolStepDetail(msg: CopilotMessage): string {
  const lines = (msg.content || "").split("\n");
  if (lines.length < 2) return "";
  return lines.slice(1).join("\n").trim();
}

function clampWidth(value: number): number {
  return clampCopilotDockWidth(value, widthBounds.value);
}

function optionLabel(opt: ModelOption): string {
  const base = opt.label || (opt.labelKey ? props.t(opt.labelKey) : opt.id);
  return opt.detail ? `${base} · ${opt.detail}` : base;
}

function onChatModeSelect(value: unknown) {
  if (value === "ask" || value === "agent") emit("update:chatMode", value);
}

function onModelSelect(value: unknown) {
  if (typeof value !== "string") return;
  if (value === "auto" || value === "plugin" || value === "host" || value.startsWith("plugin:")) {
    emit("update:modelPreference", value as ModelPreference);
  }
}

function removeAttachment(id: string) {
  attachments.value = attachments.value.filter((a) => a.id !== id);
}

function openFilePicker() {
  fileInputEl.value?.click();
}

async function onFilesPicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  let skippedSize = 0;
  let skippedEmpty = 0;
  let skippedLimit = 0;
  for (const file of files) {
    if (attachments.value.length >= ATTACH_MAX_FILES) {
      skippedLimit += 1;
      continue;
    }
    if (file.size > ATTACH_MAX_BYTES) {
      skippedSize += 1;
      continue;
    }
    const text = await file.text().catch(() => "");
    if (!text.trim()) {
      skippedEmpty += 1;
      continue;
    }
    attachSeq += 1;
    attachments.value = [
      ...attachments.value,
      {
        id: `file-${attachSeq}`,
        name: file.name,
        content: text,
        bytes: file.size,
        kind: "file",
      },
    ];
  }
  if (skippedLimit) emit("notice", props.t("copilot.attachLimit", { max: ATTACH_MAX_FILES }));
  else if (skippedSize) emit("notice", props.t("copilot.attachTooLarge", { maxKb: Math.round(ATTACH_MAX_BYTES / 1024) }));
  else if (skippedEmpty) emit("notice", props.t("copilot.attachEmpty"));
}

function attachSelectedPaths() {
  const paths = selectedPaths.value.filter(Boolean);
  if (!paths.length) return;
  const room = ATTACH_MAX_FILES - attachments.value.length;
  if (room <= 0) return;
  const chunk = paths.slice(0, room);
  attachSeq += 1;
  const body = chunk.map((p) => `- ${p}`).join("\n");
  attachments.value = [
    ...attachments.value,
    {
      id: `sel-${attachSeq}`,
      name: props.t("copilot.attachSelectionName", { count: chunk.length }),
      content: `${props.t("copilot.attachSelectionBody")}\n${body}`,
      bytes: body.length,
      kind: "selection",
    },
  ];
}

function submitPrompt() {
  const text = promptDraft.value.trim();
  if ((!text && !attachments.value.length) || props.busy || !props.enabled) return;
  const prompt = `${text}${formatAttachmentsForPrompt(attachments.value)}`.trim();
  emit("send-prompt", prompt);
  promptDraft.value = "";
  attachments.value = [];
}

function onPromptKey(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submitPrompt();
  }
}

function startResize(event: PointerEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  const startX = event.clientX;
  const startWidth = dockWidth.value;
  const target = event.currentTarget as HTMLElement;
  const pointerId = event.pointerId;
  target.setPointerCapture(pointerId);

  const onMove = (next: PointerEvent) => {
    const nextWidth = clampWidth(startWidth + (startX - next.clientX));
    dockWidth.value = nextWidth;
  };
  const onUp = () => {
    target.releasePointerCapture(pointerId);
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", onUp);
    target.removeEventListener("pointercancel", onUp);
    document.body.classList.remove("resizing-copilot");
    resizeCleanup = null;
    emit("update:width", dockWidth.value);
  };

  document.body.classList.add("resizing-copilot");
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", onUp);
  target.addEventListener("pointercancel", onUp);
  resizeCleanup = () => {
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", onUp);
    target.removeEventListener("pointercancel", onUp);
    document.body.classList.remove("resizing-copilot");
  };
}
</script>

<template>
  <aside
    v-if="open"
    class="copilot-dock"
    :style="dockStyle"
    :aria-label="t('copilot.title')"
  >
    <div
      class="copilot-resizer"
      role="separator"
      aria-orientation="vertical"
      :aria-label="t('copilot.resize')"
      :title="t('copilot.resize')"
      @pointerdown="startResize"
    />

    <header class="copilot-head">
      <div class="copilot-head-main">
        <strong class="copilot-title">{{ t("copilot.title") }}</strong>
        <span class="copilot-source" :data-source="modelSource">{{ sourceBadge }}</span>
      </div>
      <div class="copilot-head-actions">
        <label class="copilot-enable" :title="t('copilot.enabled')">
          <Switch
            size="sm"
            :model-value="enabled"
            @update:model-value="(v) => emit('toggle-enabled', v === true)"
          />
        </label>
        <button type="button" class="icon-button" :title="t('close')" @click="emit('close')"><X /></button>
      </div>
    </header>
    <div v-if="!hasMessages" class="copilot-meta" :title="contextChip">
      <span class="copilot-meta-chip">
        <Server aria-hidden="true" />
        <span class="mono">{{ sessionHost }}</span>
      </span>
      <span class="copilot-meta-chip">
        <UserRound aria-hidden="true" />
        <span class="mono">{{ sessionUser }}</span>
      </span>
      <span class="copilot-meta-chip copilot-meta-path">
        <Folder aria-hidden="true" />
        <span class="mono">{{ sessionPath }}</span>
      </span>
      <span class="copilot-meta-chip" :data-active="selectedCount > 0">
        {{ t("copilot.selectedCount", { count: selectedCount }) }}
      </span>
    </div>

    <div v-if="enabled && modelSource === 'none'" class="copilot-banner">
      <div class="copilot-banner-copy">
        <strong>{{ t("copilot.configureTitle") }}</strong>
        <p>{{ t("copilot.configureHint") }}</p>
      </div>
      <button type="button" class="copilot-banner-cta" @click="emit('open-settings')">
        <span class="copilot-banner-cta-icon" aria-hidden="true"><Plus /></span>
        <span class="copilot-banner-cta-text">
          <span class="copilot-banner-cta-title">{{ t("copilot.openSettings") }}</span>
          <span class="copilot-banner-cta-sub">{{ t("copilot.openSettingsSub") }}</span>
        </span>
      </button>
      <span class="muted copilot-banner-note">{{ t("copilot.hostAiNote") }}</span>
    </div>

    <div ref="listEl" class="copilot-messages" role="log" :data-empty="!hasMessages">
      <div v-if="!hasMessages" class="copilot-hello">
        <div class="copilot-hello-mark" aria-hidden="true"><Sparkles /></div>
        <h2 class="copilot-hello-title">{{ greeting }}</h2>
        <p class="copilot-hello-sub">{{ greetingSub }}</p>
        <div v-if="intentChips.length" class="copilot-hello-skills" role="toolbar" :aria-label="t('copilot.tryPrompts')">
          <button
            v-for="intent in intentChips"
            :key="intent"
            type="button"
            class="copilot-skill"
            :disabled="!enabled || busy"
            @click="emit('intent', intent)"
          >{{ t(`copilot.intent.${intent}`) }}</button>
        </div>
      </div>

      <template v-else>
        <article
          v-for="(msg, index) in messages"
          :key="`${index}-${msg.role}-${msg.variant || 'default'}`"
          class="copilot-turn"
          :data-role="msg.role"
          :data-variant="msg.variant || (msg.role === 'user' ? 'prompt' : undefined)"
        >
          <!-- Question bubble (Cursor-style ask) -->
          <div
            v-if="msg.role === 'user' && !isToolTurn(msg) && displayBody(msg)"
            class="copilot-bubble copilot-bubble-user"
          >{{ displayBody(msg) }}</div>

          <!-- Card/tool step — not a chat question -->
          <div
            v-else-if="isToolTurn(msg)"
            class="copilot-tool-step"
          >
            <span class="copilot-tool-step-icon" aria-hidden="true"><Play /></span>
            <div class="copilot-tool-step-copy">
              <div class="copilot-tool-step-top">
                <span class="copilot-tool-step-label">{{ t("copilot.toolStep") }}</span>
                <strong>{{ toolStepTitle(msg) }}</strong>
              </div>
              <code v-if="toolStepDetail(msg)" class="copilot-tool-step-cmd">{{ toolStepDetail(msg) }}</code>
            </div>
          </div>

          <template v-else-if="msg.role === 'assistant' && hasAssistantSurface(msg)">
            <div class="copilot-assistant">
              <details
                v-if="msg.thinking?.trim()"
                class="copilot-thinking"
                :open="isStreamingAssistant(index)"
              >
                <summary class="copilot-thinking-summary">
                  <ChevronRight class="copilot-thinking-chevron" aria-hidden="true" />
                  <span
                    class="copilot-thinking-label"
                    :data-live="isStreamingAssistant(index) ? 'true' : undefined"
                  >
                    {{
                      isStreamingAssistant(index)
                        ? t("copilot.thinkingProcessLive")
                        : t("copilot.thinkingProcess")
                    }}
                  </span>
                </summary>
                <div class="copilot-thinking-panel">
                  <pre class="copilot-thinking-body">{{ msg.thinking }}</pre>
                </div>
              </details>

              <div
                v-if="displayBody(msg)"
                class="copilot-assistant-body copilot-msg-md"
              >
                <MarkdownRender :text="displayBody(msg)" />
              </div>

              <div
                v-if="!busy && msg.references?.length"
                class="copilot-refs"
              >
                <span class="copilot-refs-label">{{ t("copilot.references") }}</span>
                <div class="copilot-refs-chips">
                  <a
                    v-for="refItem in msg.references"
                    :key="refItem.url"
                    class="copilot-ref-chip"
                    :href="refItem.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    :title="refItem.url"
                  >
                    <ExternalLink class="copilot-ref-icon" aria-hidden="true" />
                    <span class="copilot-ref-text">{{ refItem.title || refItem.url }}</span>
                  </a>
                </div>
              </div>

              <div v-if="!isAskMode && !busy && msg.cards?.length" class="copilot-actions">
                <div class="copilot-cards">
                  <button
                    v-for="card in msg.cards"
                    :key="card.id"
                    type="button"
                    class="copilot-card"
                    :data-risk="card.risk"
                    :disabled="!enabled || busy"
                    :title="card.description || card.tool"
                    @click="emit('run-card', card)"
                  >
                    <span class="copilot-card-run" aria-hidden="true"><Play /></span>
                    <div class="copilot-card-copy">
                      <div class="copilot-card-top">
                        <strong>{{ card.title }}</strong>
                        <span class="copilot-card-risk" :data-risk="card.risk">
                          {{ card.risk === "confirm" ? t("copilot.riskConfirm") : t("copilot.riskRead") }}
                        </span>
                      </div>
                      <span v-if="card.description" class="copilot-card-desc">{{ card.description }}</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </template>
        </article>

        <div
          v-if="busy && !(messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.thinking?.trim())"
          class="copilot-busy"
        >
          <span class="copilot-busy-dots" aria-hidden="true">
            <i /><i /><i />
          </span>
          <span>{{ t("copilot.thinking") }}</span>
        </div>
      </template>
    </div>

    <footer class="copilot-foot">
      <div class="copilot-composer">
        <div v-if="attachments.length" class="copilot-attach-list">
          <div v-for="item in attachments" :key="item.id" class="copilot-attach-chip">
            <span class="copilot-attach-name" :title="item.name">{{ item.name }}</span>
            <button
              type="button"
              class="copilot-attach-remove"
              :title="t('copilot.attachRemove')"
              @click="removeAttachment(item.id)"
            ><X /></button>
          </div>
        </div>

        <textarea
          v-model="promptDraft"
          rows="2"
          :placeholder="promptPlaceholder"
          :disabled="!enabled || busy"
          spellcheck="false"
          @keydown="onPromptKey"
        />

        <div class="copilot-composer-bar">
          <div class="copilot-composer-tools" role="group" :aria-label="t('copilot.composerTools')">
            <button
              type="button"
              class="copilot-tool-btn"
              :disabled="!enabled || busy || attachments.length >= ATTACH_MAX_FILES"
              :title="t('copilot.attachFile')"
              @click="openFilePicker"
            ><Plus /></button>
            <button
              v-if="selectedPaths.length"
              type="button"
              class="copilot-tool-btn is-label"
              :disabled="!enabled || busy || attachments.length >= ATTACH_MAX_FILES"
              :title="t('copilot.attachSelection')"
              @click="attachSelectedPaths"
            >{{ t("copilot.attachSelectionShort") }}</button>
            <input
              ref="fileInputEl"
              type="file"
              class="sr-only"
              multiple
              accept=".txt,.md,.log,.json,.yml,.yaml,.conf,.ini,.csv,.xml,.sh,.py,.js,.ts,.toml,text/plain,application/json"
              @change="onFilesPicked"
            />

            <span class="copilot-tool-sep" aria-hidden="true" />

            <Select :model-value="modelPreference" @update:model-value="onModelSelect">
              <SelectTrigger size="xs" class="copilot-tool-select is-model" :title="modelSelectLabel">
                <SelectValue :placeholder="t('copilot.modelAuto')">{{ modelShortLabel }}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="opt in modelOptions"
                  :key="opt.id"
                  :value="opt.id"
                  :disabled="!opt.available && opt.id !== 'auto'"
                >{{ optionLabel(opt) }}</SelectItem>
              </SelectContent>
            </Select>

            <span class="copilot-tool-sep" aria-hidden="true" />

            <Select :model-value="chatMode" @update:model-value="onChatModeSelect">
              <SelectTrigger
                size="xs"
                class="copilot-tool-select"
                :title="chatMode === 'ask' ? t('copilot.chatModeAskHint') : t('copilot.chatModeAgentHint')"
              >
                <SelectValue :placeholder="modeShortLabel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ask" :title="t('copilot.chatModeAskHint')">{{ t("copilot.chatModeAsk") }}</SelectItem>
                <SelectItem value="agent" :title="t('copilot.chatModeAgentHint')">{{ t("copilot.chatModeAgent") }}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <button
            v-if="busy"
            type="button"
            class="copilot-send is-stop"
            :title="t('copilot.stop')"
            @click="emit('stop')"
          >
            <Square />
            <span>{{ t("copilot.stop") }}</span>
          </button>
          <button
            v-else
            type="button"
            class="copilot-send"
            :disabled="!enabled || (!promptDraft.trim() && !attachments.length)"
            :title="t('copilot.send')"
            @click="submitPrompt"
          >
            <Send />
          </button>
        </div>
      </div>
    </footer>
  </aside>
</template>

<style scoped>
.copilot-dock {
  --copilot-pad: 14px;
  --copilot-radius: 18px;
  position: relative;
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
  background: var(--background);
  color: var(--foreground);
}

.copilot-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -3px;
  z-index: 5;
  width: 6px;
  cursor: col-resize;
  touch-action: none;
}
.copilot-resizer:hover::after,
.copilot-resizer:active::after {
  content: "";
  position: absolute;
  top: 20%;
  bottom: 20%;
  left: 50%;
  width: 2px;
  border-radius: 1px;
  background: var(--primary);
  transform: translateX(-50%);
}

.copilot-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px var(--copilot-pad) 0;
}
.copilot-head-main {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}
.copilot-title {
  font-size: var(--dw-font-size);
  font-weight: 650;
  letter-spacing: 0.01em;
}
.copilot-source {
  border-radius: 999px;
  padding: 2px 8px;
  background: color-mix(in srgb, var(--muted) 55%, transparent);
  color: var(--muted-foreground);
  font-size: var(--dw-text-2xs);
  white-space: nowrap;
}
.copilot-source[data-source="plugin"] {
  background: color-mix(in srgb, var(--success) 14%, transparent);
  color: var(--success);
}
.copilot-source[data-source="host"] {
  background: color-mix(in srgb, var(--info) 14%, transparent);
  color: var(--info);
}
.copilot-head-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 2px;
}
.copilot-enable {
  display: inline-flex;
  align-items: center;
  padding: 2px 4px;
  cursor: pointer;
}
.copilot-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 6px var(--copilot-pad) 10px;
}
.copilot-meta-chip {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  padding: 3px 9px 3px 7px;
  background: color-mix(in srgb, var(--muted) 42%, transparent);
  color: color-mix(in srgb, var(--foreground) 78%, var(--muted-foreground));
  font-size: var(--dw-text-xs);
  line-height: 1.35;
}
.copilot-meta-chip svg {
  width: 12px;
  height: 12px;
  flex: 0 0 auto;
  color: var(--muted-foreground);
  opacity: 0.9;
}
.copilot-meta-chip span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.copilot-meta-path {
  min-width: 0;
  flex: 1 1 auto;
  max-width: 100%;
}
.copilot-meta-chip[data-active="true"] {
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  color: var(--foreground);
}

.copilot-banner {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0 var(--copilot-pad) 10px;
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  border-radius: 16px;
  padding: 12px;
  background:
    linear-gradient(
      160deg,
      color-mix(in srgb, var(--primary) 8%, transparent),
      transparent 55%
    ),
    color-mix(in srgb, var(--muted) 38%, var(--background));
  font-size: var(--dw-font-size);
  line-height: 1.45;
}
.copilot-banner-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.copilot-banner-copy strong {
  font-size: var(--dw-font-size);
  font-weight: 600;
}
.copilot-banner p { margin: 0; color: var(--muted-foreground); }
.copilot-banner-cta {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  border: 1px solid color-mix(in srgb, var(--primary) 28%, var(--border));
  border-radius: 12px;
  padding: 9px 11px;
  background: color-mix(in srgb, var(--background) 72%, transparent);
  color: var(--foreground);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.14s ease, background-color 0.14s ease;
}
.copilot-banner-cta:hover {
  border-color: color-mix(in srgb, var(--primary) 48%, var(--border));
  background: color-mix(in srgb, var(--primary) 10%, var(--background));
}
.copilot-banner-cta-icon {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 9px;
  background: color-mix(in srgb, var(--primary) 16%, transparent);
  color: var(--primary);
}
.copilot-banner-cta-icon svg { width: 15px; height: 15px; }
.copilot-banner-cta-text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
}
.copilot-banner-cta-title {
  font-size: var(--dw-font-size);
  font-weight: 600;
  line-height: 1.3;
}
.copilot-banner-cta-sub {
  color: var(--muted-foreground);
  font-size: var(--dw-text-xs);
  line-height: 1.35;
}
.copilot-banner-note {
  font-size: var(--dw-text-xs);
}

.copilot-messages {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
  overflow: auto;
  padding: 8px var(--copilot-pad) 18px;
  scrollbar-width: thin;
}
.copilot-messages[data-empty="true"] { justify-content: center; gap: 0; }

.copilot-hello {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 8px 28px;
  text-align: center;
}
.copilot-hello-mark {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border-radius: 14px;
  margin-bottom: 2px;
  background: color-mix(in srgb, var(--muted) 55%, transparent);
  color: var(--muted-foreground);
}
.copilot-hello-mark svg { width: 18px; height: 18px; }
.copilot-hello-title {
  margin: 0;
  max-width: 16em;
  font-size: var(--dw-text-xl);
  font-weight: 600;
  line-height: 1.35;
}
.copilot-hello-sub {
  margin: 0;
  max-width: 22em;
  color: var(--muted-foreground);
  font-size: var(--dw-font-size);
  line-height: 1.55;
}
.copilot-hello-skills {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 14px;
  max-width: 28em;
}

.copilot-turn {
  display: flex;
  flex-direction: column;
  max-width: 100%;
}
.copilot-turn[data-role="user"][data-variant="prompt"] {
  align-items: flex-end;
  margin-top: 6px;
}
.copilot-turn[data-role="user"][data-variant="tool"] {
  align-items: stretch;
  margin-top: 2px;
}
.copilot-turn[data-role="assistant"] {
  align-items: stretch;
  padding-bottom: 4px;
}
/* Extra air after an answer before the next question */
.copilot-turn[data-role="assistant"] + .copilot-turn[data-variant="prompt"] {
  margin-top: 14px;
}

.copilot-bubble {
  max-width: 100%;
  overflow-wrap: anywhere;
  line-height: 1.5;
}
.copilot-bubble-user {
  max-width: 88%;
  border-radius: 16px;
  padding: 10px 14px;
  background: color-mix(in srgb, var(--muted) 58%, var(--background));
  color: var(--foreground);
  font-size: var(--dw-font-size);
  white-space: pre-wrap;
}

.copilot-tool-step {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  border-radius: 10px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--muted) 22%, transparent);
}
.copilot-tool-step-icon {
  display: grid;
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  margin-top: 1px;
  place-items: center;
  border-radius: 6px;
  background: color-mix(in srgb, var(--muted) 60%, transparent);
  color: var(--muted-foreground);
}
.copilot-tool-step-icon svg {
  width: 11px;
  height: 11px;
  fill: currentColor;
  margin-left: 1px;
}
.copilot-tool-step-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.copilot-tool-step-top {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 8px;
}
.copilot-tool-step-label {
  color: var(--muted-foreground);
  font-size: var(--dw-text-xs);
  font-weight: 500;
}
.copilot-tool-step-top strong {
  font-size: var(--dw-font-size);
  font-weight: 575;
  line-height: 1.35;
}
.copilot-tool-step-cmd {
  display: block;
  overflow: hidden;
  max-width: 100%;
  color: var(--muted-foreground);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--dw-text-xs);
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copilot-assistant {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding-top: 2px;
}

/* Cursor-like thought disclosure: no card chrome, quiet label + left rail. */
.copilot-thinking {
  margin: 0;
  border: 0;
  background: transparent;
  padding: 0;
}
.copilot-thinking-summary {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
  max-width: 100%;
  cursor: pointer;
  list-style: none;
  padding: 2px 0;
  color: var(--muted-foreground);
  font-size: var(--dw-font-size);
  font-weight: 500;
  line-height: 1.3;
  user-select: none;
}
.copilot-thinking-summary::-webkit-details-marker { display: none; }
.copilot-thinking-chevron {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  opacity: 0.75;
  transition: transform 0.14s ease;
}
.copilot-thinking[open] > .copilot-thinking-summary .copilot-thinking-chevron {
  transform: rotate(90deg);
}
.copilot-thinking-label[data-live="true"] {
  background: linear-gradient(
    90deg,
    var(--muted-foreground) 0%,
    color-mix(in srgb, var(--foreground) 55%, var(--muted-foreground)) 45%,
    var(--muted-foreground) 90%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: copilot-shimmer 1.6s ease-in-out infinite;
}
.copilot-thinking-panel {
  margin: 4px 0 2px;
  padding: 0 0 0 10px;
  border-left: 2px solid color-mix(in srgb, var(--border) 85%, transparent);
}
.copilot-thinking-body {
  margin: 0;
  max-height: 160px;
  overflow: auto;
  color: color-mix(in srgb, var(--muted-foreground) 92%, var(--foreground));
  font-family: inherit;
  font-size: var(--dw-font-size);
  font-weight: 400;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  opacity: 0.88;
}

.copilot-assistant-body {
  padding: 0;
  font-size: var(--dw-font-size);
}
.copilot-msg-md :deep(.wb-md-render) {
  flex: initial;
  min-height: 0;
  overflow: visible;
  padding: 0;
}
.copilot-msg-md :deep(.wb-md-body) {
  font-size: inherit;
  line-height: 1.7;
  color: color-mix(in srgb, var(--foreground) 97%, transparent);
}
.copilot-msg-md :deep(.wb-md-h) {
  margin: 0.2em 0 0.35em;
  font-size: var(--dw-font-size);
  font-weight: 600;
}
.copilot-msg-md :deep(.wb-md-p) { margin: 0.4em 0; }
.copilot-msg-md :deep(.wb-md-p:first-child) { margin-top: 0; }
.copilot-msg-md :deep(.wb-md-p:last-child) { margin-bottom: 0; }
.copilot-msg-md :deep(.wb-md-list) {
  margin: 0.4em 0;
  padding-left: 1.15em;
}
.copilot-msg-md :deep(.wb-md-list li + li) { margin-top: 0.25em; }
.copilot-msg-md :deep(.wb-md-code-inline) {
  border-radius: 5px;
  padding: 0.08em 0.32em;
  background: color-mix(in srgb, var(--muted) 70%, transparent);
}

.copilot-refs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  padding-top: 2px;
}
.copilot-refs-label {
  color: var(--muted-foreground);
  font-size: var(--dw-text-xs);
  font-weight: 500;
}
.copilot-refs-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}
.copilot-ref-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 160px;
  border: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
  border-radius: 999px;
  padding: 3px 8px 3px 6px;
  background: color-mix(in srgb, var(--muted) 35%, transparent);
  color: color-mix(in srgb, var(--foreground) 78%, var(--muted-foreground));
  font-size: var(--dw-text-xs);
  line-height: 1.3;
  text-decoration: none;
  transition: border-color 0.12s ease, background-color 0.12s ease, color 0.12s ease;
}
.copilot-ref-chip:hover {
  border-color: color-mix(in srgb, var(--foreground) 18%, var(--border));
  background: color-mix(in srgb, var(--muted) 55%, transparent);
  color: var(--foreground);
}
.copilot-ref-icon {
  width: 11px;
  height: 11px;
  flex: 0 0 auto;
  opacity: 0.7;
}
.copilot-ref-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copilot-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}
.copilot-cards {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.copilot-card {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  border-radius: 9px;
  padding: 8px 9px;
  background: transparent;
  color: var(--foreground);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.14s ease, background-color 0.14s ease;
}
.copilot-card:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--foreground) 16%, var(--border));
  background: color-mix(in srgb, var(--muted) 28%, transparent);
}
.copilot-card:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.copilot-card[data-risk="confirm"] {
  border-color: color-mix(in srgb, var(--warning) 24%, var(--border));
}
.copilot-card-run {
  display: grid;
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  margin-top: 1px;
  place-items: center;
  border-radius: 6px;
  background: color-mix(in srgb, var(--muted) 55%, transparent);
  color: var(--muted-foreground);
}
.copilot-card:hover:not(:disabled) .copilot-card-run {
  background: color-mix(in srgb, var(--foreground) 10%, var(--muted));
  color: var(--foreground);
}
.copilot-card-run svg {
  width: 11px;
  height: 11px;
  fill: currentColor;
  margin-left: 1px;
}
.copilot-card-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.copilot-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.copilot-card strong {
  flex: 1;
  min-width: 0;
  font-size: var(--dw-font-size);
  font-weight: 575;
  line-height: 1.35;
}
.copilot-card-risk {
  flex-shrink: 0;
  border-radius: 4px;
  padding: 1px 6px;
  font-size: var(--dw-text-2xs);
  line-height: 1.45;
  white-space: nowrap;
  background: color-mix(in srgb, var(--muted) 50%, transparent);
  color: var(--muted-foreground);
}
.copilot-card-risk[data-risk="confirm"] {
  background: color-mix(in srgb, var(--warning) 14%, transparent);
  color: color-mix(in srgb, var(--warning) 88%, var(--foreground));
}
.copilot-card-risk[data-risk="read"] {
  background: color-mix(in srgb, var(--muted) 50%, transparent);
  color: var(--muted-foreground);
}
.copilot-card-desc {
  color: var(--muted-foreground);
  font-size: var(--dw-text-xs);
  line-height: 1.4;
}

.copilot-busy {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  padding: 2px 0;
  color: var(--muted-foreground);
  font-size: var(--dw-font-size);
}
.copilot-busy-dots {
  display: inline-flex;
  gap: 3px;
  align-items: center;
}
.copilot-busy-dots i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.35;
  animation: copilot-dot 1.05s ease-in-out infinite;
}
.copilot-busy-dots i:nth-child(2) { animation-delay: 0.15s; }
.copilot-busy-dots i:nth-child(3) { animation-delay: 0.3s; }
@keyframes copilot-dot {
  0%, 80%, 100% { opacity: 0.28; transform: translateY(0); }
  40% { opacity: 0.9; transform: translateY(-1px); }
}
@keyframes copilot-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}

.copilot-foot {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 6px var(--copilot-pad) 14px;
  border-top: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
  background: color-mix(in srgb, var(--background) 92%, var(--muted));
}

.copilot-skill {
  flex: 0 0 auto;
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  border-radius: 999px;
  padding: 6px 11px;
  background: color-mix(in srgb, var(--muted) 28%, transparent);
  color: color-mix(in srgb, var(--foreground) 88%, var(--muted-foreground));
  font-size: var(--dw-font-size);
  white-space: nowrap;
  cursor: pointer;
}
.copilot-skill:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--foreground) 18%, var(--border));
  background: color-mix(in srgb, var(--muted) 45%, transparent);
  color: var(--foreground);
}
.copilot-skill:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.copilot-composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
  border-radius: 14px;
  padding: 10px 12px 10px;
  background: var(--background);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.copilot-composer:focus-within {
  border-color: color-mix(in srgb, var(--foreground) 22%, var(--border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--muted) 55%, transparent);
}

.copilot-attach-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.copilot-attach-chip {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  padding: 3px 4px 3px 10px;
  background: color-mix(in srgb, var(--primary) 12%, var(--muted));
  color: var(--foreground);
  font-size: var(--dw-text-xs);
}
.copilot-attach-name {
  overflow: hidden;
  max-width: 12em;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.copilot-attach-remove {
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
}
.copilot-attach-remove:hover {
  background: color-mix(in srgb, var(--foreground) 8%, transparent);
  color: var(--foreground);
}
.copilot-attach-remove svg { width: 12px; height: 12px; }

.copilot-composer textarea {
  width: 100%;
  min-height: 2.8em;
  max-height: 8.5em;
  resize: none;
  border: 0;
  padding: 2px;
  background: transparent;
  color: var(--foreground);
  font-size: var(--dw-font-size);
  line-height: 1.5;
}
.copilot-composer textarea:focus { outline: none; }

.copilot-composer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 32px;
  padding-top: 2px;
}
.copilot-composer-tools {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
}
.copilot-tool-sep {
  width: 1px;
  height: 14px;
  margin: 0 4px;
  background: color-mix(in srgb, var(--border) 80%, transparent);
}
.copilot-tool-select {
  width: auto !important;
  max-width: 8.5em;
  min-width: 0;
  height: 28px !important;
  border: 0 !important;
  border-radius: 999px !important;
  background: transparent !important;
  color: var(--muted-foreground) !important;
  box-shadow: none !important;
  padding-inline: 8px 6px !important;
}
.copilot-tool-select:hover {
  background: color-mix(in srgb, var(--muted) 50%, transparent) !important;
  color: var(--foreground) !important;
}
.copilot-tool-select.is-model {
  max-width: 10em;
}
.copilot-tool-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
}
.copilot-tool-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--muted) 50%, transparent);
  color: var(--foreground);
}
.copilot-tool-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.copilot-tool-btn svg { width: 15px; height: 15px; }
.copilot-tool-btn.is-label {
  width: auto;
  padding: 0 8px;
  font-size: var(--dw-text-xs);
  font-weight: 520;
}

.copilot-send {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 999px;
  padding: 0 11px;
  background: var(--primary);
  color: var(--primary-foreground);
  cursor: pointer;
}
.copilot-send:disabled {
  opacity: 0.32;
  cursor: not-allowed;
}
.copilot-send svg { width: 15px; height: 15px; }
.copilot-send.is-stop {
  background: color-mix(in srgb, var(--muted) 70%, var(--background));
  color: var(--foreground);
  font-size: var(--dw-text-xs);
}
.copilot-send.is-stop svg {
  width: 10px;
  height: 10px;
  fill: currentColor;
}

.muted { color: var(--muted-foreground); }
.mono { font-family: var(--font-mono, ui-monospace, monospace); }
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
