/**
 * Minimal Lucide registry for framework / playground.
 * Host apps extend via registerDwIcons() or keep a full product registry.
 */
import type {Component} from 'vue'
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Info,
  Maximize2,
  Minus,
  Moon,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sun,
  Table,
  X,
} from 'lucide-vue-next'

export const DW_ICON_REGISTRY_CORE = {
  search: Search,
  x: X,
  check: Check,
  info: Info,
  plus: Plus,
  minus: Minus,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevrons-left': ChevronsLeft,
  'chevrons-right': ChevronsRight,
  'alert-triangle': AlertTriangle,
  'alert-circle': AlertCircle,
  settings: Settings,
  sun: Sun,
  moon: Moon,
  refresh: RefreshCw,
  table: Table,
  calendar: Calendar,
  pin: Pin,
  copy: Copy,
  'arrow-up': ArrowUp,
  'arrow-down': ArrowDown,
  fullscreen: Maximize2,
} as const satisfies Record<string, Component>

export type DwIconName = keyof typeof DW_ICON_REGISTRY_CORE

const extended: Record<string, Component> = {}

export function registerDwIcons(partial: Record<string, Component>) {
  Object.assign(extended, partial)
}

export function resolveDwIcon(name: string, _opts?: {active?: boolean}): Component {
  return extended[name] ?? DW_ICON_REGISTRY_CORE[name as DwIconName] ?? Info
}

export function isDwIconName(value: string): value is DwIconName {
  return Object.prototype.hasOwnProperty.call(DW_ICON_REGISTRY_CORE, value)
    || Object.prototype.hasOwnProperty.call(extended, value)
}
