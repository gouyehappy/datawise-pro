import type {DbType} from '@/core/types'
import {CONNECTION_AUTH_OPTIONS} from '@/features/connection/constants/connection-options'
import {CONNECTION_CAPABILITY_MATRIX} from '@/shared/capabilities/generated/connection-capability-matrix'
import type {DescriptorFormField} from '@/features/connection/forms/descriptor-connection-bindings'
import {
  KAFKA_SASL_MECHANISMS,
  KAFKA_SECURITY_PROTOCOLS,
} from '@/features/connection/utils/kafka-security'

/**
 * Builtin connection field packs — same shape as community-plugin `fields[]`.
 * Labels / descriptions / placeholders are vue-i18n keys under `connection.*`.
 *
 * Remaining handwritten: nacos only (namespace picker dialog).
 */

const AUTH_VISIBLE: DescriptorFormField['visible_when'] = {
  field: 'auth',
  one_of: ['User&Password'],
}

const AUTH_OPTIONS = CONNECTION_AUTH_OPTIONS.map((value) => ({value, label: value}))

const KIBANA_VISIBLE: DescriptorFormField['visible_when'] = {
  field: 'es_kibana',
  one_of: ['true'],
}

/** Standard JDBC / sqlite-style relational form. */
export const BUILTIN_JDBC_FORM_FIELDS: DescriptorFormField[] = [
  {
    key: 'host',
    label: 'connection.host',
    type: 'text',
    binding: 'host',
    required: true,
    placeholder: 'localhost',
  },
  {
    key: 'port',
    label: 'connection.port',
    type: 'number',
    binding: 'port',
  },
  {
    key: 'database',
    label: 'connection.database',
    type: 'text',
    binding: 'database',
    description: 'connection.hints.database',
  },
  {
    key: 'url',
    label: 'connection.url',
    type: 'text',
    binding: 'url',
    readonly: true,
  },
  {
    key: 'auth',
    label: 'connection.auth',
    type: 'select',
    binding: 'auth',
    options: AUTH_OPTIONS,
  },
  {
    key: 'user',
    label: 'connection.username',
    type: 'text',
    binding: 'user',
    visible_when: AUTH_VISIBLE,
  },
  {
    key: 'password',
    label: 'connection.password',
    type: 'password',
    binding: 'password',
    visible_when: AUTH_VISIBLE,
  },
]

/** Oracle: SID instead of database name. */
export const BUILTIN_ORACLE_FORM_FIELDS: DescriptorFormField[] = [
  {
    key: 'host',
    label: 'connection.host',
    type: 'text',
    binding: 'host',
    required: true,
    placeholder: 'localhost',
  },
  {
    key: 'port',
    label: 'connection.port',
    type: 'number',
    binding: 'port',
  },
  {
    key: 'sid',
    label: 'connection.sid',
    type: 'text',
    binding: 'sid',
  },
  {
    key: 'url',
    label: 'connection.url',
    type: 'text',
    binding: 'url',
    readonly: true,
  },
  {
    key: 'auth',
    label: 'connection.auth',
    type: 'select',
    binding: 'auth',
    options: AUTH_OPTIONS,
  },
  {
    key: 'user',
    label: 'connection.username',
    type: 'text',
    binding: 'user',
    visible_when: AUTH_VISIBLE,
  },
  {
    key: 'password',
    label: 'connection.password',
    type: 'password',
    binding: 'password',
    visible_when: AUTH_VISIBLE,
  },
]

/** Redis: optional credentials, database index as redisDbIndex copy. */
export const BUILTIN_REDIS_FORM_FIELDS: DescriptorFormField[] = [
  {
    key: 'host',
    label: 'connection.host',
    type: 'text',
    binding: 'host',
    required: true,
    placeholder: 'localhost',
  },
  {
    key: 'port',
    label: 'connection.port',
    type: 'number',
    binding: 'port',
  },
  {
    key: 'database',
    label: 'connection.redisDbIndex',
    type: 'text',
    binding: 'database',
    description: 'connection.hints.redisDbIndex',
    placeholder: '0',
  },
  {
    key: 'url',
    label: 'connection.url',
    type: 'text',
    binding: 'url',
    readonly: true,
  },
  {
    key: 'user',
    label: 'connection.username',
    type: 'text',
    binding: 'user',
    description: 'connection.hints.redisUsername',
    placeholder: 'connection.redisUsernameOptional',
  },
  {
    key: 'password',
    label: 'connection.password',
    type: 'password',
    binding: 'password',
    description: 'connection.hints.redisPassword',
    placeholder: 'connection.redisPasswordOptional',
  },
]

