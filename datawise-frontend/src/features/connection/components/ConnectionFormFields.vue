<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwInput, DwSecretInput, DwCheckbox} from '@/core/components'
import SettingsSelect from '@/core/components/SettingsSelect.vue'
import SettingsSwitch from '@/core/components/SettingsSwitch.vue'
import ConnectionFormField from '@/features/connection/components/ConnectionFormField.vue'
import ConnectionMoreOptions from '@/features/connection/components/ConnectionMoreOptions.vue'
import PluginConnectionFields from '@/features/connection/components/PluginConnectionFields.vue'
import NacosNamespacePickerDialog from '@/features/connection/components/NacosNamespacePickerDialog.vue'
import {
  CONNECTION_AUTH_OPTIONS,
  CONNECTION_ENV_OPTIONS,
  CONNECTION_STORAGE_OPTIONS,
} from '@/features/connection/constants/connection-options'
import {usePasteableHttpEndpoint} from '@/features/connection/composables/usePasteableHttpEndpoint'
import {
  defaultNacosContextPath,
  formatNacosConsoleAddress,
  formatVisibleNacosNamespaces,
  isRNacosWebConsoleAddress,
  nacosConsolePlaceholder,
  NACOS_CONTEXT_CUSTOM_KEY,
  NACOS_IMPLEMENTATION_KEY,
  NACOS_NAMESPACE_KEY,
  NACOS_VERSION_MODE_KEY,
  NACOS_VISIBLE_NAMESPACES_KEY,
  parseNacosConsoleAddress,
  readAdvancedProperty,
  readNacosImplementation,
  readNacosVersionMode,
  readVisibleNacosNamespaces,
  removeAdvancedProperty,
  upsertAdvancedProperty,
  type NacosImplementation,
  type NacosVersionMode,
} from '@/features/connection/utils/nacos-endpoint'
import {
  elasticsearchConnectionMode,
  normalizeElasticsearchConnectivityCheckPath,
  normalizeKibanaBasePath,
} from '@/features/connection/utils/elasticsearch-endpoint'
import {
  applyKafkaBootstrap,
  KAFKA_SASL_MECHANISMS,
  KAFKA_SECURITY_PROTOCOLS,
  readKafkaBootstrap,
  readKafkaSaslMechanism,
  readKafkaSecurityProtocol,
  readKafkaSkipTlsVerify,
  writeKafkaSaslMechanism,
  writeKafkaSecurityProtocol,
  writeKafkaSkipTlsVerify,
} from '@/features/connection/utils/kafka-security'
import {applyKuduMasters, readKuduMasters} from '@/features/connection/utils/kudu-masters'
import type {ConnectionConfig, DbType} from '@/core/types'

const form = defineModel<ConnectionConfig>('form', {required: true})

const props = defineProps<{
  dbType: DbType
  readOnly?: boolean
}>()

const kafkaSkipTls = computed({
  get: () => readKafkaSkipTlsVerify(form.value.advancedConfig),
  set: (skip: boolean) => {
    form.value.advancedConfig = writeKafkaSkipTlsVerify(form.value.advancedConfig, skip)
  },
})
const kafkaBootstrap = computed({
  get: () => readKafkaBootstrap(form.value),
  set: (value: string) => applyKafkaBootstrap(form.value, value),
})
const kafkaSecurityProtocol = computed({
  get: () => readKafkaSecurityProtocol(form.value.advancedConfig),
  set: (value: string) => {
    form.value.advancedConfig = writeKafkaSecurityProtocol(form.value.advancedConfig, value)
  },
})
const kafkaSaslMechanism = computed({
  get: () => readKafkaSaslMechanism(form.value.advancedConfig),
  set: (value: string) => {
    form.value.advancedConfig = writeKafkaSaslMechanism(form.value.advancedConfig, value)
  },
})
const kafkaSecurityOptions = computed(() => [
  {value: '', label: t('connection.kafkaSecurityAuto')},
  ...KAFKA_SECURITY_PROTOCOLS.map((value) => ({value, label: value})),
])
const kafkaSaslOptions = KAFKA_SASL_MECHANISMS.map((value) => ({value, label: value}))

