<!--
  底栏快启：前 2 项名字胶囊 + 其余纯图标；左右竖线可拖调宽度。
-->
<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import ResizeHandle from '@/core/components/ResizeHandle.vue'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import TreeNodeIcon from '@/features/explorer/components/TreeNodeIcon.vue'
import {
    collectWelcomeConnections,
    type WelcomeConnectionRow,
} from '@/features/workspace/services/welcome-main-paths.service'
import {
    readRecentConnectionIds,
    welcomeRecentConnectionsEpoch,
} from '@/features/workspace/services/welcome-recent-connections.service'
import {openWelcomeConnectionPrimary} from '@/features/workspace/services/welcome-open-connection-action.service'

const QUICK_LAUNCH_LIMIT = 10
const NAMED_COUNT = 2

const props = withDefaults(
    defineProps<{
      width: number
      minWidth?: number
      maxWidth?: number
      /** 无路径面包屑时，左侧竖线也可拖（invert 扩宽） */
      showLeadingHandle?: boolean
    }>(),
    {
      minWidth: 72,
      maxWidth: 560,
      showLeadingHandle: false,
    },
)

const emit = defineEmits<{
  'update:width': [value: number]
}>()

const {t} = useI18n()
const explorer = useExplorerStore()

const items = computed(() => {
  void welcomeRecentConnectionsEpoch.value
  return collectWelcomeConnections(
      explorer.tree,
      QUICK_LAUNCH_LIMIT,
      readRecentConnectionIds(),
  )
})

const hasItems = computed(() => items.value.length > 0)

function isNamed(index: number): boolean {
  return index < NAMED_COUNT
}

function itemTitle(item: WelcomeConnectionRow): string {
  const connected = explorer.pooledConnectionIds.has(item.id)
  const status = connected ? ` · ${t('welcome.stats.connected')}` : ''
  const env = item.env ? ` · ${item.env}` : ''
  return `${item.label}${env}${status}`
}

function onOpen(item: WelcomeConnectionRow) {
  void openWelcomeConnectionPrimary({
    connectionId: item.id,
    connectionName: item.label,
    dbType: item.dbType,
  })
}

function onWidthUpdate(value: number) {
  emit('update:width', value)
}
</script>

<template>
  <div
      v-if="hasItems"
      class="status-quick"
      role="toolbar"
      :aria-label="t('status.quickLaunch')"
      data-testid="status-quick-launch"
      :style="{width: `${width}px`}"
  >
    <ResizeHandle
        v-if="showLeadingHandle"
        :model-value="width"
        variant="line"
        invert
        :min="minWidth"
        :max="maxWidth"
        class="status-quick__split status-quick__split--leading"
        @update:model-value="onWidthUpdate"
    />
    <ul class="status-quick__list">
      <li v-for="(item, index) in items" :key="item.id">
        <button
            type="button"
            class="status-quick__btn"
            :class="{
              'is-named': isNamed(index),
              'is-connected': explorer.pooledConnectionIds.has(item.id),
            }"
            :title="itemTitle(item)"
            @click="onOpen(item)"
        >
          <span class="status-quick__glyph">
            <TreeNodeIcon
                type="connection"
                :db-type="item.dbType"
                :plugin-id="item.pluginId"
            />
          </span>
          <span v-if="isNamed(index)" class="status-quick__name">{{ item.label }}</span>
          <i
              v-if="explorer.pooledConnectionIds.has(item.id)"
              class="status-quick__dot"
              aria-hidden="true"
          />
        </button>
      </li>
    </ul>
    <ResizeHandle
        :model-value="width"
        variant="line"
        :min="minWidth"
        :max="maxWidth"
        class="status-quick__split status-quick__split--trailing"
        @update:model-value="onWidthUpdate"
    />
  </div>
</template>

<style scoped>
.status-quick {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  min-width: 0;
  padding: 0 var(--dw-space-3);
}

.status-quick__split {
  position: absolute;
  top: 4px;
  bottom: 4px;
  z-index: 2;
  width: 5px !important;
  height: auto !important;
}

.status-quick__split--leading {
  left: 0;
  transform: translateX(-50%);
}

.status-quick__split--trailing {
  right: 0;
  transform: translateX(50%);
}

.status-quick__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  width: 100%;
  overflow: hidden;
}

.status-quick__btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: calc(var(--dw-control-radius-sm) + 1px);
  background: transparent;
  color: var(--dw-text-secondary);
  cursor: pointer;
  transition:
      background var(--dw-duration-fast) var(--dw-ease),
      color var(--dw-duration-fast) var(--dw-ease);
}

.status-quick__btn.is-named {
  width: auto;
  max-width: 9.5rem;
  gap: var(--dw-space-2);
  padding: 0 var(--dw-space-3) 0 var(--dw-space-2);
  background: color-mix(in srgb, var(--dw-text) 5%, transparent);
}

.status-quick__btn:hover {
  background: color-mix(in srgb, var(--dw-text) 9%, transparent);
  color: var(--dw-text);
}

.status-quick__btn.is-connected {
  background: color-mix(in srgb, var(--dw-success) 12%, transparent);
}

.status-quick__btn.is-connected:hover {
  background: color-mix(in srgb, var(--dw-success) 18%, transparent);
}

.status-quick__glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
}

.status-quick__glyph :deep(svg),
.status-quick__glyph :deep(img) {
  width: 16px;
  height: 16px;
}

.status-quick__name {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 7rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--dw-text-2xs);
  font-weight: 550;
  line-height: 1;
}

.status-quick__dot {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--dw-success, #3ecf8e);
  box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--dw-bg-chrome) 88%, transparent);
}

.status-quick__btn.is-named .status-quick__dot {
  right: 4px;
  bottom: 3px;
}
</style>
