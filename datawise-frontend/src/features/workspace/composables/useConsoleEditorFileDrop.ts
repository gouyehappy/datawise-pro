import {
  LOCAL_FILE_ABS_PATH_MIME,
  LOCAL_FILE_PATH_MIME,
  dataTransferHasType,
  readLocalAbsPathFromDataTransfer,
  readLocalFilePathFromDataTransfer,
} from '@/features/local-files/services/local-files-dnd'
import {openLocalWorkspaceFile} from '@/features/local-files/services/open-local-file.service'

export type ConsoleEditorFileDropDeps = {
  insertTextAtCursor: (text: string) => void
}

/** Editor surface: drop opens file; Alt+drop inserts path at cursor. */
export function useConsoleEditorFileDrop(deps: ConsoleEditorFileDropDeps) {
  function onEditorDragOver(event: DragEvent) {
    // Default: open file on drop. Hold Alt to insert path at cursor instead.
    if (event.altKey && dataTransferHasType(event.dataTransfer, LOCAL_FILE_PATH_MIME)) {
      event.preventDefault()
      event.stopPropagation()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      return
    }
    if (!dataTransferHasType(event.dataTransfer, LOCAL_FILE_ABS_PATH_MIME)) return
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }

  function onEditorDrop(event: DragEvent) {
    if (event.altKey) {
      const insertPath = readLocalFilePathFromDataTransfer(event.dataTransfer)
      if (!insertPath) return
      event.preventDefault()
      event.stopPropagation()
      deps.insertTextAtCursor(insertPath)
      return
    }
    const path = readLocalAbsPathFromDataTransfer(event.dataTransfer)
    if (!path) return
    event.preventDefault()
    event.stopPropagation()
    void openLocalWorkspaceFile(path)
  }

  return {onEditorDragOver, onEditorDrop}
}
