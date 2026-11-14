<script setup lang="ts">
defineOptions({name: 'ConnectionFormTab'})

import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import DbTypeIcon from '@/core/components/DbTypeIcon.vue'
import {DB_TYPE_ICON_SIZE} from '@/features/connection/constants/db-type-icon-sizes'
import ConnectionFormFields from '@/features/connection/components/ConnectionFormFields.vue'
import ConnectionFormFooter from '@/features/connection/components/ConnectionFormFooter.vue'
import {DwInlineAlert} from '@/core/components'
import ConnectionPreviewPanel from '@/features/connection/components/ConnectionPreviewPanel.vue'
import {useConnectionForm} from '@/features/connection/composables/useConnectionForm'
import {useConnectionTabActions} from '@/features/connection/composables/useConnectionTabActions'
import {useConnectionTest} from '@/features/connection/composables/useConnectionTest'
import {isUnsavedConnectionId} from '@/features/connection/utils/connection-defaults'
import {isJdbcSshTunnelEnabled} from '@/features/ssh/services/ssh-jdbc-tunnel.service'
import IconButton from '@/core/components/IconButton.vue'
import {DwIcon, ensureDeferredDwIcons} from '@/core/icons'

void ensureDeferredDwIcons()
import type {WorkspaceTab} from '@/core/types'
import {fetchConnectionFromCatalog} from '@/shared/config/connections-catalog.service'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import CommunityChallengeDialog from '@/features/community-plugin/components/CommunityChallengeDialog.vue'
import {
    setCommunityChallengeHandler,
    type ConnectionChallenge,
} from '@/features/community-plugin/lib/runCommunityPluginConnectionTest'

const workspace = useWorkspaceStore()

const {t} = useI18n()
const props = defineProps<{ tab: WorkspaceTab }>()

const dbType = computed(() => props.tab.dbType!)
const isEdit = computed(() =>
    !!props.tab.connectionId && !isUnsavedConnectionId(props.tab.connectionId),
)
const loading = ref(false)
const loadError = ref('')

const {form, label, getPayload, applyConfig} = useConnectionForm(dbType.value)

const {
  testing,
  testMessage,
  testOk,
  missingConnectorId,
  missingConnectorLabel,
  installing,
  driverInstallFailed,
  testConnection,
  installMissingConnectorAndRetry,
} = useConnectionTest(
    getPayload,
    () => props.tab.connectionId,
)
const fieldsRef = ref<{validate: () => boolean} | null>(null)

const {
  saveConnection: saveConnectionAction,
  cancel,
  saving,
  canSave,
  actionMessage,
  actionOk,
} = useConnectionTabActions({
  tabId: props.tab.id,
  form,
  getPayload,
  getLabel: () => label.value,
  editingConnectionId: () => props.tab.connectionId,
  targetGroupId: () => props.tab.targetGroupId,
})

async function saveConnection() {
  if (fieldsRef.value && !fieldsRef.value.validate()) return
  await saveConnectionAction()
}

async function onTestConnection() {
  if (fieldsRef.value && !fieldsRef.value.validate()) return
  // A2-1: 已探测到缺连接器时，再次点「测试」直接走安装并重试，避免断流
  if (missingConnectorId.value) {
    await installMissingConnectorAndRetry()
    return
  }
  await testConnection()
}

function openConnectorMarketFromForm() {
  usePluginStore().openConnectorMarket()
}

const busy = computed(() => saving.value || testing.value || installing.value)
const readOnly = computed(() => !canSave.value)
const jdbcTunnelSshReady = computed(() =>
    isEdit.value && isJdbcSshTunnelEnabled(form),
)
const busyHint = computed(() => {
  if (saving.value) return t('connection.savingHint')
  if (installing.value) return t('connection.installingConnectorHint')
  return t('connection.testingHint')
})
const canInstallConnector = computed(() => Boolean(missingConnectorId.value) && !installing.value)
const canOpenConnectorMarket = computed(
    () => driverInstallFailed.value && !canInstallConnector.value && !installing.value,
)

// Community-plugin connection challenges (host key / MFA prompts) resolve here
// instead of window.confirm; "remember" auto-accepts later identical fingerprints.
const challengeOpen = ref(false)
const activeChallenge = ref<ConnectionChallenge | null>(null)
let challengeResolve: ((decision: {accept: boolean; remember: boolean}) => void) | null = null

