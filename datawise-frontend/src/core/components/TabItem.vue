<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/chrome` TabItem. */
import {TabItem as PackageTabItem} from '@datawise/chrome'

withDefaults(
  defineProps<{
    tabId: string
    title: string
    active?: boolean
    closable?: boolean
    renamable?: boolean
    renaming?: boolean
    renameSuffix?: string
    renameSuffixOnly?: boolean
    dirty?: boolean
    setRef?: (el: unknown) => void
  }>(),
  {
    renamable: false,
    renaming: false,
    dirty: false,
  },
)

defineEmits<{
  select: []
  close: []
  contextmenu: [event: MouseEvent]
  rename: [title: string]
  'cancel-rename': []
  'request-rename': []
  'pointer-drag-start': [event: PointerEvent]
}>()
</script>

<template>
  <PackageTabItem
      :tab-id="tabId"
      :title="title"
      :active="active"
      :closable="closable"
      :renamable="renamable"
      :renaming="renaming"
      :rename-suffix="renameSuffix"
      :rename-suffix-only="renameSuffixOnly"
      :dirty="dirty"
      :set-ref="setRef"
      @select="$emit('select')"
      @close="$emit('close')"
      @contextmenu="$emit('contextmenu', $event)"
      @rename="$emit('rename', $event)"
      @cancel-rename="$emit('cancel-rename')"
      @request-rename="$emit('request-rename')"
      @pointer-drag-start="$emit('pointer-drag-start', $event)"
  />
</template>
