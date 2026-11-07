import {useContextMenuAnchor} from '@datawise/overlays'

export interface TabCloseHandlers<T> {
  close: (target: T) => void
  closeOthers: (target: T) => void
  closeAll: () => void
  closeLeft?: (target: T) => void
  closeRight?: (target: T) => void
  rename?: (target: T) => void
  copyTitle?: (target: T) => void
  save?: (target: T) => void
  saveMigration?: (target: T) => void
  compareWithPrevious?: (target: T) => void
  'cross-env-compare'?: (target: T) => void
  'suggest-index'?: (target: T) => void
  'codegen-jpa'?: (target: T) => void
  'codegen-mybatis'?: (target: T) => void
  'codegen-typescript'?: (target: T) => void
  'generate-fake-data'?: (target: T) => void
  dissolveGroup?: (target: T) => void
  renameGroup?: (target: T) => void
  floatTab?: (target: T) => void
  dockTab?: (target: T) => void
}

export function useTabCloseContextMenu<T>() {
  const {visible, pos, target, open, close} = useContextMenuAnchor<T>()

  function dispatch(id: string, handlers: TabCloseHandlers<T>) {
    const current = target.value
    if (current === null) return
    if (id === 'close') handlers.close(current)
    if (id === 'close-others') handlers.closeOthers(current)
    if (id === 'close-all') handlers.closeAll()
    if (id === 'close-left') handlers.closeLeft?.(current)
    if (id === 'close-right') handlers.closeRight?.(current)
    if (id === 'rename') handlers.rename?.(current)
    if (id === 'copy-title') handlers.copyTitle?.(current)
    if (id === 'save') handlers.save?.(current)
    if (id === 'save-migration') handlers.saveMigration?.(current)
    if (id === 'compare-previous') handlers.compareWithPrevious?.(current)
    if (id === 'cross-env-compare') handlers['cross-env-compare']?.(current)
    if (id === 'suggest-index') handlers['suggest-index']?.(current)
    if (id === 'codegen-jpa') handlers['codegen-jpa']?.(current)
    if (id === 'codegen-mybatis') handlers['codegen-mybatis']?.(current)
    if (id === 'codegen-typescript') handlers['codegen-typescript']?.(current)
    if (id === 'generate-fake-data') handlers['generate-fake-data']?.(current)
    if (id === 'dissolve-group') handlers.dissolveGroup?.(current)
    if (id === 'rename-group') handlers.renameGroup?.(current)
    if (id === 'float-tab') handlers.floatTab?.(current)
    if (id === 'dock-tab') handlers.dockTab?.(current)
    close()
  }

  return {visible, pos, target, open, close, dispatch}
}
