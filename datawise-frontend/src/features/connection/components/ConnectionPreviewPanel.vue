<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import DbTypeIcon from '@/core/components/DbTypeIcon.vue'
import {DB_TYPE_ICON_SIZE} from '@/features/connection/constants/db-type-icon-sizes'
import TagChip from '@/core/components/TagChip.vue'
import {resolveConnectionEnvironmentLabel} from '@/features/connection/services/connection-environment.service'
import {
  readKafkaBootstrap,
  readKafkaSecurityProtocol,
  readKafkaSkipTlsVerify,
} from '@/features/connection/utils/kafka-security'
import {readKuduMasters} from '@/features/connection/utils/kudu-masters'
import type {ConnectionConfig, DbType} from '@/core/types'

const props = defineProps<{
  dbType: DbType
  label: string
  form: ConnectionConfig
}>()

const {t} = useI18n()

const displayName = computed(
    () => props.form.name?.trim() || `${props.label}@${props.form.host || 'localhost'}`,
)
const endpoint = computed(() => {
  if (props.dbType === 'kafka') return readKafkaBootstrap(props.form)
  if (props.dbType === 'kudu') return readKuduMasters(props.form)
  const host = props.form.host?.trim() || '—'
  const port = props.form.port?.trim() || '—'
  return `${host}:${port}`
})
const authLabel = computed(() => props.form.auth || 'NONE')
const databaseLabel = computed(() => {
  if (props.dbType === 'redis') {
    return props.form.database?.trim() || '0'
  }
  return props.form.database?.trim() || t('connection.preview.defaultDb')
})
const kafkaSkipTls = computed(() => readKafkaSkipTlsVerify(props.form.advancedConfig))
const kafkaSecurity = computed(() => readKafkaSecurityProtocol(props.form.advancedConfig))
const envLabel = computed(() =>
    resolveConnectionEnvironmentLabel(props.form.env, props.form.envCustom, t),
)
</script>

<template>
  <aside class="conn-preview">
    <div class="preview-card preview-card--hero dw-inset-card">
      <DbTypeIcon class="preview-icon" :db-type="dbType" :size="DB_TYPE_ICON_SIZE.preview"/>
      <div class="preview-hero__text">
        <h2>{{ displayName }}</h2>
        <p>{{ label }}</p>
      </div>
    </div>

    <div class="preview-card dw-inset-card">
      <h3>{{ t('connection.preview.summary') }}</h3>
      <dl class="preview-kv">
        <div class="preview-kv__row">
          <dt>{{ dbType === 'kafka' ? t('connection.kafkaBootstrap') : dbType === 'kudu' ? t('connection.kuduMasters') : t('connection.preview.endpoint') }}</dt>
          <dd class="mono">{{ endpoint }}</dd>
        </div>
        <div v-if="dbType === 'kafka'" class="preview-kv__row">
          <dt>{{ t('connection.kafkaSecurity') }}</dt>
          <dd>{{ kafkaSecurity || t('connection.kafkaSecurityAuto') }}</dd>
        </div>
        <div v-if="dbType !== 'kafka' && dbType !== 'kudu' && dbType !== 'redis'" class="preview-kv__row">
          <dt>{{ t('connection.database') }}</dt>
          <dd>{{ databaseLabel }}</dd>
        </div>
        <div v-else-if="dbType === 'redis'" class="preview-kv__row">
          <dt>{{ t('connection.redisDbIndex') }}</dt>
          <dd>{{ databaseLabel }}</dd>
        </div>
        <div v-if="dbType === 'kafka'" class="preview-kv__row">
          <dt>{{ t('connection.preview.tls') }}</dt>
          <dd>{{ kafkaSkipTls ? t('connection.preview.tlsSkip') : t('connection.preview.tlsVerify') }}</dd>
        </div>
        <div v-if="dbType !== 'redis' && dbType !== 'kudu'" class="preview-kv__row">
          <dt>{{ t('connection.auth') }}</dt>
          <dd>{{ authLabel }}</dd>
        </div>
        <div v-if="dbType !== 'kudu'" class="preview-kv__row">
          <dt>{{ t('connection.url') }}</dt>
          <dd class="mono url">{{ form.url || '—' }}</dd>
        </div>
      </dl>
      <div class="preview-tags">
        <TagChip v-if="form.env">{{ envLabel }}</TagChip>
        <TagChip v-if="form.storage">
          {{ t(`connection.storageOptions.${form.storage.toLowerCase()}`) }}
        </TagChip>
        <TagChip v-if="form.sshEnabled">
          {{ dbType === 'ssh' ? t('connection.jumpSection') : t('connection.sshSection') }}
        </TagChip>
      </div>
    </div>

    <div class="preview-card preview-card--tips dw-inset-card">
      <h3>{{ t('connection.preview.tipsTitle') }}</h3>
      <ol class="preview-steps">
        <li>{{ t('connection.preview.tipTest') }}</li>
        <li>{{ t('connection.preview.tipSave') }}</li>
        <li>{{ dbType === 'kafka' ? t('connection.preview.tipKafka') : t('connection.preview.tipManage') }}</li>
      </ol>
    </div>
  </aside>
</template>

<style scoped>
.conn-preview {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-6);
  min-height: 0;
  height: 100%;
  padding: var(--dw-space-9) var(--dw-space-10) var(--dw-space-10);
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.preview-card {
  padding: var(--dw-space-7) var(--dw-space-8);
  border: 1px solid var(--dw-border-light);
  background: var(--dw-bg);
}

.preview-card--hero {
  display: flex;
  align-items: center;
  gap: var(--dw-space-6);
  background: linear-gradient(135deg, var(--dw-bg-panel) 0%, var(--dw-bg) 100%);
}

.preview-card h3 {
  margin: 0 0 var(--dw-space-5);
  font-size: var(--dw-text-xs);
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--dw-text-muted);
}

.preview-icon {
  flex-shrink: 0;
}

.preview-hero__text h2 {
  margin: 0;
  font-size: var(--dw-text-xl);
  font-weight: 700;
  line-height: var(--dw-leading-snug);
  word-break: break-all;
}

.preview-hero__text p {
  margin: var(--dw-space-2) 0 0;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
}

.preview-kv {
  margin: 0;
}

.preview-kv__row {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: var(--dw-gap);
  padding: var(--dw-space-3) 0;
}

.preview-kv__row + .preview-kv__row {
  border-top: 1px solid var(--dw-border-light);
}

.preview-kv__row dt {
  margin: 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-relaxed);
}

.preview-kv__row dd {
  margin: 0;
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-relaxed);
  word-break: break-all;
}

.preview-kv__row dd.mono {
  font-family: var(--dw-mono);
}

.preview-kv__row dd.url {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-secondary);
}

.preview-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-sm);
  margin-top: var(--dw-space-5);
}

.preview-steps {
  margin: 0;
  padding-left: 18px;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-loose);
}

.preview-steps li + li {
  margin-top: var(--dw-space-3);
}
</style>
