<script setup lang="ts">
/** Shared segment / pill control — use instead of hand-rolled .view-options__segment forks. */
export type DwSegmentTab = {
  id: string
  label: string
  count?: number
  disabled?: boolean
}

withDefaults(
    defineProps<{
      tabs: DwSegmentTab[]
      modelValue: string
      ariaLabel?: string
      /** denser control for popovers / compact toolbars */
      size?: 'md' | 'sm'
      stretch?: boolean
      wrap?: boolean
      role?: 'tablist' | 'radiogroup' | 'group'
      /** pill = filled capsule track; underline = text tabs with bottom edge */
      look?: 'pill' | 'underline'
    }>(),
    {
      size: 'md',
      stretch: false,
      wrap: false,
      role: 'tablist',
      look: 'pill',
    },
)

const emit = defineEmits<{
  'update:modelValue': [id: string]
}>()

function select(id: string) {
  emit('update:modelValue', id)
}
</script>

<template>
  <div
      class="dw-segment"
      :class="{
        'dw-segment--sm': size === 'sm',
        'dw-segment--stretch': stretch,
        'dw-segment--wrap': wrap,
        'dw-segment--underline': look === 'underline',
      }"
      :role="role"
      :aria-label="ariaLabel"
  >
    <button
        v-for="tab in tabs"
        :key="tab.id"
        class="dw-segment__btn"
        :class="{'is-active': modelValue === tab.id}"
        type="button"
        :role="role === 'radiogroup' ? 'radio' : role === 'tablist' ? 'tab' : undefined"
        :aria-checked="role === 'radiogroup' ? modelValue === tab.id : undefined"
        :aria-selected="role === 'tablist' ? modelValue === tab.id : undefined"
        :disabled="tab.disabled"
        @click="select(tab.id)"
    >
      <span class="dw-segment__label">{{ tab.label }}</span>
      <span v-if="tab.count != null" class="dw-segment__count">{{ tab.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.dw-segment__label {
  min-width: 0;
}

.dw-segment__count {
  margin-left: var(--dw-space-1);
  opacity: 0.72;
  font-variant-numeric: tabular-nums;
}

.dw-segment--stretch {
  display: flex;
  width: 100%;
}

.dw-segment--stretch .dw-segment__btn {
  flex: 1 1 0;
}
</style>
