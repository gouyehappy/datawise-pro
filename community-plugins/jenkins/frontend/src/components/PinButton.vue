<script setup lang="ts">
defineProps<{
  active: boolean
  title?: string
  size?: 'sm' | 'md'
}>()

defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <button
    type="button"
    class="pin-btn"
    :class="{ 'is-on': active, 'pin-btn--md': size === 'md' }"
    :title="title"
    :aria-pressed="active"
    @click.stop="$emit('click', $event)"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true" class="pin-btn__svg">
      <path
        class="pin-btn__star"
        d="M12 2.6l2.75 5.57 6.15.9-4.45 4.33 1.05 6.12L12 16.9l-5.5 2.92 1.05-6.12L3.1 9.07l6.15-.9L12 2.6z"
      />
    </svg>
  </button>
</template>

<style scoped>
.pin-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: color-mix(in srgb, var(--muted) 85%, transparent);
  transition: background .12s ease, color .12s ease, transform .1s ease;
}
.pin-btn--md {
  width: 24px;
  height: 24px;
}
.pin-btn:hover {
  color: #f0c14b;
  background: color-mix(in srgb, #f0c14b 10%, transparent);
}
.pin-btn.is-on {
  color: #f5c542;
}
.pin-btn:active {
  transform: scale(.9);
}
.pin-btn__svg {
  width: 12px;
  height: 12px;
  display: block;
}
.pin-btn--md .pin-btn__svg {
  width: 14px;
  height: 14px;
}
.pin-btn__star {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linejoin: round;
  transition: fill .12s ease;
}
.pin-btn.is-on .pin-btn__star {
  fill: currentColor;
  stroke: color-mix(in srgb, #fff 20%, #f5c542);
}
</style>
