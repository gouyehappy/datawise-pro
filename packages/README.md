# DataWise UI Framework packages

Source of truth for architecture, package boundaries, and roadmap:

→ [`docs/UI_FRAMEWORK.md`](../docs/UI_FRAMEWORK.md)

## Packages

| Package | Name | Role |
|---------|------|------|
| `tokens/` | `@datawise/tokens` | CSS design tokens; core `index.css` = variables/radii/typography/space/surface. Skins / density / text-scale are **separate** entries (host loads after feature CSS). |
| `theme/` | `@datawise/theme` | Pure theme apply + Host Adapter inject Symbols |
| `icons/` | `@datawise/icons` | `DwIcon` (Lucide core) + `DwPhIcon` (Phosphor) |
| `ui/` | `@datawise/ui` | Atoms + patterns (`DwButton`, `EmptyState`, TransferList, …) + `useDwI18n` |
| `overlays/` | `@datawise/overlays` | Modal / FormDialog / Confirm / ContextMenu / Prompt / Unsaved / Pinia-free toast |
| `chrome/` | `@datawise/chrome` | TabBar / ModulePage* / OverlayScroll / ConsoleToolbar / BrowseToolbar / Split / Workbench |
| `data-grid/` | `@datawise/data-grid` | Portable API：SPI + `DwDataGrid` / Table / Export & CellDetail / hooks；SQL `DataGrid.vue` **宿主专用** |
| `graph-canvas/` | `@datawise/graph-canvas` | Vue Flow canvas + node shell + `./er`；宿主深路径副本保留 |
| `code/` | `@datawise/code` | Monaco shell + `EditorSettingsPort`；`DwMonacoEditor` / `DwCodeViewer` / `DwLogViewer` / `DwFindBar` |
| `shortcuts/` | `@datawise/shortcuts` | Binding engine + registry / scope / local handlers / execute pipeline；产品定义宿主注册 |
| `framework/` | `@datawise/framework` | 聚合导出；重型可选 `/data-grid` · `/graph-canvas` · `/code` · `/shortcuts` |
| `playground/` | `@datawise/playground` | Vite teaching demo |

## Dependency DAG (downward only)

```text
@datawise/tokens
       │
@datawise/theme
       │
@datawise/icons
       │
@datawise/ui  ←── @datawise/overlays
       │              │
       └──────┬───────┘
              ▼
       @datawise/chrome
              │
     ┌────────┼────────┬────────┬──────────┐
     ▼        ▼        ▼        ▼          ▼
 data-grid  graph-canvas  code  shortcuts  framework
```

**Boundary rules (enforced by `npm run audit:packages-boundary`):**

- No `@/features/`, `@/shared/api`, `@/shared/connection`
- No `defineStore(`
- No `useI18n(` outside `*i18n-adapter*` files
- `@datawise/tokens` never depends on Vue

## Host CSS order

```css
@import '@datawise/tokens/index.css';   /* core only */
/* … feature / atom CSS … */
@import '@datawise/tokens/skins/index.css';
@import '@datawise/tokens/ui-density.css';
@import '@datawise/tokens/ui-text-scale.css';
/* plugins … */
```

## Playground

```bash
npm install --prefix packages/playground
npm run dev --prefix packages/playground
```
