<script setup lang="ts">
import AppBrandLogo from '@/features/layout/components/AppBrandLogo.vue'
import {DwIcon} from '@/core/icons'
import {useExplorerStatusPath} from '@/features/explorer/composables/useExplorerStatusPath'

const {segments, hasPath} = useExplorerStatusPath()
</script>

<template>
  <nav
      v-if="hasPath"
      class="explorer-status-path"
      :aria-label="$t('explorer.statusPath.label')"
  >
    <AppBrandLogo size="xs" class="explorer-status-path__brand"/>
    <template v-for="segment in segments" :key="segment.id">
      <DwIcon
          class="explorer-status-path__sep"
          name="chevron-right"
          size="xs"
          :stroke-width="1.6"
          aria-hidden="true"
      />
      <span
          class="explorer-status-path__segment"
          :class="`explorer-status-path__segment--${segment.kind}`"
          :title="segment.label"
      >
        <DwIcon
            v-if="segment.kind === 'database'"
            class="explorer-status-path__db-icon"
            name="database"
            size="xs"
            :stroke-width="1.6"
        />
        {{ segment.label }}
      </span>
    </template>
  </nav>
</template>

<style scoped>
.explorer-status-path {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-tight);
}

.explorer-status-path__brand {
  flex-shrink: 0;
  margin-right: 2px;
  opacity: 0.92;
}

.explorer-status-path__sep {
  flex-shrink: 0;
  width: var(--dw-icon-size-xs);
  height: var(--dw-icon-size-xs);
  color: var(--dw-text-muted);
  opacity: 0.55;
}

.explorer-status-path__segment {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-xs);
  min-width: 0;
  max-width: 11rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1;
  padding: 0 2px;
}

.explorer-status-path__segment--connection,
.explorer-status-path__segment--database {
  color: var(--dw-text);
  font-weight: 500;
}

.explorer-status-path__segment--schema,
.explorer-status-path__segment--object {
  color: var(--dw-text-secondary);
  font-weight: 400;
}

.explorer-status-path__db-icon {
  flex-shrink: 0;
  color: var(--dw-success);
}
</style>