const kuduMasters = computed({
  get: () => readKuduMasters(form.value),
  set: (value: string) => applyKuduMasters(form.value, value),
})

const nacosAddressDraft = ref('')
const nacosAddressFocused = ref(false)

function syncNacosAddressFromForm() {
  if (props.dbType !== 'nacos' || nacosAddressFocused.value) return
  nacosAddressDraft.value = formatNacosConsoleAddress(form.value.host, form.value.port, form.value.advancedConfig)
}

function commitNacosAddress() {
  const parsed = parseNacosConsoleAddress(nacosAddressDraft.value)
  if (!parsed) {
    syncNacosAddressFromForm()
    return
  }
  form.value.host = parsed.host
  if (parsed.port) form.value.port = parsed.port
  let advanced = form.value.advancedConfig
  if (parsed.https !== undefined) {
    advanced = upsertAdvancedProperty(advanced, 'useHttps', parsed.https ? 'true' : 'false')
  }
  const implementation = readNacosImplementation(advanced)
  const versionMode = readNacosVersionMode(advanced)
  const port = parsed.port || form.value.port
  const expected = defaultNacosContextPath(implementation, versionMode, port)
  if (parsed.contextPath && parsed.contextPath !== '/') {
    advanced = upsertAdvancedProperty(advanced, 'contextPath', parsed.contextPath)
    if (parsed.contextPath !== expected) {
      advanced = upsertAdvancedProperty(advanced, NACOS_CONTEXT_CUSTOM_KEY, 'true')
    }
  } else if (readAdvancedProperty(advanced, NACOS_CONTEXT_CUSTOM_KEY) !== 'true') {
    advanced = upsertAdvancedProperty(advanced, 'contextPath', expected)
  }
  form.value.advancedConfig = advanced
  nacosAddressDraft.value = formatNacosConsoleAddress(form.value.host, form.value.port, form.value.advancedConfig)
}

function onNacosAddressBlur() {
  nacosAddressFocused.value = false
  commitNacosAddress()
}

function onNacosAddressPaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text')?.trim()
  if (!text) return
  event.preventDefault()
  nacosAddressDraft.value = text
  commitNacosAddress()
}

watch(
    () => [props.dbType, form.value.host, form.value.port, form.value.advancedConfig] as const,
    () => syncNacosAddressFromForm(),
    {immediate: true},
)

const {
  kind: httpEndpointKind,
  draft: httpEndpointDraft,
  placeholder: httpEndpointPlaceholder,
  onFocus: onHttpEndpointFocus,
  onBlur: onHttpEndpointBlur,
  onPaste: onHttpEndpointPaste,
} = usePasteableHttpEndpoint(form, () => props.dbType)

function flagEnabled(value: string | undefined): boolean {
  return Boolean(value && /^(true|1|yes|on)$/i.test(value))
}

const esKibanaMode = computed({
  get: () => elasticsearchConnectionMode(form.value.advancedConfig) === 'kibana',
  set: (enabled: boolean) => {
    form.value.advancedConfig = enabled
      ? upsertAdvancedProperty(form.value.advancedConfig, 'mode', 'kibana')
      : removeAdvancedProperty(removeAdvancedProperty(form.value.advancedConfig, 'mode'), 'kibanaBasePath')
  },
})
const esKibanaBasePath = computed({
  get: () => readAdvancedProperty(form.value.advancedConfig, 'kibanaBasePath') ?? '',
  set: (value: string) => {
    const path = normalizeKibanaBasePath(value)
    form.value.advancedConfig = path
      ? upsertAdvancedProperty(form.value.advancedConfig, 'kibanaBasePath', path)
      : removeAdvancedProperty(form.value.advancedConfig, 'kibanaBasePath')
  },
})
const esConnectivityPath = computed({
  get: () => readAdvancedProperty(form.value.advancedConfig, 'connectivityCheckPath') ?? '',
  set: (value: string) => {
    const path = normalizeElasticsearchConnectivityCheckPath(value)
    form.value.advancedConfig = path
      ? upsertAdvancedProperty(form.value.advancedConfig, 'connectivityCheckPath', path)
      : removeAdvancedProperty(form.value.advancedConfig, 'connectivityCheckPath')
  },
})
const esSkipConnectivity = computed({
  get: () => flagEnabled(readAdvancedProperty(form.value.advancedConfig, 'connectivityCheckDisabled')),
  set: (enabled: boolean) => {
    form.value.advancedConfig = enabled
      ? upsertAdvancedProperty(form.value.advancedConfig, 'connectivityCheckDisabled', 'true')
      : removeAdvancedProperty(form.value.advancedConfig, 'connectivityCheckDisabled')
  },
})
const esUseHttps = computed({
  get: () => flagEnabled(readAdvancedProperty(form.value.advancedConfig, 'useHttps')),
  set: (enabled: boolean) => {
    form.value.advancedConfig = enabled
      ? upsertAdvancedProperty(form.value.advancedConfig, 'useHttps', 'true')
      : removeAdvancedProperty(form.value.advancedConfig, 'useHttps')
  },
})
const esSkipTls = computed({
  get: () => flagEnabled(readAdvancedProperty(form.value.advancedConfig, 'insecureSkipTlsVerify')),
  set: (enabled: boolean) => {
    form.value.advancedConfig = enabled
      ? upsertAdvancedProperty(form.value.advancedConfig, 'insecureSkipTlsVerify', 'true')
      : removeAdvancedProperty(form.value.advancedConfig, 'insecureSkipTlsVerify')
  },
})

