<script setup lang="ts">
/**
 * Motty-style right tool rail (~40px): secondary session actions as a quiet icon column.
 * Order / visibility come from X-TOOLBAR prefs (`rightToolRailPrefs`).
 */
import { computed, type Component } from "vue";
import {
  Container,
  Disc,
  Film,
  Gauge,
  History,
  Lock,
  Network,
  Server,
  Sparkles,
  SquareTerminal,
  ListChecks,
} from "@lucide/vue";
import {
  DEFAULT_RIGHT_TOOL_RAIL_PREFS,
  groupedVisibleRailItems,
  type RightRailItemId,
  type RightToolRailPrefs,
} from "../lib/rightToolRailPrefs";

const props = withDefaults(
  defineProps<{
  prefs?: RightToolRailPrefs;
  connected: boolean;
  sessionReady: boolean;
  isJumpServerMode: boolean;
  canRecord: boolean;
  recordingActive: boolean;
  monitorOpen: boolean;
  copilotOpen: boolean;
  dockerOpen: boolean;
  historyOpen: boolean;
  otpOpen: boolean;
  assetsOpen: boolean;
  batchBarOpen: boolean;
  t: (key: string, values?: Record<string, string | number>) => string;
}>(),
  {
    prefs: () => ({
      order: [...DEFAULT_RIGHT_TOOL_RAIL_PREFS.order],
      hidden: [...DEFAULT_RIGHT_TOOL_RAIL_PREFS.hidden],
    }),
  },
);

const emit = defineEmits<{
  (e: "forwards"): void;
  (e: "docker"): void;
  (e: "history"): void;
  (e: "otp"): void;
  (e: "assets"): void;
  (e: "command"): void;
  (e: "batch"): void;
  (e: "record"): void;
  (e: "recordings"): void;
  (e: "monitor"): void;
  (e: "copilot"): void;
}>();

type RailButton = {
  id: RightRailItemId;
  icon: Component;
  title: string;
  active?: boolean;
  disabled?: boolean;
  recording?: boolean;
  emit: Parameters<typeof emit>[0];
};

const groups = computed(() =>
  groupedVisibleRailItems(props.prefs ?? DEFAULT_RIGHT_TOOL_RAIL_PREFS, {
    include: (id) => (id === "assets" ? props.isJumpServerMode : true),
  }),
);

function buttonFor(id: RightRailItemId): RailButton | null {
  switch (id) {
    case "monitor":
      return {
        id,
        icon: Gauge,
        title: props.t("monitorDock.toggle"),
        active: props.monitorOpen,
        disabled: !props.connected,
        emit: "monitor",
      };
    case "copilot":
      return {
        id,
        icon: Sparkles,
        title: props.t("copilot.openDock"),
        active: props.copilotOpen,
        disabled: !props.connected,
        emit: "copilot",
      };
    case "forwards":
      return {
        id,
        icon: Network,
        title: props.t("forwards.title"),
        disabled: !props.sessionReady,
        emit: "forwards",
      };
    case "assets":
      return {
        id,
        icon: Server,
        title: props.t("jumpserver.title"),
        active: props.assetsOpen,
        disabled: !props.connected,
        emit: "assets",
      };
    case "docker":
      return {
        id,
        icon: Container,
        title: props.t("docker.title"),
        active: props.dockerOpen,
        disabled: !props.connected,
        emit: "docker",
      };
    case "history":
      return {
        id,
        icon: History,
        title: props.t("historyPanel.titleShortcut"),
        active: props.historyOpen,
        disabled: !props.connected,
        emit: "history",
      };
    case "otp":
      return {
        id,
        icon: Lock,
        title: props.t("otp.title"),
        active: props.otpOpen,
        emit: "otp",
      };
    case "command":
      return {
        id,
        icon: SquareTerminal,
        title: props.t("commandTitle"),
        disabled: !props.connected,
        emit: "command",
      };
    case "batch":
      return {
        id,
        icon: ListChecks,
        title: props.t("batchSendTitle"),
        active: props.batchBarOpen,
        disabled: !props.connected,
        emit: "batch",
      };
    case "record":
      return {
        id,
        icon: Disc,
        title: props.recordingActive ? props.t("recordingStop") : props.t("recordingTitle"),
        disabled: !props.canRecord,
        recording: props.recordingActive,
        emit: "record",
      };
    case "recordings":
      return {
        id,
        icon: Film,
        title: props.t("recordingsTitle"),
        emit: "recordings",
      };
    default:
      return null;
  }
}

const renderedGroups = computed(() =>
  groups.value
    .map((ids) => ids.map(buttonFor).filter((item): item is RailButton => !!item))
    .filter((group) => group.length > 0),
);
</script>

<template>
  <aside class="right-tool-rail" :aria-label="t('rightRail.aria')">
    <template v-for="(group, groupIndex) in renderedGroups" :key="groupIndex">
      <div v-if="groupIndex > 0" class="right-tool-rail-sep" aria-hidden="true" />
      <div class="right-tool-rail-group">
        <button
          v-for="item in group"
          :key="item.id"
          type="button"
          class="icon-button icon-neutral"
          :class="{ 'is-active': item.active, 'is-recording': item.recording }"
          :title="item.title"
          :aria-pressed="item.active"
          :disabled="item.disabled"
          @click="emit(item.emit)"
        >
          <component :is="item.icon" />
        </button>
      </div>
    </template>
  </aside>
</template>
