<script setup lang="ts">
/**
 * Visual dock-move affordance.
 * - edge: tall pill on panel headers (with the whole header as drag zone)
 * - bar: wide centered handle for workspace float / tool stripe
 * Set `interactive` when this element alone starts the drag (stripe / float top).
 */
import {useI18n} from 'vue-i18n'

const props = withDefaults(
    defineProps<{
        label?: string
        variant?: 'edge' | 'bar'
        /** When false, parent header owns pointerdown (visual cue only). */
        interactive?: boolean
    }>(),
    {
        variant: 'edge',
        interactive: true,
    },
)

const emit = defineEmits<{
    pointerdown: [event: PointerEvent]
}>()

const {t} = useI18n()

const hint = () => props.label ?? t('dock.minimap.dragHint')

function onPointerDown(event: PointerEvent) {
    if (!props.interactive) return
    event.stopPropagation()
    emit('pointerdown', event)
}
</script>

<template>
  <span
      class="dock-drag-grip"
      :class="[
        `dock-drag-grip--${variant}`,
        interactive ? 'is-interactive' : 'is-cue',
      ]"
      :data-dock-grip="interactive ? '' : undefined"
      role="presentation"
      :title="interactive ? hint() : undefined"
      :aria-label="interactive ? hint() : undefined"
      aria-hidden="true"
      @pointerdown="onPointerDown"
  >
    <span class="dock-drag-grip__ridges" aria-hidden="true"/>
  </span>
</template>

<style scoped>
.dock-drag-grip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: color-mix(in srgb, var(--dw-text-muted) 75%, transparent);
  touch-action: none;
  user-select: none;
  transition:
      color 0.14s ease,
      background 0.14s ease,
      box-shadow 0.14s ease,
      transform 0.14s ease;
}

.dock-drag-grip.is-interactive {
  cursor: grab;
}

.dock-drag-grip.is-interactive:active {
  cursor: grabbing;
}

/* Left-edge handle on tool / explorer headers */
.dock-drag-grip--edge {
  width: 16px;
  height: var(--dw-density-sm);
  margin-inline: 0 2px;
  border-radius: var(--dw-control-radius);
}

.dock-drag-grip--edge .dock-drag-grip__ridges {
  width: 4px;
  height: 14px;
  border-radius: var(--dw-radius-xs);
  background:
      repeating-linear-gradient(
          to bottom,
          currentColor 0 2px,
          transparent 2px 4px
      );
  opacity: 0.9;
}

/* Centered float / stripe handle — easy to aim */
.dock-drag-grip--bar {
  width: 44px;
  height: 14px;
  border-radius: var(--dw-radius-pill);
  background: color-mix(in srgb, var(--dw-text) 6%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dw-text) 8%, transparent);
}

.dock-drag-grip--bar .dock-drag-grip__ridges {
  width: 18px;
  height: 4px;
  border-radius: var(--dw-radius-xs);
  background:
      repeating-linear-gradient(
          to right,
          currentColor 0 2px,
          transparent 2px 4px
      );
}

.dock-drag-grip.is-interactive:hover,
:global(.dock-drag-zone:hover) .dock-drag-grip {
  color: var(--dw-text-secondary);
}

.dock-drag-grip--edge.is-interactive:hover,
:global(.dock-drag-zone:hover) .dock-drag-grip--edge {
  background: color-mix(in srgb, var(--dw-text) 10%, transparent);
}

.dock-drag-grip--bar.is-interactive:hover {
  color: var(--dw-text);
  background: color-mix(in srgb, var(--dw-primary) 22%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dw-primary) 35%, transparent);
  transform: scale(1.04);
}

.dock-drag-grip--bar.is-interactive:active {
  transform: scale(0.98);
}
</style>
