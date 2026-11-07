<script setup lang="ts">
import {onUnmounted, ref, watch} from 'vue'
import {DwIcon, type DwIconName, type DwIconSize} from '@/core/icons'
import type {CommunityPluginInfo} from '@/shared/api/http/community-plugins'
import {
  communityPluginIconCacheKey,
  communityPluginIconPath,
  loadCommunityPluginIconUrl,
} from '@/features/community-plugin/lib/community-plugin-icon'

export type CommunityPluginIconSize = 'xs' | 'sm' | 'md' | 'lg' | 'tab'

const props = withDefaults(defineProps<{
  plugin?: CommunityPluginInfo | null
  pluginId?: string
  iconPath?: string
  fallback?: DwIconName
  size?: CommunityPluginIconSize
}>(), {
  plugin: null,
  pluginId: '',
  iconPath: 'assets/plugin.svg',
  fallback: 'plugins',
  size: 'md',
})

const src = ref('')
const failed = ref(false)
let loadSeq = 0

function fallbackDwSize(size: CommunityPluginIconSize): DwIconSize {
  if (size === 'tab') return 'tab'
  if (size === 'xs') return 'xs'
  return size
}

async function reload() {
  const seq = ++loadSeq
  src.value = ''
  failed.value = false
  const id = props.plugin?.manifest.id || props.pluginId.trim()
  if (!id) {
    failed.value = true
    return
  }
  const path = props.plugin ? communityPluginIconPath(props.plugin) : props.iconPath
  try {
    const url = await loadCommunityPluginIconUrl(id, path)
    if (seq !== loadSeq) return
    if (!url) {
      failed.value = true
      return
    }
    src.value = url
  } catch {
    if (seq !== loadSeq) return
    failed.value = true
  }
}

watch(
  () => communityPluginIconCacheKey(props.plugin, props.pluginId, props.iconPath),
  () => { void reload() },
  {immediate: true},
)

onUnmounted(() => {
  loadSeq += 1
})
</script>

<template>
  <span
      class="community-plugin-icon"
      :class="[`is-${size}`, {'has-img': !!src && !failed}]"
      aria-hidden="true"
  >
    <img
        v-if="src && !failed"
        class="community-plugin-icon__img"
        :src="src"
        alt=""
        @error="failed = true"
    >
    <DwIcon v-else :name="fallback" :size="fallbackDwSize(size)"/>
  </span>
</template>

<style scoped>
.community-plugin-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  box-sizing: border-box;
}

/* Match DbTypeIcon: brand mark fills the box; no second chrome behind SVG */
.community-plugin-icon.is-tab {
  width: var(--dw-icon-size-tab);
  height: var(--dw-icon-size-tab);
  border-radius: 2px;
}

.community-plugin-icon.is-xs {
  width: var(--dw-icon-size-xs);
  height: var(--dw-icon-size-xs);
  border-radius: 2px;
}

.community-plugin-icon.is-sm {
  width: 20px;
  height: 20px;
  border-radius: var(--dw-control-radius-sm, 5px);
}

.community-plugin-icon.is-md {
  width: 44px;
  height: 44px;
  border-radius: var(--dw-radius-xl, 10px);
}

.community-plugin-icon.is-lg {
  width: 56px;
  height: 56px;
  border-radius: var(--dw-radius-xl, 12px);
}

.community-plugin-icon:not(.has-img) {
  background: color-mix(in srgb, var(--dw-text) 4%, var(--dw-surface));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dw-text) 6%, transparent);
}

.community-plugin-icon.is-tab:not(.has-img),
.community-plugin-icon.is-xs:not(.has-img) {
  background: transparent;
  box-shadow: none;
}

.community-plugin-icon__img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
