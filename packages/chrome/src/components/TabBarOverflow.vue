<script setup lang="ts">
import {computed, ref, type Component} from 'vue'
import {DwIcon} from '@datawise/icons'
import {usePopoverEscape} from '../composables/usePopoverEscape'

export interface TabOverflowItem {
  id: string
  label: string
  /** Optional DwIcon name (host may pass product icon keys). */
  icon?: string
}

const props = withDefaults(
  defineProps<{
    open: boolean
    visible: boolean
    items: TabOverflowItem[]
    activeId: string | null
    title: string
    searchPlaceholder?: string
    searchable?: boolean
    /** DwIcon name for the overflow trigger (host registers product icons). */
    menuIcon?: string
    /**
     * Optional resolver for item / menu icons.
     * Return a Vue component or DwIcon name string; falls back to menuIcon / item.icon.
     */
    iconResolver?: (id: string) => Component | string | undefined
  }>(),
  {
    searchable: true,
    menuIcon: 'chevron-right',
  },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  select: [id: string]
}>()

const rootRef = ref<HTMLElement>()
const search = ref('')

const filteredItems = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return props.items
  return props.items.filter((item) => item.label.toLowerCase().includes(q))
})

const resolvedMenuIcon = computed(() => {
  const resolved = props.iconResolver?.('menu')
  if (typeof resolved === 'string' && resolved) return resolved
  return props.menuIcon
})

const menuIconComponent = computed(() => {
  const resolved = props.iconResolver?.('menu')
  return typeof resolved === 'string' || resolved == null ? null : resolved
})

usePopoverEscape(() => props.open, () => emit('update:open', false), {
  containRefs: () => [rootRef.value],
})

function toggle() {
  emit('update:open', !props.open)
}

function select(id: string) {
  emit('select', id)
  emit('update:open', false)
  search.value = ''
}

function itemIconName(item: TabOverflowItem): string | undefined {
  const resolved = props.iconResolver?.(item.id)
  if (typeof resolved === 'string' && resolved) return resolved
  return item.icon
}

function itemIconComponent(item: TabOverflowItem): Component | null {
  const resolved = props.iconResolver?.(item.id)
  return typeof resolved === 'string' || resolved == null ? null : resolved
}
</script>

<template>
  <div
      ref="rootRef"
      class="dw-tab-overflow"
      :class="{ 'dw-tab-overflow--visible': visible }"
  >
    <button
        class="dw-tab-overflow__btn"
        :title="title"
        type="button"
        @click="toggle"
    >
      <component :is="menuIconComponent" v-if="menuIconComponent"/>
      <DwIcon v-else :name="resolvedMenuIcon" size="sm" :stroke-width="2.15"/>
    </button>
    <div v-if="open" class="dw-tab-overflow__menu">
      <input
          v-if="searchable"
          v-model="search"
          class="dw-tab-overflow__search"
          :placeholder="searchPlaceholder"
      />
      <button
          v-for="item in filteredItems"
          :key="item.id"
          class="dw-menu-item dw-tab-overflow__item"
          :class="{ 'is-active': activeId === item.id }"
          type="button"
          @click="select(item.id)"
      >
        <component :is="itemIconComponent(item)" v-if="itemIconComponent(item)"/>
        <DwIcon
            v-else-if="itemIconName(item)"
            :name="itemIconName(item)!"
            size="xs"
        />
        {{ item.label }}
      </button>
    </div>
  </div>
</template>
