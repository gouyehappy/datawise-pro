<script setup lang="ts">
export type WizardStepItem = {
    id: string
    label: string
    number: number
}

defineProps<{
    steps: WizardStepItem[]
    activeStep: string
    ariaLabel: string
    isStepAccessible: (id: string) => boolean
    isStepCompleted: (id: string) => boolean
}>()

const emit = defineEmits<{
    'step-click': [id: string]
}>()
</script>

<template>
  <nav class="migration-flow" :aria-label="ariaLabel">
    <button
        v-for="step in steps"
        :key="step.id"
        type="button"
        class="migration-flow__step"
        :class="{
          'is-active': activeStep === step.id,
          'is-complete': isStepCompleted(step.id),
          'is-disabled': !isStepAccessible(step.id) && activeStep !== step.id,
        }"
        :disabled="!isStepAccessible(step.id) && activeStep !== step.id"
        @click="emit('step-click', step.id)"
    >
      <span class="migration-flow__index">{{ step.number }}</span>
      <span class="migration-flow__label">{{ step.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.migration-flow {
    display: flex;
    flex-wrap: wrap;
    gap: var(--dw-gap-sm);
    margin-top: var(--dw-space-6);
}

.migration-flow__step {
    display: inline-flex;
    align-items: center;
    gap: var(--dw-gap);
    padding: var(--dw-space-3) var(--dw-space-6);
    border: 1px solid var(--dw-border-light);
    border-radius: var(--dw-radius-pill);
    background: var(--dw-bg);
    font-size: var(--dw-text-sm);
    transition: var(--dw-transition-colors);
}

.migration-flow__step.is-active {
    border-color: var(--dw-primary);
    background: var(--dw-primary-soft);
    color: var(--dw-primary);
}

.migration-flow__step.is-complete:not(.is-active) {
    border-color: color-mix(in srgb, var(--dw-success) 30%, var(--dw-border-light));
    color: var(--dw-success-fg);
}

.migration-flow__step.is-disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.migration-flow__index {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--dw-icon-size-xl);
  height: var(--dw-icon-size-xl);
    border-radius: 50%;
    background: var(--dw-bg-muted);
    font-size: var(--dw-text-xs);
    font-weight: 700;
}

.migration-flow__label {
    font-weight: 500;
}
</style>