const {t} = useI18n()

const nacosImplementation = computed({
  get: (): NacosImplementation => readNacosImplementation(form.value.advancedConfig),
  set: (value: NacosImplementation) => {
    writeNacosMode(value, value === 'rnacos' ? 'auto' : readNacosVersionMode(form.value.advancedConfig))
  },
})
const nacosVersionMode = computed({
  get: (): NacosVersionMode => readNacosVersionMode(form.value.advancedConfig),
  set: (value: NacosVersionMode) => {
    writeNacosMode(readNacosImplementation(form.value.advancedConfig), value)
  },
})
const nacosImplementationOptions = computed(() => [
  {value: 'nacos', label: t('connection.nacosImplementationNacos')},
  {value: 'rnacos', label: 'r-nacos'},
])
const nacosVersionOptions = computed(() => [
  {value: 'auto', label: t('connection.nacosVersionAuto')},
  {value: 'v2', label: '2.x'},
  {value: 'v3', label: '3.x'},
])
const nacosContextPath = computed({
  get: () => {
    const stored = readAdvancedProperty(form.value.advancedConfig, 'contextPath')
    if (stored) return stored
    return defaultNacosContextPath(nacosImplementation.value, nacosVersionMode.value, form.value.port)
  },
  set: (value: string) => {
    const trimmed = value.trim()
    const contextPath = !trimmed || trimmed === '/' ? '/' : (trimmed.startsWith('/') ? trimmed : `/${trimmed}`)
    let advanced = upsertAdvancedProperty(form.value.advancedConfig, 'contextPath', contextPath)
    advanced = upsertAdvancedProperty(advanced, NACOS_CONTEXT_CUSTOM_KEY, 'true')
    form.value.advancedConfig = advanced
  },
})
const nacosNamespacePickerOpen = ref(false)
const nacosNamespaceSummary = computed(() => {
  const visible = readVisibleNacosNamespaces(form.value.advancedConfig)
  if (!visible) return t('connection.nacosNamespaceAll')
  if (!visible.length) return t('connection.nacosNamespaceNone')
  return t('connection.nacosNamespaceSelected', {count: visible.length, total: visible.length})
})

function onNacosNamespaceSave(ids: string[] | null) {
  let advanced = ids
      ? upsertAdvancedProperty(form.value.advancedConfig, NACOS_VISIBLE_NAMESPACES_KEY, formatVisibleNacosNamespaces(ids))
      : removeAdvancedProperty(form.value.advancedConfig, NACOS_VISIBLE_NAMESPACES_KEY)
  const preferred = (ids ?? []).find((id) => id)
  if (ids && preferred) {
    advanced = upsertAdvancedProperty(advanced, NACOS_NAMESPACE_KEY, preferred)
  } else if (ids) {
    advanced = removeAdvancedProperty(advanced, NACOS_NAMESPACE_KEY)
  }
  form.value.advancedConfig = advanced
}
const nacosAddressPlaceholder = computed(() =>
    nacosConsolePlaceholder(nacosImplementation.value, nacosVersionMode.value),
)
const showRNacosConsoleWarning = computed(() =>
    nacosImplementation.value === 'rnacos' && isRNacosWebConsoleAddress(nacosAddressDraft.value),
)

