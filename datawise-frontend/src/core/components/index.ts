/**
 * 可复用 UI 组件统一导出
 *
 * Overlay 内核：AppModal / AppDrawer / AppPalette = Reka UI Dialog + Dw（modals.css）皮肤；业务勿直接依赖 reka-ui。
 */
export {default as PromptDialog} from './PromptDialog.vue'
export {default as ConfirmDialog} from './ConfirmDialog.vue'
export {default as AppConfirmHost} from './AppConfirmHost.vue'
export {default as PanelErrorBoundary} from './PanelErrorBoundary.vue'
export {default as UnsavedChangesDialog} from './UnsavedChangesDialog.vue'
export {askAppConfirm, setAppConfirmHandler} from '@/core/services/app-confirm.service'
export {default as AppModal} from './AppModal.vue'
export {default as AppPalette} from './AppPalette.vue'
export {default as AppDrawer} from './AppDrawer.vue'
export {default as FormField} from './FormField.vue'
export {default as DwInlineAlert} from './DwInlineAlert.vue'
export {default as DwActionFeedback} from './DwActionFeedback.vue'
export {default as DwConfirmAlert} from './DwConfirmAlert.vue'
export {default as DwPanelState} from './DwPanelState.vue'
export {default as DwOverlayScroll} from './DwOverlayScroll.vue'
/** @deprecated 使用 DwOverlayScroll */
export {default as DwAutohideScroll} from './DwAutohideScroll.vue'
export {default as DwLogViewer} from './DwLogViewer.vue'
export {default as DwFindBar} from './DwFindBar.vue'
export {default as DwCodeViewer} from './DwCodeViewer.vue'
export {PanelLoadingShell, PanelLoadError} from '@/core/registry/create-lazy-view'
export {default as ModalActions} from './ModalActions.vue'
export {default as ModuleHeader} from './ModuleHeader.vue'
export {default as ModulePageHeader} from './ModulePageHeader.vue'
export {default as ModulePageRegions} from './ModulePageRegions.vue'
export {default as WorkbenchListPage} from './WorkbenchListPage.vue'
export {default as DwSplitPane} from './DwSplitPane.vue'
export type {DwSplitRatio, DwSplitRatioName} from '@/core/composables/dwSplitRatio'
export {DW_SPLIT_RATIO_PRESETS, resolveDwSplitRatio} from '@/core/composables/dwSplitRatio'
export {default as ModuleHeroSettingsMenu} from './ModuleHeroSettingsMenu.vue'
export {default as MpJourneyStrip} from './MpJourneyStrip.vue'
export type {MpJourneyAction, MpJourneyNoteAction} from './MpJourneyStrip.vue'
export type {ModuleHeroMenuItem} from './ModuleHeroSettingsMenu.vue'
export {default as SearchInput} from './SearchInput.vue'
export {default as DwSegment} from './DwSegment.vue'
export type {DwSegmentTab} from './DwSegment.vue'
export {default as DwTreeToolbar} from './DwTreeToolbar.vue'
export {default as DwConsoleToolbar} from './DwConsoleToolbar.vue'
export {default as SidePanel} from './SidePanel.vue'
export {default as TagChip} from './TagChip.vue'
export {default as SettingsSelect} from './SettingsSelect.vue'
export {default as DwSelect} from './DwSelect.vue'
export {default as DwSearchablePopup} from './DwSearchablePopup.vue'
export type {DwSearchablePopupOption} from './DwSearchablePopup.vue'
export {default as DwMultiSelect} from './DwMultiSelect.vue'
export type {SelectOption} from './select.types'
export {default as SettingsSwitch} from './SettingsSwitch.vue'
export {default as CollapsibleSection} from './CollapsibleSection.vue'
export {IconButton} from '@datawise/ui'
export {default as CollapseButton} from './CollapseButton.vue'
export {default as DbTypeIcon} from './DbTypeIcon.vue'
export {default as AiIcon} from './AiIcon.vue'
export {DwIcon} from '@/core/icons'
export {
  ContextMenu,
  ContextMenuHost,
  ContextMenuHost as ContextMenuAnchor,
  ContextMenuIcon,
} from '@/core/context-menu'
export {default as TabBar} from './TabBar.vue'
export {default as TabItem} from './TabItem.vue'
export {default as TabAddButton} from './TabAddButton.vue'
export {default as TabBarOverflow} from './TabBarOverflow.vue'
export {default as AppToast} from './AppToast.vue'
export {default as DwDataGrid} from '@/core/data-grid/components/DwDataGrid.vue'
export type {DwDataGridColumn, DwDataGridLabels, DwDataGridRowKey} from '@datawise/data-grid'
export {
    defaultDwDataGridFilter,
    columnKeyFilterPredicate,
    resolveDwDataGridRowKey,
    useDwDataGridState,
} from '@datawise/data-grid'
export {
    StatusPill,
    EmptyState,
    SectionHeader,
    ProgressBar,
    DwButton,
    DwInput,
    DwInputAction,
    DwSecretInput,
    DwCheckbox,
    DwRadioGroup,
    TableCellInput,
    DwCard,
    DwEditableChip,
} from './ui'
export type {RadioOption} from './ui'

/** Framework packages — new Phase 3/4/7 components (host gradually adopts) */
export {
    DwFormDialog,
} from '@datawise/overlays'
export {
    DwBrowseToolbar,
    DwToolbarButton,
    DwWorkbenchFrame,
    DwFilterBar,
} from '@datawise/chrome'
export {
    DwTransferList,
    DwResourceList,
    DwMarketCard,
    DwStatusBadge,
    DwSettingsSection,
} from '@datawise/ui'
