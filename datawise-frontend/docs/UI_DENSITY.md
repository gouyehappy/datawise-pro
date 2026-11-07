# 界面疏密（Shell UI Density）

**原则：能统一就统一。** 壳层只保留设置里这一项「界面疏密」（紧凑 / 标准 / 宽松），不要为图标、控件高度、Tab 高度、间距再开平行配置。

入口：**设置 → 基本 → 外观 → 界面疏密**。

## 架构

```text
ThemePreferences.uiDensity
        │
        ▼
html[data-ui-density=sm|md|lg]
        │
        ▼
styles/ui-density.css  （skins 之后、ui-text-scale 之前）
覆写 --dw-density-*（轻度 --dw-space-3…6）
        │
        ▼
控件高度 / 工具栏 / Tab 用 var(--dw-density-*) / --dw-control-h*
→ 自动跟随
```

与 **界面文字大小**（`uiTextScale`）正交：一个管字，一个管控件松紧。与 **界面款式**（`uiSkin`）叠加：IDE 已偏紧，compact 增量更小。

## 新组件

1. 控件高度用 `--dw-density-*` / `--dw-control-h*` / `--dw-icon-btn-size-*`。
2. **禁止**再开「图标尺寸 / Tab 高度 / 菜单行高」等设置。
3. 结果网格列密度仍是视图本地，不并入此项。

## 相关

- 因子常量：`shared/config/ui-density.ts`
- 偏好字段：`ThemePreferences.uiDensity`
- 文字档位：`docs/UI_TEXT_SCALE.md`
