/**
 * Host re-export — canonical pure masking lives in `@datawise/data-grid`.
 */
export {
  type DataMaskTemplate,
  type ExportColumn,
  type ExportColumnMaskRule,
  type GridExportMaskConfig,
  guessMaskTemplate,
  maskPhone,
  maskEmail,
  maskIdCard,
  maskByTemplate,
  createDefaultExportMaskConfig,
  applyExportMasking,
} from '@datawise/data-grid'
