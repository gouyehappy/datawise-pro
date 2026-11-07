import {nextTick, onMounted, onUnmounted, ref, watch, type Ref} from 'vue'

export function useTabBarScroll(activeTabId: Ref<string | null>, tabsSignature?: Ref<string>) {
  const tabsScrollRef = ref<HTMLElement>()
  const tabRefs = new Map<string, HTMLButtonElement>()
  const hasOverflow = ref(false)

  function bindTabRef(id: string) {
    return (el: unknown) => {
      if (el instanceof HTMLButtonElement) tabRefs.set(id, el)
      else tabRefs.delete(id)
    }
  }

  function getTabElement(id: string): HTMLElement | null {
    return tabRefs.get(id)
      ?? tabsScrollRef.value?.querySelector<HTMLElement>(`[data-tab-id="${id}"]`)
      ?? null
  }

  function scrollTabIntoView(
    tabId: string,
    behavior: ScrollBehavior = 'smooth',
    align: 'start' | 'center' = 'start',
  ) {
    const scroll = tabsScrollRef.value
    if (!scroll) return false

    const tab = getTabElement(tabId)
    if (!tab || !scroll.contains(tab)) return false

    const padding = 8
    const scrollRect = scroll.getBoundingClientRect()
    const tabRect = tab.getBoundingClientRect()

    if (align === 'center') {
      const tabCenter = tabRect.left + tabRect.width / 2
      const scrollCenter = scrollRect.left + scrollRect.width / 2
      scroll.scrollBy({left: tabCenter - scrollCenter, behavior})
      return true
    }

    let delta = 0
    if (tabRect.left < scrollRect.left + padding) {
      delta = tabRect.left - scrollRect.left - padding
    } else if (tabRect.right > scrollRect.right - padding) {
      delta = tabRect.right - scrollRect.right + padding
    }

    if (delta !== 0) {
      scroll.scrollBy({left: delta, behavior})
    }

    return delta !== 0
  }

  function isTabFullyVisible(tabId: string): boolean {
    const scroll = tabsScrollRef.value
    const tab = getTabElement(tabId)
    if (!scroll || !tab) return false
    // Pinned tabs live outside the scroll rail and are always on-screen.
    if (!scroll.contains(tab)) return true

    const padding = 8
    const scrollRect = scroll.getBoundingClientRect()
    const tabRect = tab.getBoundingClientRect()
    return tabRect.left >= scrollRect.left + padding && tabRect.right <= scrollRect.right - padding
  }

  function scrollActiveTabIntoView(behavior: ScrollBehavior = 'smooth', forceCenter = false) {
    const id = activeTabId.value
    if (!id) return

    if (forceCenter) {
      scrollTabIntoView(id, behavior, 'center')
      return
    }

    scrollTabIntoView(id, behavior, 'start')

    if (!isTabFullyVisible(id)) {
      scrollTabIntoView(id, behavior, 'center')
    }
  }

  function updateOverflowState() {
    const scroll = tabsScrollRef.value
    if (!scroll) return
    hasOverflow.value = scroll.scrollWidth > scroll.clientWidth + 1
  }

  function ensureActiveTabVisible(behavior: ScrollBehavior = 'smooth', forceCenter = false) {
    nextTick(() => {
      requestAnimationFrame(() => {
        scrollActiveTabIntoView(behavior, forceCenter)
        requestAnimationFrame(() => {
          if (activeTabId.value && !isTabFullyVisible(activeTabId.value)) {
            scrollActiveTabIntoView('auto', true)
          }
          updateOverflowState()
        })
      })
    })
  }

  let resizeObserver: ResizeObserver | undefined

  onMounted(() => {
    const scroll = tabsScrollRef.value
    if (!scroll) return

    resizeObserver = new ResizeObserver(() => {
      updateOverflowState()
      scrollActiveTabIntoView('auto')
    })
    resizeObserver.observe(scroll)
    ensureActiveTabVisible('auto')
  })

  onUnmounted(() => {
    resizeObserver?.disconnect()
  })

  watch(activeTabId, () => {
    ensureActiveTabVisible()
  })

  if (tabsSignature) {
    watch(tabsSignature, () => {
      ensureActiveTabVisible('auto')
    })
  }

  return {
    tabsScrollRef,
    bindTabRef,
    hasOverflow,
    ensureActiveTabVisible,
    updateOverflowState,
  }
}
