export {default as DwSplitPane} from './components/DwSplitPane.vue'
export {default as ResizeHandle} from './components/ResizeHandle.vue'
export {default as WorkbenchListPage} from './components/WorkbenchListPage.vue'
export {default as DwBrowseToolbar} from './components/DwBrowseToolbar.vue'
export {default as DwToolbarButton} from './components/DwToolbarButton.vue'
export {default as DwWorkbenchFrame} from './components/DwWorkbenchFrame.vue'
export {default as DwFilterBar} from './components/DwFilterBar.vue'
export type {DwFilterOption} from './components/DwFilterBar.vue'

export {default as TabBar} from './components/TabBar.vue'
export {default as TabItem} from './components/TabItem.vue'
export {default as TabAddButton} from './components/TabAddButton.vue'
export {default as TabBarOverflow} from './components/TabBarOverflow.vue'
export {default as TabCloseIcon} from './components/TabCloseIcon.vue'
export type {TabOverflowItem} from './components/TabBarOverflow.vue'

export {default as ModulePageHeader} from './components/ModulePageHeader.vue'
export {default as ModulePageRegions} from './components/ModulePageRegions.vue'
export {default as ModuleHeader} from './components/ModuleHeader.vue'
export {default as ModuleHeroSettingsMenu} from './components/ModuleHeroSettingsMenu.vue'
export type {ModuleHeroMenuItem} from './components/ModuleHeroSettingsMenu.vue'
export {default as DwConsoleToolbar} from './components/DwConsoleToolbar.vue'
export {default as ConsoleToolbarIcon} from './components/ConsoleToolbarIcon.vue'
export {default as DwOverlayScroll} from './components/DwOverlayScroll.vue'
export {default as DwAutohideScroll} from './components/DwAutohideScroll.vue'
export {default as SidePanel} from './components/SidePanel.vue'
export {default as CollapsibleSection} from './components/CollapsibleSection.vue'
export {default as DwTreeToolbar} from './components/DwTreeToolbar.vue'
export {default as SplitHandle} from './components/SplitHandle.vue'
export {default as ResizableTable} from './components/ResizableTable.vue'
export {
  useResizableColumns,
  type ResizableColumnDef,
} from './composables/useResizableColumns'

export {
  DW_SPLIT_RATIO_PRESETS,
  resolveDwSplitRatio,
  widthFromRatio,
  type DwSplitRatio,
  type DwSplitRatioName,
} from './composables/dwSplitRatio'
export {usePersistedSplitWidth} from './composables/usePersistedSplitWidth'
export {useTabBarScroll} from './composables/useTabBarScroll'
export {useClosableTabMenu} from './composables/useClosableTabMenu'
export {
  useTabCloseContextMenu,
  type TabCloseHandlers,
} from './composables/useTabCloseContextMenu'
export {
  usePopoverEscape,
  type UsePopoverEscapeOptions,
} from './composables/usePopoverEscape'

export {
  useOverlayScrollbar,
  type OverlayScrollbarAxis,
} from './composables/useOverlayScrollbar'
export {
  OVERLAY_SB_HIDE_MS,
  OVERLAY_SB_MIN_THUMB_PX,
  OVERLAY_SB_RAIL_PX,
  computeHorizontalThumb,
  computeVerticalThumb,
  overflowCanScroll,
  overlayArmed,
  overlayNeedH,
  overlayNeedV,
  readOverlayScrollBox,
  type OverlayScrollBox,
} from './composables/overlay-scrollbar-metrics'
export {
  createOverlayScrollbarController,
  detachOverlayScrollbar,
  getAttachedOverlayScrollbar,
  isOverlayScrollbarAttached,
  type OverlayScrollbarController,
} from './composables/overlay-scrollbar-controller'
export {attachOverlayScrollbar} from './composables/attachOverlayScrollbar'
export {
  installOverlayScrollbarHosts,
  OVERLAY_SCROLLBAR_HOST_SELECTOR,
  type InstallOverlayScrollbarHostsOptions,
} from './composables/installOverlayScrollbarHosts'

export {
  PanelLoadingShell,
  PanelLoadError,
  createLazyView,
  prefetchLazyLoaders,
  scheduleIdleWarmup,
  type LazyViewLoader,
} from './create-lazy-view'
