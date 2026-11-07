<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import CollapsibleSection from '@/core/components/CollapsibleSection.vue'
import {DwIcon} from '@/core/icons'
import SettingsSwitch from '@/core/components/SettingsSwitch.vue'
import {DwInput, DwSecretInput} from '@/core/components'
import ConnectionFormField from '@/features/connection/components/ConnectionFormField.vue'
import {useDriverInstallStore, jdbcArtifactName} from '@/features/connection/stores/driver-install'
import {isJdbcDriverRequired} from '@/features/connection/utils/connection-defaults'
import {supportsSshTunnel} from '@/shared/capabilities/db-type-capabilities'
import {useDatasourceCatalogStore} from '@/features/datasource/stores/datasource-catalog'
import {
    resolveApiErrorMessage,
    resolveDisplayApiErrorMessage,
} from '@/shared/api/http/api-error-message'
import type {ConnectionConfig, DbType} from '@/core/types'

const props = defineProps<{ form: ConnectionConfig; readOnly?: boolean; advancedOnly?: boolean }>()

const {t} = useI18n()
const catalogStore = useDatasourceCatalogStore()
const resolving = ref(false)
const resolveMessage = ref<string | null>(null)
const resolveOk = ref<boolean | null>(null)

const dbType = computed(() => (props.form.dbType ?? 'mysql') as DbType)
const catalogItem = computed(() => catalogStore.items.find((item) => item.id === dbType.value))
const showDriverSection = computed(() => isJdbcDriverRequired(dbType.value, catalogItem.value))
const showSshSection = computed(() => supportsSshTunnel(dbType.value, catalogStore.items))

const driverBadge = computed(() => {
  const coords = props.form.driver?.trim()
  if (!coords) return ''
  const parts = coords.split(':')
  if (parts.length >= 2) return `${parts[1]}:${parts[2] ?? ''}`
  return coords.length > 22 ? `${coords.slice(0, 20)}…` : coords
})

async function onResolveDriver() {
  const mavenCoordinates = props.form.driver?.trim() ?? ''
  const driverClass = props.form.driverClass?.trim() ?? ''
  if (!mavenCoordinates || !driverClass) {
    resolveOk.value = false
    resolveMessage.value = t('connection.driverResolveRequired')
    return
  }
  resolving.value = true
  resolveMessage.value = null
  try {
    const outcome = await useDriverInstallStore().ensure(
        mavenCoordinates,
        driverClass,
        jdbcArtifactName(mavenCoordinates),
    )
    if (outcome === 'cancelled') {
      resolveOk.value = false
      resolveMessage.value = t('connection.driverInstallCancelled')
      return
    }
    if (outcome === 'failed') {
      resolveOk.value = false
      resolveMessage.value = useDriverInstallStore().error || t('connection.driverInstallFailed')
      return
    }
    resolveOk.value = true
    resolveMessage.value = outcome === 'cached'
        ? t('connection.driverResolveCached')
        : t('connection.driverResolveSuccess')
  } catch (err) {
    resolveOk.value = false
    resolveMessage.value = resolveDisplayApiErrorMessage(err, t) || resolveApiErrorMessage(err)
  } finally {
    resolving.value = false
  }
}
</script>

