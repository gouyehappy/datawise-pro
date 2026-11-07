<script setup lang="ts">
import brandLogoSvg from '@/assets/brand-logo.svg?raw'

withDefaults(
    defineProps<{
      size?: 'xs' | 'sm' | 'md' | 'lg' | 'titlebar'
    }>(),
    {size: 'sm'},
)
</script>

<template>
  <span
      class="app-brand-logo"
      :class="`app-brand-logo--${size}`"
      aria-hidden="true"
      v-html="brandLogoSvg"
  />
</template>

<style scoped>
.app-brand-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform var(--dw-duration) var(--dw-ease);
}

.app-brand-logo :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
  shape-rendering: geometricPrecision;
}

.app-brand-logo--xs {
  width: var(--dw-icon-size-md);
  height: var(--dw-icon-size-md);
}

.app-brand-logo--titlebar {
  width: var(--dw-density-sm);
  height: var(--dw-density-sm);
}

.app-brand-logo--sm {
  width: var(--dw-density-sm);
  height: var(--dw-density-sm);
}

.app-brand-logo--md {
  width: var(--dw-density-lg);
  height: var(--dw-density-lg);
}

.app-brand-logo--lg {
  width: var(--dw-density-xl);
  height: var(--dw-density-xl);
}
</style>
