# 社区插件字体 / 字号契约

**原则：**

1. **宿主有配置就跟宿主；没有就用默认**（改设置不必重打包）。
2. **插件内字号只有一个基准**：宿主下发的 `--dw-font-size`（正文）。
3. **要小一点 / 大一点 = 对正文乘百分比**，禁止再写死 `12px` / `11px`。

## 谁负责什么

| 层 | 职责 |
|----|------|
| 宿主 Settings（界面字体 / 界面文字大小） | 写入 `--dw-font`、`--dw-font-size`、`--dw-ui-text-scale` |
| `collectPluginHostTheme` | 有配置则转发字体/正文；缺省填 iframe 安全默认 |
| `workbench-bridge-bootstrap.js` | 正文用宿主值；**在 iframe 内把 `--dw-text-*` 重写为正文的百分比**；注入 body 基线 |
| 插件 CSS | 正文 `var(--dw-font-size)`；次要 `var(--dw-text-xs)` 等（已是百分比） |

宿主改「界面文字大小」→ 正文变 → 所有 `* 0.85` 等自动跟着变，**无需** `package.mjs`。

> 沙箱 iframe 看不到宿主 `@font-face`。宿主字体栈须自带系统回退。禁止硬编码 Inter / Outfit / DM Sans。

## 字号梯级（iframe 内，相对正文）

| Token | 定义 | 用途 |
|-------|------|------|
| `--dw-font-size` / `--fs` / `--dw-text-sm` | 正文（宿主或默认） | 列表、按钮、主文案 |
| `--dw-text-xs` / `--fs-sm` | `calc(var(--dw-font-size) * 0.85)` | 次要说明、表头、辅助 |
| `--dw-text-2xs` | `calc(var(--dw-font-size) * 0.75)` | 角标、极小标签 |
| `--dw-text-md` | `calc(var(--dw-font-size) * 1.08)` | 略强调 |
| `--dw-text-lg` | `calc(var(--dw-font-size) * 1.15)` | 小标题 |
| `--dw-text-xl` | `calc(var(--dw-font-size) * 1.25)` | 标题 |

也可直接写：`font-size: calc(var(--dw-font-size) * 0.9);`（少用；优先用上表 token）。

## 插件 MUST

```css
/* 推荐：shared/plugin-typography.css */
:root {
  --sans: var(--font-sans, var(--plugin-font-sans, system-ui, sans-serif));
  --mono: var(--font-mono, var(--plugin-font-mono, ui-monospace, monospace));
  --fs: var(--dw-font-size);
  --fs-sm: var(--dw-text-xs);
}
html, body, #root, #app { font-family: var(--sans); }
body, #root, #app { font-size: var(--fs); }

.row { font-size: var(--dw-font-size); }      /* 主体 */
.hint { font-size: var(--dw-text-xs); }       /* 小一点 = 85% */
.badge { font-size: var(--dw-text-2xs); }     /* 更小 = 75% */
.title { font-size: var(--dw-text-lg); }      /* 大一点 = 115% */
```

## 插件 MUST NOT

- 裸 `font-size: 12px` / `calc(12px * var(--dw-ui-text-scale))`（与正文脱钩）
- 在 `:root` 把 `--dw-text-*` / `--dw-font-size` **写死成 px**
- 硬编码品牌字体；等宽用 `var(--font-mono)`
- 主题应用后再 JS 写死 `--font-sans`（本地偏好须 compose：`"'Maple Mono', var(--font-sans)"`）

## 何时才需要重打包

| 改动 | 要重打包？ |
|------|------------|
| 宿主改字体 / 界面文字大小 | **否** |
| 调 bootstrap 百分比系数 | **否**（重启宿主） |
| 插件 CSS 已用 token | **否** |
| 插件仍有硬编码 px | **是**（先改成 token） |

参考：`shared/plugin-typography.css` · `pluginHostBridge.ts` · `workbench-bridge-bootstrap.js`。

遗留硬编码字号批量改写：`node community-plugins/scripts/scale-plugin-font-sizes.mjs [--dry-run] [plugin…]`。