onMounted(() => {
  setCommunityChallengeHandler((challenge) => new Promise((resolve) => {
    activeChallenge.value = challenge
    challengeOpen.value = true
    challengeResolve = resolve
  }))
})

onBeforeUnmount(() => {
  setCommunityChallengeHandler(null)
})

function onChallengeResolve(decision: {accept: boolean; remember: boolean}) {
  challengeOpen.value = false
  challengeResolve?.(decision)
  challengeResolve = null
}

function loadConnectionFromCatalog(options?: {force?: boolean}) {
  if (props.tab.pluginId) {
    form.pluginId = props.tab.pluginId
    form.pluginConnectionProvider = props.tab.pluginConnectionProvider
    if (!form.name && props.tab.title) {
      form.name = props.tab.title
    }
  }
  if (!props.tab.connectionId || isUnsavedConnectionId(props.tab.connectionId)) return
  // Avoid clobbering in-progress edits on routine activate; still recover after failed loads.
  if (!options?.force && !loadError.value && form.name) return
  loading.value = true
  loadError.value = ''
  void fetchConnectionFromCatalog(props.tab.connectionId)
      .then((config) => {
        if (!config) {
          loadError.value = t('connection.loadFailed')
          return
        }
        applyConfig(config)
      })
      .catch(() => {
        loadError.value = t('connection.loadFailed')
      })
      .finally(() => {
        loading.value = false
      })
}

onMounted(() => {
  loadConnectionFromCatalog({force: true})
})

watch(
  () => workspace.tabActivateRefreshSeq[props.tab.id] ?? 0,
  (seq, prev) => {
    if (!seq || seq === prev) return
    loadConnectionFromCatalog({force: Boolean(loadError.value)})
  },
)

function openJdbcTunnelSshTerminal() {
  const connectionId = props.tab.connectionId
  if (!connectionId || !jdbcTunnelSshReady.value) return
  workspace.openSshTerminal({
    connectionId,
    connectionName: form.name || connectionId,
    explorerNodeId: connectionId,
  })
}
</script>