function writeNacosMode(implementation: NacosImplementation, versionMode: NacosVersionMode) {
  const mode: NacosVersionMode = implementation === 'rnacos' ? 'auto' : versionMode
  let advanced = upsertAdvancedProperty(form.value.advancedConfig, NACOS_IMPLEMENTATION_KEY, implementation)
  advanced = upsertAdvancedProperty(advanced, NACOS_VERSION_MODE_KEY, mode)
  const custom = readAdvancedProperty(advanced, NACOS_CONTEXT_CUSTOM_KEY) === 'true'
  const localHost = form.value.host === 'localhost' || form.value.host === '127.0.0.1'
  let port = form.value.port
  if (localHost && !custom) {
    const wantsV2Port = implementation === 'rnacos' || mode === 'v2'
    if (wantsV2Port && port === '8080') port = '8848'
    if (!wantsV2Port && mode === 'v3' && port === '8848') port = '8080'
  }
  if (!custom) {
    advanced = upsertAdvancedProperty(advanced, 'contextPath', defaultNacosContextPath(implementation, mode, port))
  }
  form.value.port = port
  form.value.advancedConfig = advanced
}

function restoreNacosContext() {
  let advanced = removeAdvancedProperty(form.value.advancedConfig, NACOS_CONTEXT_CUSTOM_KEY)
  advanced = upsertAdvancedProperty(
      advanced,
      'contextPath',
      defaultNacosContextPath(nacosImplementation.value, nacosVersionMode.value, form.value.port),
  )
  form.value.advancedConfig = advanced
}

const endpointAddressLabel = computed(() => {
  switch (props.dbType) {
    case 'jenkins': return t('connection.jenkinsAddress')
    case 'polaris': return t('connection.polarisAddress')
    case 'yarn': return t('connection.yarnAddress')
    case 'kubernetes': return t('connection.kubernetesAddress')
    default: return t('connection.host')
  }
})
const endpointAddressHint = computed(() => {
  switch (props.dbType) {
    case 'jenkins': return t('connection.hints.jenkinsHost')
    case 'polaris': return t('connection.hints.polarisHost')
    case 'yarn': return t('connection.hints.yarnResourceManager')
    case 'kubernetes': return t('connection.hints.kubernetesApiServer')
    default: return undefined
  }
})

const envOptions = computed(() =>
    CONNECTION_ENV_OPTIONS.map((value) => ({
      value,
      label: t(`connection.envOptions.${value}`),
    })),
)
const showEnvCustom = computed(() => form.value.env === 'custom')
const storageOptions = computed(() =>
    CONNECTION_STORAGE_OPTIONS.map((value) => ({
      value,
      label: t(`connection.storageOptions.${value.toLowerCase()}`),
    })),
)
const authOptions = computed(() =>
    CONNECTION_AUTH_OPTIONS.map((value) => ({value, label: value})),
)
const k8sAuthOptions = computed(() => [
  {value: 'token', label: t('connection.authOptions.token')},
  {value: 'kubeconfig', label: t('connection.authOptions.kubeconfig')},
])
</script>

