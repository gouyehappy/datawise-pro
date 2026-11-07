<!-- 侧栏「数据库」收起后悬停弹出的临时资源树 -->
<script setup lang="ts">
import {onMounted, onUnmounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import DatabaseExplorer from '@/features/explorer/components/DatabaseExplorer.vue'
import {useExplorerStore} from '@/features/explorer/stores/explorer'

const props = defineProps<{
  /** 侧栏数据库按钮或其包裹节点，用于定位 */
  anchor: HTMLElement | null
}>()

const emit = defineEmits<{
  dismiss: []
  pin: []
}>()

const {t} = useI18n()
const explorer = useExplorerStore()
const rootRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})

function updatePosition() {
  const anchor = props.anchor
  if (!anchor) return
  const rail = anchor.closest('.tool-stripe--left') as HTMLElement | null
  const rect = (rail ?? anchor).getBoundingClientRect()
  const width = Math.max(220, explorer.width || 248)
  panelStyle.value = {
    top: `${Math.round(rect.top)}px`,
    left: `${Math.round(rect.right)}px`,
    width: `${width}px`,
    height: `${Math.round(rect.height)}px`,
  }
}

watch(
  () => [props.anchor, explorer.width] as const,
  () => updatePosition(),
  {immediate: true},
)

onMounted(() => {
  updatePosition()
  window.addEventListener('resize', updatePosition)
})

onUnmounted(() => {
  window.removeEventListener('resize', updatePosition)
})

defineExpose({
  rootEl: rootRef,
  containsNode(target: Node): boolean {
    return rootRef.value?.contains(target) ?? false
  },
})
</script>

<template>
  <div
      ref="rootRef"
      class="explorer-rail-flyout"
      role="dialog"
      :aria-label="t('explorer.title')"
      :style="panelStyle"
      @click.stop
  >
    <!-- 与侧栏无缝衔接的隐形桥，避免移入浮层时穿过空隙误关 -->
    <div class="explorer-rail-flyout__bridge" aria-hidden="true"/>
    <div class="explorer-rail-flyout__panel">
      <DatabaseExplorer
          variant="flyout"
          @dismiss="emit('dismiss')"
          @pin="emit('pin')"
      />
    </div>
  </div>
</template>

<style scoped>
.explorer-rail-flyout {
  position: fixed;
  z-index: var(--dw-z-popover);
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.explorer-rail-flyout__bridge {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -10px;
  width: 10px;
}

.explorer-rail-flyout__panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--dw-panel-border, var(--dw-border));
  box-shadow:
      6px 0 24px color-mix(in srgb, #000 28%, transparent),
      1px 0 0 color-mix(in srgb, var(--dw-text) 6%, transparent);
  background: var(--dw-bg-panel, var(--dw-surface));
  transform-origin: left center;
}

.explorer-rail-flyout__panel :deep(.explorer) {
  height: 100%;
}
</style>
