<script setup lang="ts">
/**
 * T-AI-1：会话模式 + 绑定命名空间（焦点变化不改写绑定）。
 * variant=inline → 嵌在 ModuleHeader；panel → 抽屉等独立条。
 */
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwSegment} from '@/core/components'
import type {DwSegmentTab} from '@/core/components'
import type {AiChatMode, AiConversationBinding} from '@/features/ai/types/session'

const props = withDefaults(
  defineProps<{
    binding?: AiConversationBinding | null
    mode: AiChatMode
    variant?: 'inline' | 'panel'
  }>(),
  {variant: 'panel'},
)

const emit = defineEmits<{
  'update:mode': [AiChatMode]
  'new-from-focus': []
}>()

const {t} = useI18n()

const modeTabs = computed<DwSegmentTab[]>(() => [
  {id: 'ask', label: t('ai.binding.ask')},
  {id: 'agent', label: t('ai.binding.agent')},
])

const bound = computed(() => Boolean(props.binding?.connectionId))

const connectionPrimary = computed(() => {
  const b = props.binding
  if (!b?.connectionId) return t('ai.binding.unbound')
  return b.connectionName || b.connectionId
})

const connectionSecondary = computed(() => {
  const b = props.binding
  if (!b?.connectionId) return ''
  return [b.database, b.schema].filter(Boolean).join(' · ')
})

const bindingTitle = computed(() => {
  const parts = [connectionPrimary.value, connectionSecondary.value].filter(Boolean)
  return parts.join(' / ')
})

function onModeUpdate(id: string) {
  if (id === 'ask' || id === 'agent') emit('update:mode', id)
}
</script>

<template>
  <div
      class="ai-binding-bar"
      :class="`ai-binding-bar--${variant}`"
      role="region"
      :aria-label="t('ai.binding.barAria')"
  >
    <DwSegment
        size="sm"
        look="pill"
        role="radiogroup"
        :tabs="modeTabs"
        :model-value="mode"
        :aria-label="t('ai.binding.modeAria')"
        @update:model-value="onModeUpdate"
    />

    <span class="ai-binding-bar__meta" :title="bindingTitle">
      <span class="ai-binding-bar__dot" aria-hidden="true"/>
      <span class="ai-binding-bar__conn" :class="{'is-empty': !bound}">
        {{ connectionPrimary }}
      </span>
      <span v-if="connectionSecondary" class="ai-binding-bar__db">
        {{ connectionSecondary }}
      </span>
    </span>

    <button
        type="button"
        class="ai-binding-bar__action"
        :title="t('ai.binding.newFromFocusHint')"
        @click="emit('new-from-focus')"
    >
      {{ t('ai.binding.newFromFocus') }}
    </button>
  </div>
</template>

<style scoped>
.ai-binding-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  width: 100%;
}

.ai-binding-bar--panel {
  flex-shrink: 0;
  padding: 8px 12px;
  border-bottom: 1px solid var(--dw-border-light);
  background: color-mix(in srgb, var(--dw-bg-panel) 80%, transparent);
}

.ai-binding-bar--inline {
  padding: 0;
}

.ai-binding-bar__meta {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  flex: 1;
  font-size: var(--dw-text-xs);
  line-height: 1.3;
  color: var(--dw-text-muted);
}

.ai-binding-bar__dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--dw-border);
  flex-shrink: 0;
  align-self: center;
}

.ai-binding-bar__conn {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dw-text);
  font-weight: 500;
}

.ai-binding-bar__conn.is-empty {
  color: var(--dw-text-muted);
  font-weight: 400;
}

.ai-binding-bar__db {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-binding-bar__action {
  flex-shrink: 0;
  margin-left: auto;
  height: 26px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--dw-control-radius-sm, 6px);
  background: transparent;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  cursor: pointer;
}

.ai-binding-bar__action:hover {
  color: var(--dw-primary);
  background: color-mix(in srgb, var(--dw-primary) 8%, transparent);
}
</style>