/** Mongo / generic “host + database + auth” (same shape as JDBC without SID). */
export const BUILTIN_MONGO_FORM_FIELDS: DescriptorFormField[] = BUILTIN_JDBC_FORM_FIELDS

/** Kafka: bootstrap + security + optional SASL. */
export const BUILTIN_KAFKA_FORM_FIELDS: DescriptorFormField[] = [
  {
    key: 'bootstrap.servers',
    label: 'connection.kafkaBootstrap',
    type: 'text',
    binding: 'kafka_bootstrap',
    required: true,
    description: 'connection.hints.kafkaBootstrap',
    placeholder: 'connection.kafkaBootstrapPlaceholder',
  },
  {
    key: 'security.protocol',
    label: 'connection.kafkaSecurity',
    type: 'select',
    binding: 'config',
    options: [
      {value: '', label: 'connection.kafkaSecurityAuto'},
      ...KAFKA_SECURITY_PROTOCOLS.map((value) => ({value, label: value})),
    ],
  },
  {
    key: 'auth',
    label: 'connection.auth',
    type: 'select',
    binding: 'auth',
    options: AUTH_OPTIONS,
  },
  {
    key: 'user',
    label: 'connection.username',
    type: 'text',
    binding: 'user',
    visible_when: AUTH_VISIBLE,
  },
  {
    key: 'password',
    label: 'connection.password',
    type: 'password',
    binding: 'password',
    visible_when: AUTH_VISIBLE,
  },
  {
    key: 'sasl.mechanism',
    label: 'connection.kafkaSaslMechanism',
    type: 'select',
    binding: 'config',
    options: KAFKA_SASL_MECHANISMS.map((value) => ({value, label: value})),
    visible_when: AUTH_VISIBLE,
  },
  {
    key: 'kafka_skip_tls',
    label: 'connection.kafkaSkipTls',
    type: 'boolean',
    binding: 'kafka_skip_tls',
  },
]

/** Kudu: masters address list. */
export const BUILTIN_KUDU_FORM_FIELDS: DescriptorFormField[] = [
  {
    key: 'kudu.masters',
    label: 'connection.kuduMasters',
    type: 'text',
    binding: 'kudu_masters',
    required: true,
    description: 'connection.hints.kuduMasters',
    placeholder: 'connection.kuduMastersPlaceholder',
  },
]

/**
 * Elasticsearch: advanced flags + shared database/url/auth
 * (matches prior layout: no separate host/port row in the ES branch).
 */
export const BUILTIN_ELASTICSEARCH_FORM_FIELDS: DescriptorFormField[] = [
  {
    key: 'useHttps',
    label: 'connection.esHttps',
    type: 'boolean',
    binding: 'config',
  },
  {
    key: 'es_kibana',
    label: 'connection.esKibana',
    type: 'boolean',
    binding: 'es_kibana',
  },
  {
    key: 'kibanaBasePath',
    label: 'connection.esKibanaBasePath',
    type: 'text',
    binding: 'config',
    placeholder: '/kibana',
    visible_when: KIBANA_VISIBLE,
  },
  {
    key: 'connectivityCheckPath',
    label: 'connection.esConnectivityPath',
    type: 'text',
    binding: 'config',
    placeholder: '/_cluster/health',
  },
  {
    key: 'connectivityCheckDisabled',
    label: 'connection.esSkipConnectivity',
    type: 'boolean',
    binding: 'config',
  },
  {
    key: 'insecureSkipTlsVerify',
    label: 'connection.esSkipTls',
    type: 'boolean',
    binding: 'config',
  },
  {
    key: 'database',
    label: 'connection.database',
    type: 'text',
    binding: 'database',
    description: 'connection.hints.database',
  },
  {
    key: 'url',
    label: 'connection.url',
    type: 'text',
    binding: 'url',
    readonly: true,
  },
  {
    key: 'auth',
    label: 'connection.auth',
    type: 'select',
    binding: 'auth',
    options: AUTH_OPTIONS,
  },
  {
    key: 'user',
    label: 'connection.username',
    type: 'text',
    binding: 'user',
    visible_when: AUTH_VISIBLE,
  },
  {
    key: 'password',
    label: 'connection.password',
    type: 'password',
    binding: 'password',
    visible_when: AUTH_VISIBLE,
  },
]

