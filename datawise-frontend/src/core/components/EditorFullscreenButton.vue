<script setup lang="ts">
/** HOST_ONLY — editor fullscreen chrome wired to product i18n / ConsoleToolbarIcon. */
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import IconButton from '@/core/components/IconButton.vue'
import ConsoleToolbarIcon from '@/core/components/ConsoleToolbarIcon.vue'
import EditorFullscreenIcon from '@/core/components/EditorFullscreenIcon.vue'

const props = withDefaults(
    defineProps<{
      active?: boolean
      variant?: 'floating' | 'toolbar'
    }>(),
    {variant: 'floating'},
)

defineEmits<{
  click: []
}>()

const {t} = useI18n()

const title = computed(() =>
    props.active ? t('editor.exitFullscreen') : t('editor.enterFullscreen'),
)
</script>

<template>
  <IconButton
      class="editor-fs-btn"
      :class="props.variant === 'floating' ? 'editor-fs-btn--floating' : 'editor-fs-btn--toolbar'"
      :active="props.active"
      :title="title"
      @click="$emit('click')"
  >
    <ConsoleToolbarIcon
        v-if="props.variant === 'toolbar'"
        name="fullscreen"
        :active="props.active"
    />
    <EditorFullscreenIcon v-else :active="props.active"/>
  </IconButton>
</template>

<style scoped>
.editor-fs-btn--floating {
  position: absolute;
  top: 8px;
  right: 10px;
  z-index: var(--dw-z-raised);
  width: 32px;
  height: var(--dw-tab-height);
  border-radius: var(--dw-control-radius-sm);
  color: var(--dw-text-secondary);
  background: color-mix(in srgb, var(--dw-bg) 88%, transparent);
  border: 1px solid var(--dw-border-light);
  box-shadow: var(--dw-shadow-sm);
  opacity: 0.72;
  backdrop-filter: blur(4px);
  transition: var(--dw-transition-colors), opacity var(--dw-duration) var(--dw-ease), box-shadow var(--dw-duration) var(--dw-ease);
}

.editor-fs-btn--floating:hover {
  opacity: 1;
  color: var(--dw-text);
  background: var(--dw-bg);
  box-shadow: var(--dw-shadow-md);
}

.editor-fs-btn--floating.is-active {
  opacity: 1;
  color: var(--dw-primary);
  background: var(--dw-primary-soft);
  border-color: color-mix(in srgb, var(--dw-primary) 25%, var(--dw-border-light));
}

.editor-fs-btn--floating .editor-fs-icon {
  width: var(--dw-icon-size-md);
  height: var(--dw-icon-size-md);
}

.editor-fs-btn--toolbar.is-active {
  color: var(--dw-primary);
}
</style>
