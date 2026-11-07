<script setup lang="ts">
import {computed} from 'vue'
import {AppModal, ModalActions} from '@/core/components'
import {useI18n} from 'vue-i18n'
import {
    buildSqlConflictPane,
    buildSqlLineDiff,
    summarizeSqlLineDiff,
} from '@/features/team/services/team-shared-query-diff.service'

const props = defineProps<{
    open: boolean
    baseSql: string
    localSql: string
    remoteSql: string
    loading?: boolean
    applying?: boolean
}>()

const emit = defineEmits<{
    'update:open': [value: boolean]
    acceptRemote: []
    keepLocal: []
}>()

const {t} = useI18n()

const diffSummary = computed(() => summarizeSqlLineDiff(buildSqlLineDiff(props.localSql, props.remoteSql)))
const basePane = computed(() => buildSqlConflictPane(props.baseSql, props.baseSql))
const localPane = computed(() => buildSqlConflictPane(props.baseSql, props.localSql))
const remotePane = computed(() => buildSqlConflictPane(props.baseSql, props.remoteSql))

function close() {
    emit('update:open', false)
}

function acceptRemote() {
    emit('acceptRemote')
}

function keepLocal() {
    emit('keepLocal')
    close()
}

function lineClass(changed: boolean) {
    return changed ? 'team-collab-conflict-line team-collab-conflict-line--changed' : 'team-collab-conflict-line'
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('team.sharedQueries.collabConflictTitle')"
      :subtitle="t('team.sharedQueries.collabConflictSubtitle', diffSummary)"
      width="1080px"
      @close="close"
  >
    <div v-if="loading" class="team-collab-conflict-loading">
      {{ t('common.loading') }}
    </div>
    <div v-else class="team-collab-conflict-grid">
      <section class="team-collab-conflict-pane">
        <h3 class="modal-code-label">{{ t('team.sharedQueries.collabBase') }}</h3>
        <pre class="modal-code-block modal-code-block--scroll team-collab-conflict-block">
          <code
              v-for="line in basePane"
              :key="`base-${line.lineNo}`"
              :class="lineClass(line.changed)"
          >{{ line.text || ' ' }}</code>
        </pre>
      </section>
      <section class="team-collab-conflict-pane">
        <h3 class="modal-code-label">{{ t('team.sharedQueries.collabYours') }}</h3>
        <pre class="modal-code-block modal-code-block--scroll team-collab-conflict-block">
          <code
              v-for="line in localPane"
              :key="`local-${line.lineNo}`"
              :class="lineClass(line.changed)"
          >{{ line.text || ' ' }}</code>
        </pre>
      </section>
      <section class="team-collab-conflict-pane">
        <h3 class="modal-code-label">{{ t('team.sharedQueries.collabTheirs') }}</h3>
        <pre class="modal-code-block modal-code-block--scroll modal-code-block--accent team-collab-conflict-block">
          <code
              v-for="line in remotePane"
              :key="`remote-${line.lineNo}`"
              :class="lineClass(line.changed)"
          >{{ line.text || ' ' }}</code>
        </pre>
      </section>
    </div>
    <template #footer>
      <ModalActions
          :cancel-label="t('team.sharedQueries.keepLocal')"
          :confirm-label="t('team.sharedQueries.acceptRemote')"
          :confirm-disabled="loading || applying"
          @cancel="keepLocal"
          @confirm="acceptRemote"
      />
    </template>
  </AppModal>
</template>

<style scoped>
.team-collab-conflict-loading {
  padding: var(--dw-space-10) 0;
  text-align: center;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-md);
}

.team-collab-conflict-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--dw-gap-md);
  min-height: 260px;
}

.team-collab-conflict-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.team-collab-conflict-block {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.team-collab-conflict-line {
  display: block;
  padding: 0 var(--dw-space-2);
  border-radius: var(--dw-control-radius-sm);
  white-space: pre-wrap;
  word-break: break-word;
}

.team-collab-conflict-line--changed {
  background: color-mix(in srgb, var(--dw-warning) 18%, transparent);
}

@media (max-width: 960px) {
  .team-collab-conflict-grid {
    grid-template-columns: 1fr;
  }
}
</style>
