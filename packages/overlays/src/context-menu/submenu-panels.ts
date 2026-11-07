import type {Component} from 'vue'

const panels = new Map<string, Component>()

export function registerContextMenuSubmenuPanel(id: string, component: Component) {
  panels.set(id, component)
}

export function resolveContextMenuSubmenuPanel(id: string | undefined): Component | null {
  if (!id) return null
  return panels.get(id) ?? null
}
