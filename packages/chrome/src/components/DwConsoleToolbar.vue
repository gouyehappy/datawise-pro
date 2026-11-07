<script setup lang="ts">
</script>

<template>
  <div class="dw-console-toolbar">
    <div class="dw-console-toolbar__start">
      <slot name="start"/>
      <slot/>
    </div>
    <div v-if="$slots.context" class="dw-console-toolbar__context">
      <slot name="context"/>
    </div>
    <div v-if="$slots.end" class="dw-console-toolbar__end">
      <slot name="end"/>
    </div>
  </div>
</template>

<style scoped>
.dw-console-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-gap-sm);
  min-height: var(--dw-console-toolbar-height, var(--dw-density-md));
  padding: 0 var(--dw-space-3);
  border-bottom: 1px solid var(--dw-border-light);
  background: var(--dw-bg-panel);
}

.dw-console-toolbar__start,
.dw-console-toolbar__end {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-xs);
  flex-wrap: wrap;
}

.dw-console-toolbar__context {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
}

.dw-console-toolbar__end {
  margin-left: auto;
}
</style>
