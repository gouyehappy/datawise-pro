import {ref} from 'vue'

/** Right-click / popup menu anchor: position, visibility, optional target. */
export function useContextMenuAnchor<T = unknown>() {
  const visible = ref(false)
  const pos = ref({x: 0, y: 0})
  const target = ref<T | null>(null)

  function openAt(x: number, y: number, value: T | null = null) {
    pos.value = {x, y}
    target.value = value
    visible.value = true
  }

  function open(event: MouseEvent, value: T | null = null) {
    event.preventDefault()
    openAt(event.clientX, event.clientY, value)
  }

  function close() {
    visible.value = false
    target.value = null
  }

  return {visible, pos, target, open, openAt, close}
}
