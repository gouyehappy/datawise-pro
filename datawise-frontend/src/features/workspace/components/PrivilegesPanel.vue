<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwInlineAlert, EmptyState} from '@/core/components'
import {sqlApi} from '@/api'
import type {DbType} from '@/core/types'
import {
    buildAdminPrivilegesQuery,
    parseAdminPrivilegeRows,
    supportsAdminPrivileges,
    type AdminPrivilegeRow,
} from '@/features/workspace/services/admin-diagnosis.service'

const props = withDefaults(defineProps<{
  connectionId?: string
  database?: string
  dbType?: DbType
  embedded?: boolean
}>(), {
  embedded: false,
})

const emit = defineEmits<{
  openSql: [sql: string]
}>()

const {t} = useI18n()
const loading = ref(false)
const error = ref('')
const rows = ref<AdminPrivilegeRow[]>([])
const querySql = ref('')

const supported = computed(() => supportsAdminPrivileges(props.dbType))
const canLoad = computed(() => Boolean(props.connectionId?.trim()) && supported.value)

async function load() {
  error.value = ''
  rows.value = []
  if (!canLoad.value) return
  const query = buildAdminPrivilegesQuery(props.dbType)
  if (!query) {
    error.value = t('shortcut.adminDiagnosis.unsupported')
    return
  }
  querySql.value = query.sql
  loading.value = true
  try {
    const result = await sqlApi.execute(query.sql, {
      connectionId: props.connectionId,
      database: props.database,
      maxRows: 500,
      perfSource: 'admin-diagnosis',
    })
    rows.value = parseAdminPrivilegeRows(result.rows ?? [])
  } catch (e) {
    const detail = e instanceof Error ? e.message.trim() : ''
    error.value = detail
        ? `${t('shortcut.adminDiagnosis.loadFailed')}: ${detail}`
        : t('shortcut.adminDiagnosis.loadFailed')
  } finally {
    loading.value = false
  }
}

function openQuery() {
  if (querySql.value) emit('openSql', querySql.value)
}

watch(
  () => [props.connectionId, props.database, props.dbType] as const,
  () => { void load() },
)

onMounted(() => { void load() })
</script>

<template>
  <section class="admin-panel" :class="{ 'admin-panel--embedded': embedded }">
    <header class="admin-panel__head">
      <div>
        <h2 class="admin-panel__title">{{ t('shortcut.adminDiagnosis.privilegesTitle') }}</h2>
        <p class="admin-panel__hint">{{ t('shortcut.adminDiagnosis.privilegesSubtitle') }}</p>
      </div>
      <div class="admin-panel__actions">
        <DwButton v-if="querySql" variant="ghost" size="sm" @click="openQuery">
          {{ t('shortcut.adminDiagnosis.openSql') }}
        </DwButton>
        <DwButton variant="ghost" size="sm" :disabled="loading || !canLoad" @click="load">
          {{ loading ? t('shortcut.adminDiagnosis.loading') : t('shortcut.adminDiagnosis.refresh') }}
        </DwButton>
      </div>
    </header>

    <EmptyState
        v-if="!connectionId"
        embedded
        bordered
        :title="t('shortcut.adminDiagnosis.noConnection')"
    />
    <EmptyState
        v-else-if="!supported"
        embedded
        bordered
        :title="t('shortcut.adminDiagnosis.unsupported')"
    />
    <EmptyState
        v-else-if="loading && !rows.length && !error"
        embedded
        bordered
        :title="t('shortcut.adminDiagnosis.loading')"
    />
    <DwInlineAlert
        v-else-if="error"
        :message="error"
        density="banner"
    />
    <EmptyState
        v-else-if="!rows.length"
        embedded
        bordered
        :title="t('shortcut.adminDiagnosis.emptyPrivileges')"
    />
    <div v-else class="admin-panel__table-wrap">
      <table class="admin-panel__table">
        <thead>
          <tr>
            <th>{{ t('shortcut.adminDiagnosis.colPrincipal') }}</th>
            <th>{{ t('shortcut.adminDiagnosis.colScope') }}</th>
            <th>{{ t('shortcut.adminDiagnosis.colPrivilege') }}</th>
            <th>{{ t('shortcut.adminDiagnosis.colGrantable') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in rows" :key="`${row.principal}-${row.scope}-${row.privilege}-${idx}`">
            <td>{{ row.principal }}</td>
            <td>{{ row.scope }}</td>
            <td class="admin-panel__mono">{{ row.privilege }}</td>
            <td>{{ row.grantable }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
