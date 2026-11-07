import {computed} from 'vue'
import type {ContextMenuItem} from '@datawise/overlays'
import {useTabCloseContextMenu, type TabCloseHandlers} from './useTabCloseContextMenu'

/** Closable tab bar: context-menu state + close-action dispatch. */
export function useClosableTabMenu<T>(
  getMenuItems: (target: T) => ContextMenuItem[],
  getHandlers: () => TabCloseHandlers<T>,
) {
  const {visible, pos, target, open, close, dispatch} = useTabCloseContextMenu<T>()

  const menuItems = computed(() => {
    if (target.value === null) return []
    return getMenuItems(target.value)
  })

  function onMenuSelect(id: string) {
    dispatch(id, getHandlers())
  }

  function onTabContextMenu(event: MouseEvent, value: T, closable = true) {
    if (!closable) return
    open(event, value)
  }

  return {
    menuVisible: visible,
    menuPos: pos,
    menuItems,
    closeMenu: close,
    onMenuSelect,
    onTabContextMenu,
  }
}
