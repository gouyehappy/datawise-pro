<script setup lang="ts">
// Motty 风「实时预览」：把当前配色方案 + 字体 + 光标/行高等显示设置渲染成一块
// 静态终端示例，改设置时即时反映。对标 motty/internal/workbench/terminal_find_settings.go
// 的 paintFindPreview 与 font_picker.go 的实时样本思路。
// 纯展示组件：不写任何偏好，只从 props 读已解析好的状态。
import { computed } from "vue";
import { ANSI_COLOR_NAMES, schemeToTerminalTheme, type TerminalColorScheme, type TerminalThemeLike } from "../lib/terminalScheme";
import {
  resolveActiveScheme,
  terminalOptionPatch,
  terminalPaddingVars,
  type TerminalAppearanceSettings,
} from "../lib/terminalAppearance";

const props = defineProps<{
  settings: TerminalAppearanceSettings;
  customSchemes: TerminalColorScheme[];
  hostColorScheme: "light" | "dark";
  /** 已解析的终端字体族 CSS 值（跟随宿主时为 var(--terminal-font-family)）。 */
  fontFamily: string;
  fontSize: number;
  t: (key: string, values?: Record<string, string | number>) => string;
}>();

// 宿主色板下的近似 ANSI 兜底（与 preset-host 色卡一致），跟随宿主时用 CSS 变量取前景/背景。
const HOST_ANSI = [
  "#171717", "#ff615a", "#b1e969", "#e5c07b", "#5da9f6", "#e86aff", "#56b6c2", "#cacaca",
  "#4d4d4c", "#ff8a80", "#c5e878", "#ffe082", "#82b1ff", "#f48fb1", "#80deea", "#f5f5f5",
];

const activeScheme = computed(() => resolveActiveScheme(props.settings, props.customSchemes, props.hostColorScheme));
const theme = computed<TerminalThemeLike | null>(() => activeScheme.value ? schemeToTerminalTheme(activeScheme.value) : null);
const usesSchemeBg = computed(() => !!theme.value && props.settings.backgroundSource === "scheme");

const options = computed(() => terminalOptionPatch(props.settings));
const padding = computed(() => terminalPaddingVars(props.settings));

const surfaceStyle = computed(() => ({
  background: usesSchemeBg.value ? theme.value!.background : "var(--background)",
  color: usesSchemeBg.value ? theme.value!.foreground : "var(--foreground)",
  fontFamily: props.fontFamily,
  fontSize: `${props.fontSize}px`,
  lineHeight: String(options.value.lineHeight),
  letterSpacing: `${options.value.letterSpacing}px`,
  padding: `${padding.value.top ?? "5px"} ${padding.value.right ?? "0px"} ${padding.value.bottom ?? "8px"} ${padding.value.left ?? "10px"}`,
}));

function ansiColor(index: number): string {
  const name = ANSI_COLOR_NAMES[index];
  const fromScheme = theme.value && name ? theme.value[name] : undefined;
  return fromScheme || HOST_ANSI[index] || "#888888";
}

const cursorClass = computed(() => `term-preview-cursor term-preview-cursor--${options.value.cursorStyle}`);
const cursorBlink = computed(() => options.value.cursorBlink);
</script>

<template>
  <div class="term-preview">
    <div class="term-preview-bar">
      <span class="term-preview-dots" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="term-preview-title">{{ t("terminalPreview.title") }}</span>
    </div>
    <div class="term-preview-surface" :style="surfaceStyle" aria-hidden="true">
      <div class="term-preview-line">
        <span :style="{ color: ansiColor(2) }">➜</span>
        <span :style="{ color: ansiColor(4) }"> ~</span>
        <span :style="{ color: ansiColor(6) }"> git</span>
        <span> status</span>
      </div>
      <div class="term-preview-line">On branch <span :style="{ color: ansiColor(2) }">main</span></div>
      <div class="term-preview-line"><span :style="{ color: ansiColor(2) }">✓</span> build passed in 1.2s</div>
      <div class="term-preview-line"><span :style="{ color: ansiColor(1) }">✗</span> 2 tests failed</div>
      <div class="term-preview-line"><span :style="{ color: ansiColor(3) }">warning:</span> deprecated API call</div>
      <div class="term-preview-line"><span :style="{ color: ansiColor(5) }">info</span> <span :style="{ color: ansiColor(7) }">ssh terminal preview</span><span :class="cursorClass" :style="{ background: ansiColor(4), animation: cursorBlink ? 'term-preview-blink 1.1s steps(1, end) infinite' : 'none' }"></span></div>
    </div>
  </div>
</template>

<style scoped>
.term-preview {
  border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
  border-radius: 8px;
  overflow: hidden;
  background: var(--background);
}
.term-preview-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 30px;
  padding: 0 12px;
  background: color-mix(in srgb, var(--muted) 55%, var(--background));
  border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
}
.term-preview-dots { display: inline-flex; gap: 6px; }
.term-preview-dots i { width: 8px; height: 8px; border-radius: 50%; background: var(--muted-foreground); opacity: .45; }
.term-preview-dots i:first-child { background: #ff615a; opacity: .85; }
.term-preview-dots i:nth-child(2) { background: #e5c07b; opacity: .85; }
.term-preview-dots i:nth-child(3) { background: #b1e969; opacity: .85; }
.term-preview-title { font-size: 11px; color: var(--muted-foreground); }
.term-preview-surface {
  min-height: 132px;
  overflow: hidden;
  white-space: pre;
  font-variant-ligatures: none;
}
.term-preview-line { min-height: 1em; }
.term-preview-cursor { display: inline-block; width: 8px; height: 1em; vertical-align: text-bottom; margin-left: 2px; }
.term-preview-cursor--bar { width: 2px; }
.term-preview-cursor--underline { width: 8px; height: 2px; vertical-align: -2px; }
.term-preview-cursor--block { width: 8px; }
@keyframes term-preview-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
</style>