<template>
  <!-- AURA-X: [Modify] - 连接「更多选项」输入统一 DwInput/DwSecretInput -->
  <!-- Protection: 功能完整性已验证，无简化行为 -->
  <div class="conn-more" :class="{ 'conn-more--plain': advancedOnly }">
    <div v-if="!advancedOnly" class="conn-more__head">
      <span class="conn-more__label">{{ t('connection.sections.more') }}</span>
      <span class="conn-more__count">{{ t('connection.moreCount') }}</span>
    </div>

    <div class="more-list">
      <CollapsibleSection
          v-if="showDriverSection && !advancedOnly"
          :title="t('connection.driverSection')"
          :description="t('connection.collapseDesc.driver')"
      >
        <template #icon>
          <DwIcon name="database" size="md" filled/>
        </template>
        <template v-if="driverBadge" #badge>
          <span class="more-badge">{{ driverBadge }}</span>
        </template>

        <ConnectionFormField :label="t('connection.driverMaven')" :hint="t('connection.hints.driverMaven')">
          <DwInput
              v-model="form.driver"
              variant="sm"
              class="more-mono"
              :disabled="readOnly"
              :placeholder="t('connection.driverMavenPlaceholder')"
          />
        </ConnectionFormField>
        <ConnectionFormField :label="t('connection.driverClass')">
          <DwInput
              v-model="form.driverClass"
              variant="sm"
              class="more-mono"
              :disabled="readOnly"
          />
        </ConnectionFormField>
        <button
            class="dw-link-btn more-upload"
            type="button"
            :disabled="resolving || readOnly"
            @click="onResolveDriver"
        >
          {{ resolving ? t('connection.driverResolving') : t('connection.downloadDriver') }}
        </button>
        <p
            v-if="resolveMessage"
            class="more-resolve-msg"
            :class="resolveOk ? 'more-resolve-msg--ok' : 'more-resolve-msg--err'"
        >
          {{ resolveMessage }}
        </p>
      </CollapsibleSection>

      <CollapsibleSection
          v-if="showSshSection && !advancedOnly"
          :title="t('connection.sshSection')"
          :description="t('connection.collapseDesc.ssh')"
      >
        <template #icon>
          <DwIcon name="lock" size="md" :stroke-width="1.3"/>
        </template>
        <template v-if="form.sshEnabled" #badge>
          <span class="more-badge more-badge--on">{{ t('connection.sshOn') }}</span>
        </template>

        <SettingsSwitch
            :model-value="!!form.sshEnabled"
            :label="t('connection.sshEnable')"
            :disabled="readOnly"
            @update:model-value="form.sshEnabled = $event"
        />

        <div v-if="form.sshEnabled" class="more-subpanel">
          <div class="more-grid">
            <ConnectionFormField :label="t('connection.sshHost')">
              <DwInput v-model="form.sshHost" variant="sm" :disabled="readOnly"/>
            </ConnectionFormField>
            <ConnectionFormField :label="t('connection.sshPort')">
              <DwInput v-model="form.sshPort" variant="sm" :disabled="readOnly"/>
            </ConnectionFormField>
          </div>
          <ConnectionFormField :label="t('connection.sshUser')">
            <DwInput v-model="form.sshUser" variant="sm" :disabled="readOnly"/>
          </ConnectionFormField>
          <ConnectionFormField :label="t('connection.sshPassword')">
            <DwSecretInput v-model="form.sshPassword" variant="sm" :disabled="readOnly"/>
          </ConnectionFormField>
          <ConnectionFormField
              :label="t('connection.sshPrivateKey')"
              :hint="t('connection.hints.sshPrivateKey')"
          >
            <DwInput
                v-model="form.sshPrivateKey"
                class="more-textarea"
                :rows="4"
                :disabled="readOnly"
                :placeholder="t('connection.sshPrivateKeyPlaceholder')"
            />
          </ConnectionFormField>
          <ConnectionFormField :label="t('connection.sshPassphrase')">
            <DwSecretInput v-model="form.sshPassphrase" variant="sm" :disabled="readOnly"/>
          </ConnectionFormField>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
          v-if="!advancedOnly"
          :title="t('connection.advancedSection')"
          :description="t('connection.collapseDesc.advanced')"
      >
        <template #icon>
          <DwIcon name="settings-basic" size="md" :stroke-width="1.3"/>
        </template>
        <template v-if="form.advancedConfig?.trim()" #badge>
          <span class="more-badge">{{ t('connection.advancedSet') }}</span>
        </template>

        <ConnectionFormField :hint="t('connection.hints.advanced')">
          <DwInput
              v-model="form.advancedConfig"
              class="more-textarea"
              :rows="3"
              :disabled="readOnly"
          />
        </ConnectionFormField>
      </CollapsibleSection>

      <ConnectionFormField v-if="advancedOnly" :hint="t('connection.hints.advanced')">
        <DwInput
            v-model="form.advancedConfig"
            class="more-textarea"
            :rows="8"
            :disabled="readOnly"
        />
      </ConnectionFormField>
    </div>
  </div>
</template>

<style scoped>
.conn-more {
  margin-top: var(--dw-space-8);
  padding-top: var(--dw-space-7);
  border-top: 1px solid var(--dw-border-light);
}

.conn-more--plain {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}

.conn-more__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
  margin-bottom: var(--dw-space-5);
}

.conn-more__label {
  font-size: var(--dw-text-xs);
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--dw-text-muted);
}

.conn-more__count {
  padding: var(--dw-pad-chip);
  border-radius: var(--dw-radius-pill);
  background: var(--dw-bg-muted);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 600;
}

.more-list {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
}

.more-badge {
  max-width: 120px;
  padding: var(--dw-pad-chip);
  border-radius: var(--dw-radius-pill);
  background: var(--dw-bg-muted);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  font-weight: 500;
  line-height: var(--dw-leading);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.more-badge--on {
  background: var(--dw-primary-soft);
  color: var(--dw-primary);
}

.more-mono,
:deep(.more-mono) {
  font-family: var(--dw-mono);
  font-size: var(--dw-text-xs);
}

.more-upload {
  align-self: flex-start;
  font-size: var(--dw-text-sm);
}

.more-resolve-msg {
  margin: 0;
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
}

.more-resolve-msg--ok {
  color: var(--dw-success);
}

.more-resolve-msg--err {
  color: var(--dw-danger);
}

.more-subpanel {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-md);
  padding: var(--dw-space-5);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg);
  border: 1px solid var(--dw-border-light);
}

.more-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--dw-gap-md);
}

.more-textarea,
:deep(.more-textarea) {
  min-height: 72px;
  resize: vertical;
  font-family: var(--dw-mono);
  font-size: var(--dw-text-sm);
}

:deep(.settings-switch) {
  padding: var(--dw-space-2) 0 var(--dw-space-1);
}
</style>
