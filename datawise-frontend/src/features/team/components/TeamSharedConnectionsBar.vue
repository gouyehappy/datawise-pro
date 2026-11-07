<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useTeamExplorerHighlight} from '@/features/team/composables/useTeamExplorerHighlight'

const {t} = useI18n()
const layout = useLayoutStore()
const {hasSharedConnections, sharedConnections, activeTeamName, locateSharedConnection} =
    useTeamExplorerHighlight()

function onLocate(connectionId: string, found: boolean) {
  if (!found) {
    layout.showErrorToast(t('explorer.teamSharedMissing', {id: connectionId}))
    return
  }
  if (!locateSharedConnection(connectionId)) {
    layout.showErrorToast(t('explorer.teamSharedMissing', {id: connectionId}))
  }
}
</script>

<template>
  <div v-if="hasSharedConnections" class="team-shared-bar">
    <span class="team-shared-bar__label">
      {{ t('explorer.teamSharedLabel', {team: activeTeamName}) }}
    </span>
    <div class="team-shared-bar__chips">
      <button
          v-for="item in sharedConnections"
          :key="item.id"
          type="button"
          class="team-shared-chip"
          :class="{ 'is-missing': !item.found }"
          :title="item.found ? t('explorer.teamSharedLocateHint') : t('explorer.teamSharedMissing', { id: item.id })"
          @click="onLocate(item.id, item.found)"
      >
        {{ item.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.team-shared-bar {
  display: flex;
  align-items: flex-start;
  gap: var(--dw-gap);
  padding: var(--dw-space-3) var(--dw-space-5);
  border-bottom: 1px solid var(--dw-border-light);
  background: color-mix(in srgb, var(--dw-primary) 6%, var(--dw-bg-panel));
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
}

.team-shared-bar__label {
  flex-shrink: 0;
  color: var(--dw-text-secondary);
  padding-top: var(--dw-space-1);
}

.team-shared-bar__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-xs);
  min-width: 0;
}

.team-shared-chip {
  max-width: 100%;
  padding: var(--dw-pad-chip);
  border: 1px solid var(--dw-primary-border);
  border-radius: var(--dw-radius-pill);
  background: var(--dw-bg);
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.team-shared-chip:hover {
  background: var(--dw-primary-softer);
}

.team-shared-chip.is-missing {
  border-style: dashed;
  color: var(--dw-text-muted);
}
</style>