const JUMP_VISIBLE: DescriptorFormField['visible_when'] = {
  field: 'sshEnabled',
  one_of: ['true'],
}

const K8S_TOKEN_VISIBLE: DescriptorFormField['visible_when'] = {
  field: 'auth',
  one_of: ['token'],
}

const K8S_KUBECONFIG_VISIBLE: DescriptorFormField['visible_when'] = {
  field: 'auth',
  one_of: ['kubeconfig'],
}

function httpEndpointPack(
  labelKey: string,
  hintKey: string,
  placeholder: string,
): DescriptorFormField[] {
  return [
    {
      key: 'http_endpoint',
      label: labelKey,
      type: 'text',
      binding: 'http_endpoint',
      required: true,
      description: hintKey,
      placeholder,
    },
  ]
}

/** Jenkins / Polaris / YARN — pasteable HTTP(S) address only. */
export const BUILTIN_JENKINS_FORM_FIELDS = httpEndpointPack(
  'connection.jenkinsAddress',
  'connection.hints.jenkinsHost',
  'http://127.0.0.1:8080/jenkins',
)
export const BUILTIN_POLARIS_FORM_FIELDS = httpEndpointPack(
  'connection.polarisAddress',
  'connection.hints.polarisHost',
  'http://127.0.0.1:8090',
)
export const BUILTIN_YARN_FORM_FIELDS = httpEndpointPack(
  'connection.yarnAddress',
  'connection.hints.yarnResourceManager',
  'http://127.0.0.1:8088',
)

/** Kubernetes: API server URL + token/kubeconfig. */
export const BUILTIN_KUBERNETES_FORM_FIELDS: DescriptorFormField[] = [
  ...httpEndpointPack(
    'connection.kubernetesAddress',
    'connection.hints.kubernetesApiServer',
    'https://127.0.0.1:6443',
  ),
  {
    key: 'auth',
    label: 'connection.auth',
    type: 'select',
    binding: 'auth',
    options: [
      {value: 'token', label: 'connection.authOptions.token'},
      {value: 'kubeconfig', label: 'connection.authOptions.kubeconfig'},
    ],
  },
  {
    key: 'bearerToken',
    label: 'connection.bearerToken',
    type: 'password',
    binding: 'password',
    description: 'connection.hints.bearerToken',
    visible_when: K8S_TOKEN_VISIBLE,
  },
  {
    key: 'kubeconfig',
    label: 'connection.kubeconfig',
    type: 'textarea',
    binding: 'password',
    description: 'connection.hints.kubeconfig',
    placeholder: 'connection.kubeconfigPlaceholder',
    visible_when: K8S_KUBECONFIG_VISIBLE,
  },
]

