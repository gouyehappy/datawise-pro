<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {
    resolveConnectionEnvBadgeTone,
    resolveConnectionEnvTreeLabel,
} from '@/features/connection/services/connection-environment.service'

const props = defineProps<{
    env?: string | null
    envCustom?: string | null
}>()

const {t} = useI18n()

const tone = computed(() => resolveConnectionEnvBadgeTone(props.env, props.envCustom))
const label = computed(() => resolveConnectionEnvTreeLabel(props.env, props.envCustom, t))
</script>

<template>
  <span
      class="conn-env-badge"
      :class="`conn-env-badge--${tone}`"
      :title="label"
  >
    {{ label }}
  </span>
</template>

<style scoped>
.conn-env-badge {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 30px;
    height: var(--dw-icon-size-lg);
    padding: 0 var(--dw-space-3);
    border-radius: var(--dw-control-radius-sm);
    border: 1px solid transparent;
    font-size: var(--dw-text-xs);
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.04em;
    white-space: nowrap;
}

.conn-env-badge--prod {
    background: color-mix(in srgb, var(--dw-danger) 18%, var(--dw-bg));
    color: var(--dw-danger-fg);
    border-color: color-mix(in srgb, var(--dw-danger) 42%, transparent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--dw-danger) 18%, transparent);
}

.conn-env-badge--staging {
    background: color-mix(in srgb, var(--mp-tone-amber) 16%, var(--dw-bg));
    color: var(--dw-warning-fg);
    border-color: color-mix(in srgb, var(--mp-tone-amber) 40%, transparent);
}

.conn-env-badge--dev {
    background: color-mix(in srgb, var(--dw-primary) 10%, var(--dw-bg));
    color: var(--dw-primary);
    border-color: color-mix(in srgb, var(--dw-primary) 24%, transparent);
}

.conn-env-badge--custom {
    background: color-mix(in srgb, var(--dw-text-secondary) 8%, var(--dw-bg));
    color: var(--dw-text-secondary);
    border-color: color-mix(in srgb, var(--dw-border) 90%, transparent);
}
</style>
