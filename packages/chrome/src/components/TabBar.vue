<script setup lang="ts">
import {computed, ref, toRef} from 'vue'
import TabBarOverflow, {type TabOverflowItem} from './TabBarOverflow.vue'
import {useTabBarScroll} from '../composables/useTabBarScroll'

const props = withDefaults(
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

const emit = defineEmits<{
  select: [tabId: string]
}>()

const showOverflow = ref(false)

const {
  tabsScrollRef,
  bindTabRef,
  hasOverflow,
  ensureActiveTabVisible,
} = useTabBarScroll(toRef(props, 'activeTabId'), toRef(props, 'tabsSignature'))

function onOverflowSelect(tabId: string) {
  emit('select', tabId)
  ensureActiveTabVisible('smooth', true)
}

const showOverflowMenu = computed(
  () => props.overflowItems !== undefined && props.overflowItems.length > 0,
)

defineExpose({bindTabRef, ensureActiveTabVisible, tabsScrollRef})
</script>

<template>
  <div class="dw-tab-bar" :class="barClass">
    <div v-if="$slots.pinned" class="dw-tab-pinned">
      <slot name="pinned" :bind-tab-ref="bindTabRef"/>
    </div>

    <div ref="tabsScrollRef" class="dw-tab-scroll dw-scrollbar-hidden">
      <slot :bind-tab-ref="bindTabRef"/>
    </div>

    <slot name="actions"/>

    <TabBarOverflow
        v-if="showOverflowMenu"
        v-model:open="showOverflow"
        :visible="hasOverflow"
        :items="overflowItems!"
        :active-id="activeTabId"
        :title="overflowTitle ?? ''"
        :search-placeholder="overflowSearchPlaceholder"
        @select="onOverflowSelect"
    />
  </div>
</template>
