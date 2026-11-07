# 界面文字大小（Shell UI Text Scale）

**原则：能统一就统一。** 壳层只保留设置里这一项「界面文字大小」（偏小 / 标准 / 偏大 / 自定义 px），不要为菜单、文档、表格、面板再开平行字号配置。

入口：**设置 → 基本 → 外观 → 界面文字大小**。

## 架构

```text
ThemePreferences.uiTextScale (+ uiFontSizePx when custom)
        │
        ▼
html[data-ui-text-scale=sm|md|lg|custom]
  + --dw-font-size (body px)  +  --dw-ui-text-scale (factor vs md=13.5)
        │
        ▼
styles/ui-text-scale.css  --dw-text-* / --mp-* typography = % of --dw-font-size
        │
        ▼
所有壳层 UI 只用 var(--dw-text-*) / var(--dw-font-size-*)
→ 自动跟随，无需新设置项

控件疏密见 `docs/UI_DENSITY.md`（正交；勿再把 density 绑进文字档位）。
```

| 档位 | 正文字号 | `--dw-ui-text-scale` |
|------|----------|----------------------|
| sm | 12px | ≈ 0.889 |
| md | 13.5px | 1 |
| lg | 15px | ≈ 1.111 |
| custom | `uiFontSizePx`（11–18，0.5 步进） | px / 13.5 |

| 层 | 文件 |
|----|------|
| 偏好类型 / 默认值 | `shared/config/theme-presets.ts` |
| 读写 / 归一化 | `shared/config/theme-preferences-storage.ts` |
| 应用 DOM | `features/settings/services/theme.service.ts` |
| 首屏 | `public/theme-boot.js`、桌面 seed |
| 因子 / 范围常量 | `shared/config/ui-text-scale.ts` |
| CSS 档位 | `styles/ui-text-scale.css`（在 skins **之后**加载） |
| 刻度与语义别名 | `styles/variables.css`、`styles/typography.css` |

## 新组件 / 改样式（必须）

1. 字号只用 `var(--dw-text-*)` 或 `var(--dw-font-size-*)`。
2. **禁止**壳层 `font-size: 12px` / `13px` / `0.875rem`；插件也禁止 `calc(Npx * var(--dw-ui-text-scale))`（与自定义正文 px 打架，用 `--dw-text-*` / `% of --dw-font-size`）。
3. **禁止**业务样式再写 `var(--mp-caption|body|sub|section|title…)`（用 `--dw-text-*`）。
4. **禁止**再增加「某某面板字号」「文档字号」等设置项——接到令牌即可。
5. 语义别名优先：

| 场景 | 令牌 |
|------|------|
| 正文 / 默认壳 | `--dw-font-size` / `--dw-text-sm` |
| 控件 / 菜单项 | `--dw-font-size-control` / `--dw-font-size-menu` |
| 菜单说明 / 快捷键 / Tab 次要 | `--dw-font-size-menu-caption` / `--dw-font-size-tab` |
| 标题栏 | `--dw-font-size-titlebar` |
| 角标 / kbd | `--dw-font-size-badge` / `--dw-font-size-kbd` |

## 已跟档（无需额外设置）

| 表面 | 方式 |
|------|------|
| 壳层 CSS | `--dw-text-*` / `--dw-font-size-*` |
| ECharts | `readDocumentUiTextScaleFactor()`（读 live `--dw-ui-text-scale`；`build-chart-option.ts`） |
| 终端默认字号 | `resolveScaledTerminalFontSize()`；SSH 仅在用户 Ctrl+/- 后写绝对覆盖 |
| 插件 iframe | **宿主有配置则跟宿主，否则默认**（见 `community-plugins/docs/PLUGIN_TYPOGRAPHY.md`）。主题桥推送 `--font-sans` / `--dw-font-size` / `--dw-text-*` / `--dw-ui-text-scale`；bootstrap 只补缺省、不覆盖。插件 CSS 只写 `var(--…)`，改设置无需重打包。rem 根 = `calc(var(--dw-font-size) / 0.875)` |

## 仍独立（已有控制，不再平行扩项）

| 表面 | 原因 | 现有控制 |
|------|------|----------|
| Monaco SQL 编辑器 | 等宽写 SQL 密度独立 | 设置 → 代码外观（保持这一项即可） |
| 桌面 CEF zoom | 整页布局缩放 | 桌面缩放快捷键 |
| 锁屏 / Splash | 品牌展示 | 不跟工作台档位 |

SSH 工具栏 A+/A− 写入相对偏移 `dw-cli-ssh-terminal-font-delta`（仍跟界面文字档位）；点「A」或清除该 key 后重新纯跟随壳层。

## JS 侧读取

```ts
import {
  resolveUiTextScaleFactorFromPrefs,
  resolveBodyFontSizePx,
  readDocumentUiTextScaleFactor,
} from '@/shared/config/ui-text-scale'
```

图表、插件桥需要数值时用上述 API（优先 `readDocumentUiTextScaleFactor`），不要维护第二套档位表。`resolveUiTextScaleFactor('custom')` 仅回退为 `1`；自定义请用 `FromPrefs` 或 CSS 变量。
