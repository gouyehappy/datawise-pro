<script setup lang="ts">
defineProps<{
  title?: string
  active?: boolean
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'accent' | 'nav'
  /** 侧栏导航选中色调：database 用青色，与产品 Logo 区分 */
  navTone?: 'default' | 'database'
}>()
</script>

<template>
  <button
      class="dw-icon-btn"
      :class="[
      size === 'sm' && 'dw-icon-btn--sm',
      size === 'lg' && 'dw-icon-btn--lg',
      {
        'is-active': active && variant !== 'nav',
        'is-nav-active': active && variant === 'nav' && navTone !== 'database',
        'is-nav-db-active': active && variant === 'nav' && navTone === 'database',
        'dw-icon-btn--accent': variant === 'accent',
      },
    ]"
      type="button"
      :title="title"
      :disabled="disabled"
  >
    <slot/>
  </button>
</template>
