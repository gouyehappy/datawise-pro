<script setup lang="ts">
// 端口映射管理弹窗（-L/-R，ssh(1)/Xshell 语义）：列表 + 添加表单 + 停止 / 忘记。
// 「停止」只关本次会话；「忘记」停止并去掉重连恢复。纯逻辑在 lib/portForward*.ts。
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { Loader2, Plus, Square, Trash2, X } from "@lucide/vue";
import { workbenchMessage } from "../lib/i18n";
import {
  applyForwardState,
  findForwardConflict,
  formatForwardBytes,
  formatForwardRoute,
  forwardStartParams,
  parseForwards,
  parseInterfaces,
  validateForwardForm,
  type ForwardFormDraft,
  type ForwardFormError,
  type HostInterface,
  type PortForward,
} from "../lib/portForward";
import {
  draftToPersisted,
  forwardsStorageKey,
  removePersistedForward,
  sanitizePersistedForwards,
  upsertPersistedForward,
  type PersistedForward,
} from "../lib/portForwardPersist";
import { uiStorage } from "../lib/uiStorage";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";

interface Props {
  locale: string;
  open: boolean;
  /** 转发跟随的连接；面板按它拉取 `ssh/forward/list`。 */
  connectionId: string;
  /** 新建映射要挂到的会话；未连接（null）时添加表单禁用。 */
  sessionId: string | null;
}
const props = defineProps<Props>();
const emit = defineEmits<{ "update:open": [boolean]; error: [unknown]; notice: [string] }>();

const t = (key: string, values: Record<string, string | number> = {}) => workbenchMessage(props.locale, key, values);

const forwards = ref<PortForward[]>([]);
const forwardsLoading = ref(false);
const forwardsBusyId = ref<string | null>(null);
const forwardForm = reactive<ForwardFormDraft>({
  kind: "local",
  listenHost: "127.0.0.1",
  listenPort: "",
  targetHost: "",
  targetPort: "",
});
/** 已翻译的表单错误（校验码或冲突预检文案），空串即无错误。 */
const forwardFormMessage = ref("");
const interfaces = ref<HostInterface[]>([]);
/** datalist id：绑定监听输入框与网卡候选列表。 */
const hostOptionListId = "forward-listen-host-options";
const rememberForward = ref(true);
const persisted = ref<PersistedForward[]>([]);
let restoreInFlight = false;

function persistKey(row: {
  kind: string;
  listenHost: string;
  listenPort: string | number;
  targetHost: string;
  targetPort: string | number;
}): string {
  return `${row.kind}|${row.listenHost || "127.0.0.1"}|${row.listenPort}|${row.targetHost}|${row.targetPort}`;
}

function loadPersisted(): PersistedForward[] {
  if (!props.connectionId) return [];
  try {
    return sanitizePersistedForwards(JSON.parse(uiStorage.getItem(forwardsStorageKey(props.connectionId)) || "null"));
  } catch {
    return [];
  }
}

function savePersisted(list: PersistedForward[]) {
  if (!props.connectionId) return;
  persisted.value = list;
  uiStorage.setItem(forwardsStorageKey(props.connectionId), JSON.stringify(list));
}

function refreshPersistedCache() {
  persisted.value = loadPersisted();
}

function isRemembered(row: PortForward): boolean {
  const key = persistKey({
    kind: row.kind,
    listenHost: row.listenHost,
    listenPort: row.listenPort,
    targetHost: row.targetHost,
    targetPort: row.targetPort,
  });
  return persisted.value.some((item) => persistKey(item) === key);
}

const rememberedCount = computed(() => persisted.value.length);

async function restorePersistedForwards() {
  if (!props.sessionId || restoreInFlight) return;
  restoreInFlight = true;
  refreshPersistedCache();
  let failed = 0;
  try {
    await refreshForwards();
    for (const row of persisted.value) {
      const already = forwards.value.some(
        (live) =>
          live.kind === row.kind
          && (live.listenHost || "127.0.0.1") === row.listenHost
          && live.listenPort === Number(row.listenPort),
      );
      if (already) continue;
      try {
        const payload = await window.datawisePlugin.invoke(
          "ssh/forward/start",
          forwardStartParams(row, props.sessionId),
        );
        const started = parseForwards(payload);
        if (started.length) {
          forwards.value = [...forwards.value.filter((item) => item.id !== started[0].id), ...started];
        }
      } catch (cause) {
        failed += 1;
        console.warn("[port-forward] restore failed", cause);
      }
    }
    if (failed > 0) {
      emit("notice", t("forwards.restoreFailed", { count: failed }));
    }
  } finally {
    restoreInFlight = false;
  }
}

