<script setup lang="ts">
export type DwResourceListItem = {
  id: string
  label: string
  disabled?: boolean
}

const props = withDefaults(
  defineProps<{
    items: DwResourceListItem[]
    activeId?: string | null
    emptyTitle?: string
  }>(),
  {
    activeId: null,
    emptyTitle: 'No items',
  },
)

const emit = defineEmits<{
  select: [id: string]
}>()
</script>

<template>
  <div class="dw-resource-list">
    <div v-if="$slots.toolbar" class="dw-resource-list__toolbar">
      <slot name="toolbar"/>
    </div>
    <ul v-if="items.length" class="dw-resource-list__body" role="listbox">
      <li v-for="item in items" :key="item.id">
        <button
          type="button"
          class="dw-resource-list__row"
          role="option"
          :class="{ 'is-active': activeId === item.id }"
          :aria-selected="activeId === item.id"
          :disabled="item.disabled"
          @click="emit('select', item.id)"
        >
          <span v-if="$slots.leading" class="dw-resource-list__leading">
            <slot name="leading" :item="item"/>
          </span>
          <span class="dw-resource-list__label">
            <slot name="label" :item="item">{{ item.label }}</slot>
          </span>
          <span v-if="$slots.actions" class="dw-resource-list__actions" @click.stop>
            <slot name="actions" :item="item"/>
          </span>
        </button>
      </li>
    </ul>
    <div v-else class="dw-resource-list__empty">
      <slot name="empty">{{ emptyTitle }}</slot>
    </div>
  </div>
</template>