<template>
  <!--
    閰嶆柟锛歸b-extension / seam-split锛堢紪杈戝垪 + 棰勮鍒楋級锛屼笉寮哄埗 WorkbenchListPage
    AURA-X: [Modify] - Phase 6 鏍囨敞鎵╁睍閰嶆柟锛涜〃闈㈠凡璧?dw-workbench / token
    Protection: 鍔熻兘瀹屾暣鎬у凡楠岃瘉锛屾棤绠€鍖栬涓?
    浜烘牸: [@鍓嶇鑹烘湳瀹禲
  -->
  <div class="conn-layout dw-workbench-page dw-seam-split--direct" data-wb-recipe="wb-extension">
    <section class="conn-editor dw-inset-pane">
      <header class="conn-head">
        <DbTypeIcon class="conn-head__icon" :db-type="dbType" :size="DB_TYPE_ICON_SIZE.header"/>
        <div class="conn-head__text">
          <h1>
            {{
              isEdit
                  ? t('connection.editTitle', {name: form.name || tab.connectionId})
                  : t('connection.newTitle', {dbType: label})
            }}
          </h1>
          <p>{{ t('connection.formIntro') }}</p>
        </div>
        <IconButton
            v-if="jdbcTunnelSshReady"
            size="sm"
            :title="t('connection.openJdbcSshTunnel')"
            @click="openJdbcTunnelSshTerminal"
        >
          <DwIcon name="terminal" size="sm" :stroke-width="1.5"/>
        </IconButton>
      </header>

      <div v-if="loading" class="conn-loading">{{ t('connection.loading') }}</div>

      <div v-else class="conn-body-wrap">
        <div v-if="loadError" class="conn-readonly-hint">
          <DwInlineAlert :message="loadError"/>
        </div>
        <div v-else-if="readOnly" class="conn-readonly-hint">
          <DwInlineAlert variant="info" :message="t('connection.formReadOnlyHint')"/>
        </div>
        <div class="conn-body" :class="{'conn-body--busy': busy, 'conn-body--readonly': readOnly}">
          <ConnectionFormFields
              ref="fieldsRef"
              v-model:form="form"
              :db-type="dbType"
              :read-only="readOnly"
          />
        </div>
        <div v-if="busy" class="conn-busy" role="status" aria-live="polite">
          <span class="conn-busy__spinner" aria-hidden="true"/>
          <p class="conn-busy__text">{{ busyHint }}</p>
        </div>
      </div>

      <ConnectionFormFooter
          :testing="testing"
          :saving="saving"
          :save-disabled="!canSave"
          :test-message="testMessage"
          :test-ok="testOk"
          :action-message="actionMessage"
          :action-ok="actionOk"
          :can-install-connector="canInstallConnector"
          :installing-connector="installing"
          :missing-connector-label="missingConnectorLabel"
          :can-open-connector-market="canOpenConnectorMarket"
          @test="onTestConnection"
          @install-connector="installMissingConnectorAndRetry"
          @open-connector-market="openConnectorMarketFromForm"
          @cancel="cancel"
          @save="saveConnection"
      />
    </section>

    <ConnectionPreviewPanel :db-type="dbType" :label="label" :form="form"/>

    <CommunityChallengeDialog
        v-model:open="challengeOpen"
        :plugin-id="form.pluginId || ''"
        :challenge="activeChallenge"
        @resolve="onChallengeResolve"
    />
  </div>
</template>

<style scoped>
.conn-layout {
  display: grid;
  grid-template-columns: minmax(360px, 520px) minmax(280px, 1fr);
  min-height: 0;
  height: 100%;
  background: var(--dw-bg);
  overflow: hidden;
}

.conn-editor {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  border-right: 1px solid var(--dw-border-light);
}

.conn-head {
  display: flex;
  align-items: center;
  gap: var(--dw-space-6);
  flex-shrink: 0;
  padding: var(--dw-space-5) var(--dw-wb-content-pad-x);
  border-bottom: 1px solid var(--dw-wb-head-border);
  background: var(--dw-wb-head-bg);
  box-shadow: var(--dw-wb-head-shadow);
}

.conn-head__icon {
  flex-shrink: 0;
}

.conn-head__text {
  flex: 1;
  min-width: 0;
}

.conn-head__text h1 {
  margin: 0;
  font-size: var(--dw-text-lg);
  font-weight: 700;
  line-height: var(--dw-leading-snug);
}

.conn-head__text p {
  margin: var(--dw-space-1) 0 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
}

.conn-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-md);
}

.conn-body-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.conn-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--dw-wb-content-pad-y) var(--dw-wb-content-pad-x) var(--dw-space-4);
  scrollbar-gutter: stable;
  transition: opacity 0.2s ease;
}

.conn-body--busy {
  pointer-events: none;
  opacity: 0.45;
}

.conn-readonly-hint {
  flex-shrink: 0;
  margin: 0;
  padding: var(--dw-space-5) var(--dw-space-10) 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading);
}

.conn-body--readonly:not(.conn-body--busy) {
  opacity: 0.92;
}

.conn-busy {
  position: absolute;
  inset: 0;
  z-index: var(--dw-z-raised);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--dw-gap-md);
  padding: var(--dw-space-10);
  text-align: center;
  background: color-mix(in srgb, var(--dw-bg-panel) 72%, transparent);
  backdrop-filter: blur(2px);
}

.conn-busy__spinner {
  width: 24px;
  height: var(--dw-control-h-xs);
  border: 2px solid color-mix(in srgb, var(--dw-primary) 20%, transparent);
  border-top-color: var(--dw-primary);
  border-radius: 50%;
  animation: conn-busy-spin 0.75s linear infinite;
}

.conn-busy__text {
  margin: 0;
  max-width: 240px;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading);
}

@keyframes conn-busy-spin {
  to {
    transform: rotate(360deg);
  }
}

:deep(.conn-preview) {
  min-height: 0;
  height: 100%;
  background: var(--dw-bg-muted);
}

@media (max-width: 900px) {
  .conn-layout {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .conn-editor {
    border-right: none;
    height: auto;
    min-height: min-content;
  }

  :deep(.conn-preview) {
    display: none;
  }
}

@media (max-width: 520px) {
  .conn-head,
  .conn-body,
  .conn-footer {
    padding-left: var(--dw-space-8);
    padding-right: var(--dw-space-8);
  }
}
</style>
