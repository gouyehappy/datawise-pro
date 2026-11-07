// 宿主 1.1 主题通道（PluginBridgeTheme）→ 插件 appearance 契约的适配层。
// 宿主在 init 与 env 消息里推送 { appearance, tokens }，tokens 是宿主根节点
// 解析后的 `--color-*` 等 CSS 变量；旧宿主（Host API 1.0）无此字段，调用方
// 按缺失降级走本地规范色板。

const THEME_TOKEN_COLORS = [
  ["background", "--color-background"],
  ["foreground", "--color-foreground"],
  ["muted", "--color-muted"],
  ["mutedForeground", "--color-muted-foreground"],
  ["accent", "--color-accent"],
  ["accentForeground", "--color-accent-foreground"],
  ["border", "--color-border"],
  ["destructive", "--color-destructive"],
] as const;

// These are the existing font tokens bridged by shared/frontend/themeSync.ts.
// Keep this mapping limited to tokens already in the host theme contract; the
// SSH terminal must follow the host mono font rather than inventing a plugin-only
// font setting.
const THEME_TOKEN_FONTS = [
  ["terminal", "--font-mono"],
  ["ui", "--font-sans"],
] as const;

function readPositiveNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number.parseFloat(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

export function isHostPluginTheme(value: unknown): value is DatawisePluginTheme {
  if (typeof value !== "object" || value === null) return false;
  const theme = value as { appearance?: unknown; tokens?: unknown };
  if (theme.appearance !== "light" && theme.appearance !== "dark") return false;
  return theme.tokens === undefined || (typeof theme.tokens === "object" && theme.tokens !== null);
}

// 宿主 SDK 对 env 消息派发 `datawise-plugin-env` CustomEvent，detail 即消息本体。
export function themeFromEnvDetail(detail: unknown): DatawisePluginTheme | null {
  const theme = (detail as { theme?: unknown } | null | undefined)?.theme;
  if (!isHostPluginTheme(theme)) return null;
  return { appearance: theme.appearance, tokens: theme.tokens ?? {} };
}

// 缺失的 token 字段留空，交由 resolveAppearance 按当前方案规范色板补齐。
export function themeToAppearance(theme: DatawisePluginTheme): {
  colorScheme: "light" | "dark";
  colors: Partial<DatawisePluginAppearance["colors"]>;
  terminal?: Partial<DatawisePluginAppearance["terminal"]>;
  ui?: Partial<NonNullable<DatawisePluginAppearance["ui"]>>;
} {
  const tokens = theme.tokens ?? {};
  const colors: Partial<DatawisePluginAppearance["colors"]> = {};
  for (const [key, token] of THEME_TOKEN_COLORS) {
    const value = tokens[token];
    if (typeof value === "string" && value.trim()) colors[key] = value;
  }
  const fonts: {
    terminal?: Partial<DatawisePluginAppearance["terminal"]>;
    ui?: Partial<NonNullable<DatawisePluginAppearance["ui"]>>;
  } = {};
  for (const [target, token] of THEME_TOKEN_FONTS) {
    const value = tokens[token];
    if (typeof value !== "string" || !value.trim()) continue;
    if (target === "terminal") fonts.terminal = { fontFamily: value };
    else fonts.ui = { fontFamily: value };
  }
  // Host shell text scale (Settings → 界面文字大小).
  const textScale = tokens["--dw-ui-text-scale"];
  const uiFontSizeCss = tokens["--dw-font-size"] || tokens["--font-size"];
  const scaleFactor = readPositiveNumber(textScale);
  if (scaleFactor != null) {
    fonts.terminal = { ...(fonts.terminal || {}), fontSize: Math.round(13 * scaleFactor) };
  }
  const uiExtra: { fontFamily?: string; fontSize?: string; textScale?: string; density?: string } = {
    ...(fonts.ui || {}),
  };
  if (typeof textScale === "string" && textScale.trim()) uiExtra.textScale = textScale.trim();
  if (typeof uiFontSizeCss === "string" && uiFontSizeCss.trim()) uiExtra.fontSize = uiFontSizeCss.trim();
  const density = tokens["--dw-ui-density"];
  if (density === "sm" || density === "md" || density === "lg") uiExtra.density = density;
  if (uiExtra.fontFamily || uiExtra.fontSize || uiExtra.textScale || uiExtra.density) {
    fonts.ui = uiExtra;
  }
  return { colorScheme: theme.appearance, colors, ...fonts };
}

export function onHostThemeChange(listener: (theme: DatawisePluginTheme) => void): () => void {
  if (typeof document === "undefined") return () => undefined;
  const handler = (event: Event) => {
    const theme = themeFromEnvDetail((event as CustomEvent).detail);
    if (theme) listener(theme);
  };
  document.addEventListener("datawise-plugin-env", handler);
  return () => document.removeEventListener("datawise-plugin-env", handler);
}
