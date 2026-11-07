/**
 * Thin host re-export — SoT `@datawise/chrome` create-lazy-view.
 * Locale via `registerUiI18nHost` (`DW_UI_I18N` ← vue-i18n `common.panel*` / `common.reload`).
 */
export {
  PanelLoadingShell,
  PanelLoadError,
  createLazyView,
  prefetchLazyLoaders,
  scheduleIdleWarmup,
  type LazyViewLoader,
} from '@datawise/chrome'
