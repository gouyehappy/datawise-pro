<script setup lang="ts">
/**
 * Thin host wrapper — SoT `@datawise/chrome` TabBarOverflow.
 * Default menu icon from explorer product map (host-only).
 */
import {type Component} from 'vue'
import {TabBarOverflow as PackageTabBarOverflow, type TabOverflowItem} from '@datawise/chrome'
import {EXPLORER_ICONS} from '@/shared/explorer/explorer-icons'

export type {TabOverflowItem}

const open = defineModel<boolean>('open', {required: true})

withDefaults(
  defineProps<{
    visible: boolean
    items: TabOverflowItem[]
    activeId: string | null
    title: string
    searchPlaceholder?: string
    searchable?: boolean
    menuIcon?: string
    iconResolver?: (id: string) => Component | string | undefined
  }>(),
  {
    searchable: true,
    menuIcon: EXPLORER_ICONS.menuArrow,
  },
)

defineEmits<{
  select: [id: string]
}>()
</script>

<template>
  <PackageTabBarOverflow
      v-model:open="open"
      :visible="visible"
      :items="items"
      :active-id="activeId"
      :title="title"
      :search-placeholder="searchPlaceholder"
      :searchable="searchable"
      :menu-icon="menuIcon"
      :icon-resolver="iconResolver"
      @select="$emit('select', $event)"
  />
</template>