async function refreshForwards() {
  if (!props.connectionId) return;
  forwardsLoading.value = true;
  try {
    const payload = await window.datawisePlugin.invoke("ssh/forward/list", { connectionId: props.connectionId });
    forwards.value = parseForwards(payload);
  } catch (cause) {
    console.warn("[port-forward] list failed", cause);
    emit("error", cause);
  } finally {
    forwardsLoading.value = false;
  }
}

/** 网卡地址探测（含回环）：失败静默降级为仅手输，选择器隐藏。 */
async function refreshInterfaces() {
  try {
    interfaces.value = parseInterfaces(await window.datawisePlugin.invoke("ssh/forward/interfaces"));
  } catch (cause) {
    console.warn("[port-forward] interface probe failed", cause);
    interfaces.value = [];
  }
}

function applyForwardFormError(code: ForwardFormError) {
  forwardFormMessage.value = code ? t(`forwards.error.${code}`) : "";
}

async function submitForward() {
  const error = validateForwardForm(forwardForm);
  if (error) {
    applyForwardFormError(error);
    return;
  }
  const conflict = findForwardConflict(forwards.value, forwardForm);
  if (conflict) {
    forwardFormMessage.value = t("forwards.error.conflict", {
      route: `${forwardForm.listenHost.trim() || "127.0.0.1"}:${forwardForm.listenPort.trim()}`,
      existing: formatForwardRoute(conflict),
    });
    return;
  }
  if (!props.sessionId) return;
  try {
    const payload = await window.datawisePlugin.invoke(
      "ssh/forward/start",
      forwardStartParams(forwardForm, props.sessionId),
    );
    const started = parseForwards(payload);
    if (started.length) {
      forwards.value = [...forwards.value.filter((row) => row.id !== started[0].id), ...started];
    }
    if (rememberForward.value) {
      savePersisted(upsertPersistedForward(loadPersisted(), draftToPersisted(forwardForm)));
    }
    forwardFormMessage.value = "";
  } catch (cause) {
    forwardFormMessage.value = "";
    emit("error", cause);
  }
}

/** 仅停止本次会话中的映射；已勾选记住的条目重连后仍会恢复。 */
async function stopForward(id: string) {
  if (forwardsBusyId.value) return;
  forwardsBusyId.value = id;
  try {
    await window.datawisePlugin.invoke("ssh/forward/stop", { id });
    forwards.value = forwards.value.filter((row) => row.id !== id);
  } catch (cause) {
    console.warn("[port-forward] stop failed", cause);
    emit("error", cause);
  } finally {
    forwardsBusyId.value = null;
  }
}

/** 停止并永久从重连恢复列表移除。 */
async function forgetForward(id: string) {
  if (forwardsBusyId.value) return;
  forwardsBusyId.value = id;
  try {
    const stopped = forwards.value.find((row) => row.id === id);
    await window.datawisePlugin.invoke("ssh/forward/stop", { id });
    forwards.value = forwards.value.filter((row) => row.id !== id);
    if (stopped) {
      savePersisted(
        removePersistedForward(loadPersisted(), {
          kind: stopped.kind,
          listenHost: stopped.listenHost,
          listenPort: stopped.listenPort,
          targetHost: stopped.targetHost,
          targetPort: stopped.targetPort,
        }),
      );
    }
  } catch (cause) {
    console.warn("[port-forward] forget failed", cause);
    emit("error", cause);
  } finally {
    forwardsBusyId.value = null;
  }
}

// ssh/forward/state 是 sidecar 的广播事件（含本工作台未发起的变更），挂在
// 自己的监听器上，面板关着也保持列表新鲜；停止的行由事件摘除。
function handleForwardEvent(event: { method: string; params: Record<string, unknown> }) {
  if (event.method !== "ssh/forward/state") return;
  forwards.value = applyForwardState(forwards.value, event.params);
  if (event.params.state === "stopped") {
    forwards.value = forwards.value.filter((row) => row.id !== event.params.id);
  }
}

let unsubscribeEvent: (() => void) | undefined;
onMounted(() => {
  refreshPersistedCache();
  unsubscribeEvent = window.datawisePlugin.onEvent(handleForwardEvent);
});
onBeforeUnmount(() => {
  unsubscribeEvent?.();
});

watch(
  () => props.open,
  (open) => {
    if (open) {
      forwardFormMessage.value = "";
      refreshPersistedCache();
      void refreshForwards();
      void refreshInterfaces();
      // Connect-time auto-start lives in App.vue; opening the dialog still
      // restores any remembered forwards that are not already running.
      if (props.sessionId) void restorePersistedForwards();
    }
  },
);

watch(
  () => props.connectionId,
  () => {
    refreshPersistedCache();
  },
);
</script>