/** SSH: host credentials + optional jump host. */
export const BUILTIN_SSH_FORM_FIELDS: DescriptorFormField[] = [
  {
    key: 'host',
    label: 'connection.host',
    type: 'text',
    binding: 'host',
    required: true,
    description: 'connection.hints.sshHost',
    placeholder: 'localhost',
  },
  {
    key: 'port',
    label: 'connection.port',
    type: 'number',
    binding: 'port',
  },
  {
    key: 'user',
    label: 'connection.username',
    type: 'text',
    binding: 'user',
  },
  {
    key: 'password',
    label: 'connection.password',
    type: 'password',
    binding: 'password',
    description: 'connection.hints.sshPassword',
  },
  {
    key: 'sshPrivateKey',
    label: 'connection.sshPrivateKey',
    type: 'textarea',
    binding: 'sshPrivateKey',
    description: 'connection.hints.sshPrivateKey',
    placeholder: 'connection.sshPrivateKeyPlaceholder',
  },
  {
    key: 'sshPassphrase',
    label: 'connection.sshPassphrase',
    type: 'password',
    binding: 'sshPassphrase',
  },
  {
    key: 'sshEnabled',
    label: 'connection.jumpEnable',
    type: 'boolean',
    binding: 'sshEnabled',
    description: 'connection.collapseDesc.jump',
  },
  {
    key: 'sshHost',
    label: 'connection.jumpHost',
    type: 'text',
    binding: 'sshHost',
    placeholder: 'bastion.example.com',
    visible_when: JUMP_VISIBLE,
  },
  {
    key: 'sshPort',
    label: 'connection.jumpPort',
    type: 'text',
    binding: 'sshPort',
    placeholder: '22',
    visible_when: JUMP_VISIBLE,
  },
  {
    key: 'sshUser',
    label: 'connection.jumpUser',
    type: 'text',
    binding: 'sshUser',
    visible_when: JUMP_VISIBLE,
  },
  {
    key: 'sshPassword',
    label: 'connection.jumpPassword',
    type: 'password',
    binding: 'sshPassword',
    visible_when: JUMP_VISIBLE,
  },
  {
    key: 'jumpPrivateKey',
    label: 'connection.jumpPrivateKey',
    type: 'textarea',
    binding: 'jumpPrivateKey',
    description: 'connection.hints.jumpPrivateKey',
    placeholder: 'connection.jumpPrivateKeyPlaceholder',
    visible_when: JUMP_VISIBLE,
  },
  {
    key: 'jumpPassphrase',
    label: 'connection.jumpPassphrase',
    type: 'password',
    binding: 'jumpPassphrase',
    visible_when: JUMP_VISIBLE,
  },
]

/** Only nacos keeps handwritten Vue (namespace picker dialog). */
const HANDWRITTEN_BUILTIN_DB_TYPES = new Set<string>(['plugin', 'nacos'])

/**
 * Resolve builtin field descriptors for a dbType, or `null` to keep the
 * legacy ConnectionFormFields branches.
 */
export function resolveBuiltinConnectionFormFields(dbType: DbType | string): DescriptorFormField[] | null {
  const key = String(dbType || '').trim()
  if (!key || HANDWRITTEN_BUILTIN_DB_TYPES.has(key)) return null

  if (key === 'oracle') return BUILTIN_ORACLE_FORM_FIELDS
  if (key === 'redis') return BUILTIN_REDIS_FORM_FIELDS
  if (key === 'mongodb') return BUILTIN_MONGO_FORM_FIELDS
  if (key === 'kafka') return BUILTIN_KAFKA_FORM_FIELDS
  if (key === 'kudu') return BUILTIN_KUDU_FORM_FIELDS
  if (key === 'elasticsearch') return BUILTIN_ELASTICSEARCH_FORM_FIELDS
  if (key === 'jenkins') return BUILTIN_JENKINS_FORM_FIELDS
  if (key === 'polaris') return BUILTIN_POLARIS_FORM_FIELDS
  if (key === 'yarn') return BUILTIN_YARN_FORM_FIELDS
  if (key === 'kubernetes') return BUILTIN_KUBERNETES_FORM_FIELDS
  if (key === 'ssh') return BUILTIN_SSH_FORM_FIELDS

  const profile = CONNECTION_CAPABILITY_MATRIX.types[key]
  const formKind = profile?.formKind
  if (formKind === 'jdbc' || formKind === 'standard') {
    return BUILTIN_JDBC_FORM_FIELDS
  }
  if (formKind === 'mongo') return BUILTIN_MONGO_FORM_FIELDS
  if (formKind === 'mq') return BUILTIN_KAFKA_FORM_FIELDS
  if (formKind === 'redis') return BUILTIN_REDIS_FORM_FIELDS
  if (formKind === 'ssh') return BUILTIN_SSH_FORM_FIELDS
  if (formKind === 'document' && key === 'elasticsearch') return BUILTIN_ELASTICSEARCH_FORM_FIELDS
  if (key === 'generic' || formKind === 'other') {
    if (key === 'plugin') return null
    return BUILTIN_JDBC_FORM_FIELDS
  }
  return null
}

export function hasBuiltinConnectionFormFields(dbType: DbType | string): boolean {
  return resolveBuiltinConnectionFormFields(dbType) != null
}
