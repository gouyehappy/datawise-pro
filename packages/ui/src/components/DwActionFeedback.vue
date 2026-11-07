<script setup lang="ts">
import {computed} from 'vue'

const props = withDefaults(defineProps<{
    message?: string | null
    /** true 成功、false 失败、null 中性 */
    ok?: boolean | null
}>(), {
    message: null,
    ok: null,
})

const visible = computed(() => Boolean(props.message?.trim()))

const role = computed(() => (props.ok === false ? 'alert' : 'status'))
</script>

<template>
  <p
      v-if="visible"
      class="dw-action-feedback"
      :class="{
        'is-ok': ok === true,
        'is-fail': ok === false,
      }"
      :role="role"
  >
    {{ message }}
  </p>
</template>

<style scoped>
.dw-action-feedback {
  margin: 0;
  flex: 1;
  min-width: 0;
  padding: var(--dw-space-2) var(--dw-space-4);
  border-radius: var(--dw-control-radius-sm);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-snug);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--dw-text-secondary);
  background: color-mix(in srgb, var(--dw-bg-muted) 55%, var(--dw-bg));
}

.dw-action-feedback.is-ok {
  background: color-mix(in srgb, var(--dw-success) 12%, var(--dw-bg));
  color: var(--dw-success);
}

.dw-action-feedback.is-fail {
  background: color-mix(in srgb, var(--dw-danger) 12%, var(--dw-bg));
  color: var(--dw-danger);
}
</style>