<template>
  <Dialog :open="props.open" @update:open="(open) => emit('update:open', open)">
    <DialogContent class="modal forwards-modal" @escape-key-down.prevent>
      <header>
        <DialogTitle>{{ t("forwards.title") }}</DialogTitle>
        <button :title="t('close')" class="icon-button" @click="emit('update:open', false)"><X /></button>
      </header>
      <div class="forwards-body">
        <div v-if="forwardsLoading && !forwards.length" class="empty"><Loader2 class="spinning" />{{ t("loading") }}</div>
        <div v-else-if="!forwards.length" class="empty">{{ t("forwards.empty") }}</div>
        <ul v-else class="forwards-list">
          <li v-for="row in forwards" :key="row.id" class="forward-row">
            <span class="forward-kind" :class="`forward-kind--${row.kind}`">{{ row.kind === "remote" ? t("forwards.remote") : row.kind === "dynamic" ? t("forwards.dynamic") : t("forwards.local") }}</span>
            <span class="forward-route">{{ formatForwardRoute(row) }}</span>
            <span class="forward-state" :class="`forward-state--${row.state}`" :title="row.error || ''">{{ t(`forwards.state.${row.state}`) }}</span>
            <span class="forward-stats" :title="t('forwards.statsTitle')">
              {{ row.connectionsActive }}/{{ row.connectionsTotal }} · ↑{{ formatForwardBytes(row.bytesUp) }} ↓{{ formatForwardBytes(row.bytesDown) }}
            </span>
            <span class="forward-actions">
              <button class="forward-stop" :title="t('forwards.stop')" :disabled="forwardsBusyId !== null" @click="stopForward(row.id)">
                <Square v-if="forwardsBusyId === row.id" /><X v-else />
              </button>
              <button
                v-if="isRemembered(row)"
                class="forward-forget"
                :title="t('forwards.forget')"
                :disabled="forwardsBusyId !== null"
                @click="forgetForward(row.id)"
              >
                <Trash2 />
              </button>
            </span>
          </li>
        </ul>
        <p v-if="rememberedCount" class="muted forward-persist-hint">{{ t("forwards.persistHint", { count: rememberedCount }) }}</p>
        <form class="forward-form" :disabled="!props.sessionId" @submit.prevent="submitForward">
          <div class="forward-form-row forward-form-kinds">
            <label class="forward-kind-picker">
              <input v-model="forwardForm.kind" type="radio" value="local" />{{ t("forwards.local") }}
            </label>
            <label class="forward-kind-picker">
              <input v-model="forwardForm.kind" type="radio" value="remote" />{{ t("forwards.remote") }}
            </label>
            <label class="forward-kind-picker">
              <input v-model="forwardForm.kind" type="radio" value="dynamic" />{{ t("forwards.dynamic") }}
            </label>
          </div>
          <div class="forward-form-row forward-form-addresses">
            <label class="forward-field">
              <span>{{ t("forwards.listen") }}</span>
              <span class="forward-field-pair">
                <input
                  v-model="forwardForm.listenHost"
                  :placeholder="t('forwards.listenHostPlaceholder')"
                  :list="hostOptionListId"
                />
                <!-- ip+网卡名同框：datalist 候选 value=可绑定 IP，网卡名作说明
                     文案；手输与点选同一输入框，探测失败自动退化为纯手输。 -->
                <datalist :id="hostOptionListId">
                  <option value="0.0.0.0">{{ t("forwards.allInterfaces") }}</option>
                  <option v-for="iface in interfaces" :key="iface.addr" :value="iface.addr">
                    {{ iface.isLoopback ? t("forwards.loopback") : iface.name }}
                  </option>
                </datalist>
                <input v-model="forwardForm.listenPort" inputmode="numeric" :placeholder="t('forwards.portPlaceholder')" />
              </span>
            </label>
            <label v-if="forwardForm.kind !== 'dynamic'" class="forward-field">
              <span>{{ t("forwards.target") }}</span>
              <span class="forward-field-pair">
                <input v-model="forwardForm.targetHost" :placeholder="t('forwards.targetHostPlaceholder')" />
                <input v-model="forwardForm.targetPort" inputmode="numeric" :placeholder="t('forwards.portPlaceholder')" />
              </span>
            </label>
          </div>
          <p v-if="forwardFormMessage" class="forward-form-error">{{ forwardFormMessage }}</p>
          <label class="forward-remember">
            <input v-model="rememberForward" type="checkbox" />
            {{ t("forwards.remember") }}
          </label>
          <footer>
            <button type="submit" class="primary-button" :disabled="!props.sessionId"><Plus />{{ t("forwards.add") }}</button>
          </footer>
        </form>
      </div>
    </DialogContent>
  </Dialog>
</template>
