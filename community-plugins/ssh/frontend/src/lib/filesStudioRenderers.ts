// Multi-format @file-viewer preset is temporarily disabled for the single-file
// opaque-origin workbench pack: inlining the full renderer stack (~15MB + a
// separate mp4v.worker) broke CEF boot with "Unexpected token '<'".
// Keep the export shape so FileViewerPreview can soft-fail until we ship
// multi-asset UI (ui/assets/*) or inline workers as blob URLs.
//
// FILE_VIEWER_ENABLED gates resolvePreview / PreviewPane: Office/PDF → honest
// unavailable UI; media → native <audio>/<video>; csv/tsv → text.
export const filesStudioRenderers = {
  id: "files-studio-renderers-disabled",
  label: "Files Studio renderer preset (disabled)",
  renderers: [] as unknown[],
};

export const FILE_VIEWER_ENABLED = false;
