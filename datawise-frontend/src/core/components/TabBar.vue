<script setup lang="ts">
/**
 * Thin host wrapper — SoT `@datawise/chrome` TabBar.
 * Forwards expose: bindTabRef / ensureActiveTabVisible / tabsScrollRef.
 */
import {ref} from 'vue'
import {TabBar as PackageTabBar, type TabOverflowItem} from '@datawise/chrome'

withDefaults(
  defineProps<{
    activeTabId: string | null
    tabsSignature?: string
    overflowItems?: TabOverflowItem[]
    overflowTitle?: string
    overflowSearchPlaceholder?: string
    barClass?: string
  }>(),
  {tabsSignature: ''},
)

defineEmits<{
  select: [tabId: string]
}>()

const inner = ref<{
  bindTabRef: (el: unknown) => void
  ensureActiveTabVisible: (behavior?: ScrollBehavior, force?: boolean) => void
  tabsScrollRef: HTMLElement | null
} | null>(null)

defineExpose({
  bindTabRef: (el: unknown) => inner.value?.bindTabRef(el),
  ensureActiveTabVisible: (behavior?: ScrollBehavior, force?: boolean) =>
    inner.value?.ensureActiveTabVisible(behavior, force),
  get tabsScrollRef() {
    return inner.value?.tabsScrollRef ?? null
  },
})
</script>

<template>
  <PackageTabBar
      ref="inner"
      :active-tab-id="activeTabId"
      :tabs-signature="tabsSignature"
      :overflow-items="overflowItems"
      :overflow-title="overflowTitle"
      :overflow-search-placeholder="overflowSearchPlaceholder"
      :bar-class="barClass"
      @select="$emit('select', $event)"
  >
    <template v-if="$slots.pinned" #pinned="slotProps">
      <slot name="pinned" v-bind="slotProps"/>
    </template>
    <template #default="slotProps">
      <slot v-bind="slotProps"/>
    </template>
    <template v-if="$slots.actions" #actions>
      <slot name="actions"/>
    </template>
  </PackageTabBar>
</template>