<template>
  <div class="conn-grid">
    <ConnectionFormField wide :label="t('connection.name')" :hint="t('connection.hints.name')">
      <DwInput
          v-model="form.name"
          variant="sm"
          :disabled="readOnly"
          :placeholder="t('connection.namePlaceholder')"
      />
    </ConnectionFormField>

    <ConnectionFormField :label="t('connection.env')" :hint="t('connection.hints.env')">
      <SettingsSelect v-model="form.env" size="sm" :disabled="readOnly" :options="envOptions"/>
    </ConnectionFormField>
    <ConnectionFormField
        v-if="showEnvCustom"
        :label="t('connection.envCustom')"
        :hint="t('connection.hints.envCustom')"
    >
      <DwInput
          v-model="form.envCustom"
          variant="sm"
          :disabled="readOnly"
          :placeholder="t('connection.envCustomPlaceholder')"
      />
    </ConnectionFormField>
    <ConnectionFormField :label="t('connection.storage')">
      <SettingsSelect v-model="form.storage" size="sm" :disabled="readOnly" :options="storageOptions"/>
    </ConnectionFormField>

    <PluginConnectionFields
        v-if="dbType === 'plugin'"
        v-model:form="form"
        :read-only="readOnly"
    />

    <template v-else>
    <template v-if="dbType === 'kafka'">
      <ConnectionFormField
          wide
          :label="t('connection.kafkaBootstrap')"
          :hint="t('connection.hints.kafkaBootstrap')"
      >
        <DwInput
            v-model="kafkaBootstrap"
            variant="sm"
            :disabled="readOnly"
            :placeholder="t('connection.kafkaBootstrapPlaceholder')"
        />
      </ConnectionFormField>
      <ConnectionFormField :label="t('connection.kafkaSecurity')">
        <SettingsSelect
            v-model="kafkaSecurityProtocol"
            size="sm"
            :disabled="readOnly"
            :options="kafkaSecurityOptions"
        />
      </ConnectionFormField>
      <ConnectionFormField :label="t('connection.auth')">
        <SettingsSelect v-model="form.auth" size="sm" :disabled="readOnly" :options="authOptions"/>
      </ConnectionFormField>
      <template v-if="form.auth !== 'NONE'">
        <ConnectionFormField :label="t('connection.username')">
          <DwInput v-model="form.user" variant="sm" :disabled="readOnly"/>
        </ConnectionFormField>
        <ConnectionFormField :label="t('connection.password')">
          <DwSecretInput
              v-model="form.password"
              variant="sm"
              :disabled="readOnly"
              :show-label="t('connection.showPassword')"
              :hide-label="t('connection.hidePassword')"
          />
        </ConnectionFormField>
        <ConnectionFormField wide :label="t('connection.kafkaSaslMechanism')">
          <SettingsSelect
              v-model="kafkaSaslMechanism"
              size="sm"
              :disabled="readOnly"
              :options="kafkaSaslOptions"
          />
        </ConnectionFormField>
      </template>
      <ConnectionFormField wide :label="t('connection.kafkaTls')">
        <DwCheckbox v-model="kafkaSkipTls" :disabled="readOnly" :label="t('connection.kafkaSkipTls')"/>
      </ConnectionFormField>
    </template>

    <template v-else-if="dbType === 'elasticsearch'">
      <ConnectionFormField wide :label="t('connection.esHttps')">
        <DwCheckbox v-model="esUseHttps" :disabled="readOnly" :label="t('connection.esHttps')"/>
      </ConnectionFormField>
      <ConnectionFormField wide :label="t('connection.esKibana')">
        <DwCheckbox v-model="esKibanaMode" :disabled="readOnly" :label="t('connection.esKibana')"/>
      </ConnectionFormField>
      <ConnectionFormField v-if="esKibanaMode" :label="t('connection.esKibanaBasePath')">
        <DwInput v-model="esKibanaBasePath" variant="sm" :disabled="readOnly" placeholder="/kibana"/>
      </ConnectionFormField>
      <ConnectionFormField :label="t('connection.esConnectivityPath')">
        <DwInput v-model="esConnectivityPath" variant="sm" :disabled="readOnly" placeholder="/_cluster/health"/>
      </ConnectionFormField>
      <ConnectionFormField wide :label="t('connection.esSkipConnectivity')">
        <DwCheckbox v-model="esSkipConnectivity" :disabled="readOnly" :label="t('connection.esSkipConnectivity')"/>
      </ConnectionFormField>
      <ConnectionFormField wide :label="t('connection.esSkipTls')">
        <DwCheckbox v-model="esSkipTls" :disabled="readOnly" :label="t('connection.esSkipTls')"/>
      </ConnectionFormField>
    </template>

    <template v-else-if="dbType === 'kudu'">
      <ConnectionFormField
          wide
          :label="t('connection.kuduMasters')"
          :hint="t('connection.hints.kuduMasters')"
      >
        <DwInput
            v-model="kuduMasters"
            variant="sm"
            :disabled="readOnly"
            :placeholder="t('connection.kuduMastersPlaceholder')"
        />
      </ConnectionFormField>
    </template>

    <template v-else-if="dbType === 'nacos'">
      <ConnectionFormField :label="t('connection.nacosImplementation')" :hint="t('connection.hints.nacosImplementation')">
        <SettingsSelect
            v-model="nacosImplementation"
            size="sm"
            :disabled="readOnly"
            :options="nacosImplementationOptions"
        />
      </ConnectionFormField>
      <ConnectionFormField
          v-if="nacosImplementation !== 'rnacos'"
          :label="t('connection.nacosVersion')"
          :hint="t('connection.hints.nacosVersion')"
      >
        <SettingsSelect
            v-model="nacosVersionMode"
            size="sm"
            :disabled="readOnly"
            :options="nacosVersionOptions"
        />
      </ConnectionFormField>
      <ConnectionFormField
          wide
          :label="t('connection.nacosConsoleAddress')"
          :hint="t('connection.hints.nacosHost')"
      >
        <DwInput
            v-model="nacosAddressDraft"
            variant="sm"
            :disabled="readOnly"
            :placeholder="nacosAddressPlaceholder"
            @focus="nacosAddressFocused = true"
            @blur="onNacosAddressBlur"
            @paste="onNacosAddressPaste"
        />
        <p v-if="showRNacosConsoleWarning" class="nacos-warn">{{ t('connection.hints.nacosRNacosConsole') }}</p>
      </ConnectionFormField>
      <ConnectionFormField :label="t('connection.nacosContextPath')" :hint="t('connection.hints.nacosContextPath')">
        <DwInput v-model="nacosContextPath" variant="sm" :disabled="readOnly" placeholder="/nacos"/>
        <button type="button" class="nacos-link" :disabled="readOnly" @click="restoreNacosContext">
          {{ t('connection.nacosContextRestore') }}
        </button>
      </ConnectionFormField>
      <ConnectionFormField wide :label="t('connection.nacosNamespace')" :hint="t('connection.hints.nacosNamespace')">
        <div class="nacos-ns-row">
          <span>{{ nacosNamespaceSummary }}</span>
          <button type="button" class="nacos-link" :disabled="readOnly" @click="nacosNamespacePickerOpen = true">
            {{ t('connection.nacosNamespacePick') }}
          </button>
        </div>
      </ConnectionFormField>
      <NacosNamespacePickerDialog
          v-model:open="nacosNamespacePickerOpen"
          :form="form"
          @save="onNacosNamespaceSave"
      />
    </template>
    <template v-else-if="httpEndpointKind">
      <ConnectionFormField
          wide
          :label="endpointAddressLabel"
          :hint="endpointAddressHint"
      >
        <DwInput
            v-model="httpEndpointDraft"
            variant="sm"
            :disabled="readOnly"
            :placeholder="httpEndpointPlaceholder"
            @focus="onHttpEndpointFocus"
            @blur="onHttpEndpointBlur"
            @paste="onHttpEndpointPaste"
        />
      </ConnectionFormField>
    </template>
    <template v-else>
    <ConnectionFormField
        :label="t('connection.host')"
        :hint="dbType === 'ssh' ? t('connection.hints.sshHost') : undefined"
    >
      <DwInput
          v-model="form.host"
          variant="sm"
          :disabled="readOnly"
          placeholder="localhost"
      />
    </ConnectionFormField>
    <ConnectionFormField :label="t('connection.port')">
      <DwInput v-model="form.port" variant="sm" :disabled="readOnly"/>
    </ConnectionFormField>
    </template>

    <ConnectionFormField v-if="dbType === 'oracle'" wide :label="t('connection.sid')">
      <DwInput v-model="form.sid" variant="sm" :disabled="readOnly"/>
    </ConnectionFormField>

    <ConnectionFormField
        v-if="dbType === 'redis'"
        wide
        :label="t('connection.redisDbIndex')"
        :hint="t('connection.hints.redisDbIndex')"
    >
      <DwInput v-model="form.database" variant="sm" :disabled="readOnly" placeholder="0"/>
    </ConnectionFormField>

    <ConnectionFormField
        v-else-if="dbType !== 'oracle' && dbType !== 'kafka' && dbType !== 'kudu' && dbType !== 'yarn' && dbType !== 'jenkins' && dbType !== 'nacos' && dbType !== 'polaris' && dbType !== 'kubernetes' && dbType !== 'ssh'"
        wide
        :label="t('connection.database')"
        :hint="t('connection.hints.database')"
    >
      <DwInput v-model="form.database" variant="sm" :disabled="readOnly"/>
    </ConnectionFormField>

    <ConnectionFormField
        v-if="dbType !== 'ssh' && dbType !== 'nacos' && dbType !== 'kafka' && dbType !== 'kudu' && !httpEndpointKind"
        wide
        :label="t('connection.url')"
    >
      <DwInput v-model="form.url" variant="sm" class="url-input" readonly/>
    </ConnectionFormField>

    <template v-if="dbType === 'ssh'">
      <ConnectionFormField :label="t('connection.username')">
        <DwInput v-model="form.user" variant="sm" :disabled="readOnly"/>
      </ConnectionFormField>
      <ConnectionFormField :label="t('connection.password')" :hint="t('connection.hints.sshPassword')">
        <DwSecretInput
            v-model="form.password"
            variant="sm"
            :disabled="readOnly"
            :show-label="t('connection.showPassword')"
            :hide-label="t('connection.hidePassword')"
        />
      </ConnectionFormField>
      <ConnectionFormField
          wide
          :label="t('connection.sshPrivateKey')"
          :hint="t('connection.hints.sshPrivateKey')"
      >
        <DwInput
            v-model="form.sshPrivateKey"
            class="ssh-key-input"
            variant="mono"
            :rows="4"
            :disabled="readOnly"
            :placeholder="t('connection.sshPrivateKeyPlaceholder')"
        />
      </ConnectionFormField>
      <ConnectionFormField :label="t('connection.sshPassphrase')">
        <DwSecretInput
            v-model="form.sshPassphrase"
            variant="sm"
            :disabled="readOnly"
            :show-label="t('connection.showPassword')"
            :hide-label="t('connection.hidePassword')"
        />
      </ConnectionFormField>
      <ConnectionFormField
          wide
          :label="t('connection.jumpSection')"
          :hint="t('connection.collapseDesc.jump')"
      >
        <SettingsSwitch
            :model-value="!!form.sshEnabled"
            :label="t('connection.jumpEnable')"
            :disabled="readOnly"
            @update:model-value="form.sshEnabled = $event"
        />
      </ConnectionFormField>
      <template v-if="form.sshEnabled">
        <ConnectionFormField :label="t('connection.jumpHost')">
          <DwInput v-model="form.sshHost" variant="sm" :disabled="readOnly" placeholder="bastion.example.com"/>
        </ConnectionFormField>
        <ConnectionFormField :label="t('connection.jumpPort')">
          <DwInput v-model="form.sshPort" variant="sm" :disabled="readOnly" placeholder="22"/>
        </ConnectionFormField>
        <ConnectionFormField :label="t('connection.jumpUser')">
          <DwInput v-model="form.sshUser" variant="sm" :disabled="readOnly"/>
        </ConnectionFormField>
        <ConnectionFormField :label="t('connection.jumpPassword')">
          <DwSecretInput
              v-model="form.sshPassword"
              variant="sm"
              :disabled="readOnly"
              :show-label="t('connection.showPassword')"
              :hide-label="t('connection.hidePassword')"
          />
        </ConnectionFormField>
        <ConnectionFormField
            wide
            :label="t('connection.jumpPrivateKey')"
            :hint="t('connection.hints.jumpPrivateKey')"
        >
          <DwInput
              v-model="form.jumpPrivateKey"
              class="ssh-key-input"
              variant="mono"
              :rows="4"
              :disabled="readOnly"
              :placeholder="t('connection.jumpPrivateKeyPlaceholder')"
          />
        </ConnectionFormField>
        <ConnectionFormField :label="t('connection.jumpPassphrase')">
          <DwSecretInput
              v-model="form.jumpPassphrase"
              variant="sm"
              :disabled="readOnly"
              :show-label="t('connection.showPassword')"
              :hide-label="t('connection.hidePassword')"
          />
        </ConnectionFormField>
      </template>
    </template>

    <template v-else-if="dbType === 'kubernetes'">
      <ConnectionFormField wide :label="t('connection.auth')">
        <SettingsSelect v-model="form.auth" size="sm" :disabled="readOnly" :options="k8sAuthOptions"/>
      </ConnectionFormField>
      <ConnectionFormField
          wide
          :label="form.auth === 'kubeconfig' ? t('connection.kubeconfig') : t('connection.bearerToken')"
          :hint="form.auth === 'kubeconfig' ? t('connection.hints.kubeconfig') : t('connection.hints.bearerToken')"
      >
        <DwInput
            v-if="form.auth === 'kubeconfig'"
            v-model="form.password"
            class="ssh-key-input"
            variant="mono"
            :rows="6"
            :disabled="readOnly"
            :placeholder="t('connection.kubeconfigPlaceholder')"
        />
        <DwSecretInput
            v-else
            v-model="form.password"
            variant="sm"
            :disabled="readOnly"
            :show-label="t('connection.showPassword')"
            :hide-label="t('connection.hidePassword')"
        />
      </ConnectionFormField>
    </template>

    <template v-else-if="dbType === 'redis'">
      <ConnectionFormField
          :label="t('connection.username')"
          :hint="t('connection.hints.redisUsername')"
      >
        <DwInput
            v-model="form.user"
            variant="sm"
            :disabled="readOnly"
            :placeholder="t('connection.redisUsernameOptional')"
        />
      </ConnectionFormField>
      <ConnectionFormField
          :label="t('connection.password')"
          :hint="t('connection.hints.redisPassword')"
      >
        <DwSecretInput
            v-model="form.password"
            variant="sm"
            :disabled="readOnly"
            :placeholder="t('connection.redisPasswordOptional')"
            :show-label="t('connection.showPassword')"
            :hide-label="t('connection.hidePassword')"
        />
      </ConnectionFormField>
    </template>

    <template v-else-if="dbType !== 'kafka' && dbType !== 'kudu'">
    <ConnectionFormField wide :label="t('connection.auth')">
      <SettingsSelect v-model="form.auth" size="sm" :disabled="readOnly" :options="authOptions"/>
    </ConnectionFormField>

    <template v-if="form.auth !== 'NONE'">
      <ConnectionFormField :label="t('connection.username')">
        <DwInput v-model="form.user" variant="sm" :disabled="readOnly"/>
      </ConnectionFormField>
      <ConnectionFormField :label="t('connection.password')">
        <DwSecretInput
            v-model="form.password"
            variant="sm"
            :disabled="readOnly"
            :show-label="t('connection.showPassword')"
            :hide-label="t('connection.hidePassword')"
        />
      </ConnectionFormField>
    </template>
    </template>
    </template>
  </div>

  <ConnectionMoreOptions
      v-if="dbType !== 'ssh' && dbType !== 'plugin'"
      :form="form"
      :read-only="readOnly"
  />
</template>

<style scoped>
.conn-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--dw-space-6) var(--dw-space-7);
}

.url-input {
  font-family: var(--dw-mono);
  font-size: var(--dw-text-sm);
  background: var(--dw-bg-muted);
  color: var(--dw-text-secondary);
}

.nacos-warn {
  margin: var(--dw-space-2) 0 0;
  color: var(--dw-warning);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
}

.nacos-link {
  align-self: flex-start;
  margin-top: var(--dw-space-1);
  padding: 0;
  border: 0;
  background: none;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  cursor: pointer;
}

.nacos-link:disabled {
  cursor: default;
  opacity: 0.5;
}

.nacos-ns-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-space-3);
  min-height: var(--dw-input-height-sm);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
}

.ssh-key-input,
:deep(.ssh-key-input) {
  min-height: 88px;
  resize: vertical;
  font-family: var(--dw-mono);
  font-size: var(--dw-text-sm);
}

@media (max-width: 520px) {
  .conn-grid {
    grid-template-columns: 1fr;
  }
}
</style>
