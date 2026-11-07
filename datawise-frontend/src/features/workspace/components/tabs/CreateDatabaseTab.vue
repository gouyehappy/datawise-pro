<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwInlineAlert, DwInput, DwSelect} from '@/core/components'
import type {SelectOption} from '@/core/components/select.types'
import type {WorkspaceTab} from '@/core/types'
import {explorerApi} from '@/api/modules/explorer'
import {
    buildCreateNamespaceSql,
    resolveCreateNamespaceErrorMessage,
    supportsMysqlCharsetOptions,
    type CreateNamespaceMode,
} from '@/features/explorer/services/create-namespace.service'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'

defineOptions({name: 'CreateDatabaseTab'})

const props = defineProps<{ tab: WorkspaceTab }>()
const {t} = useI18n()
const layout = useLayoutStore()
const explorer = useExplorerStore()
const workspace = useWorkspaceStore()

const mode = computed<CreateNamespaceMode>(() => props.tab.createNamespaceMode === 'schema' ? 'schema' : 'database')
const dbType = computed(() => props.tab.dbType)
const showMysqlOptions = computed(() => mode.value === 'database' && supportsMysqlCharsetOptions(dbType.value))
const showCatalog = computed(() => mode.value === 'schema' && (dbType.value === 'trino' || dbType.value === 'presto' || dbType.value === 'hive' || dbType.value === 'flink'))

const view = ref<'general' | 'sql'>('general')
const name = ref('')
const charset = ref('')
const collation = ref('')
const catalog = ref(props.tab.createNamespaceCatalog ?? '')
const saving = ref(false)
const formError = ref('')
const loadingOptions = ref(false)
const charsets = ref<Array<{ name: string; description: string; defaultCollation: string }>>([])
const collations = ref<Array<{ name: string; charset: string; isDefault: boolean }>>([])

const previewSql = computed(() => buildCreateNamespaceSql(mode.value, dbType.value, {
    name: name.value,
    charset: charset.value,
    collation: collation.value,
    catalog: catalog.value,
}))

const filteredCollations = computed(() => {
    if (!charset.value) return collations.value
    return collations.value.filter((item) => item.charset === charset.value)
})

const charsetOptions = computed<SelectOption[]>(() => [
    {value: '', label: t('explorer.createNamespace.charsetDefault')},
    ...charsets.value.map((item) => ({value: item.name, label: item.name})),
])

const collationOptions = computed<SelectOption[]>(() => [
    {value: '', label: t('explorer.createNamespace.collationDefault')},
    ...filteredCollations.value.map((item) => ({value: item.name, label: item.name})),
])

const canSave = computed(() => !!name.value.trim() && !saving.value)

onMounted(() => {
    if (showMysqlOptions.value && props.tab.connectionId) {
        void loadMysqlOptions(props.tab.connectionId)
    }
})

watch(charset, (next) => {
    if (!next) return
    const match = filteredCollations.value.find((item) => item.isDefault)
        ?? filteredCollations.value[0]
    if (match && (!collation.value || !filteredCollations.value.some((item) => item.name === collation.value))) {
        collation.value = match.name
    }
})

async function loadMysqlOptions(connectionId: string) {
    loadingOptions.value = true
    try {
        const result = await explorerApi.fetchMysqlCharsets(connectionId)
        charsets.value = result.charsets ?? []
        collations.value = result.collations ?? []
        if (!charset.value && charsets.value.length) {
            const utf8 = charsets.value.find((item) => item.name === 'utf8mb4') ?? charsets.value[0]
            charset.value = utf8.name
            collation.value = utf8.defaultCollation || ''
        }
    } catch {
        // Charset list is best-effort; save still works without it.
    } finally {
        loadingOptions.value = false
    }
}

async function copySql() {
    const sql = previewSql.value.trim()
    if (!sql) return
    try {
        await navigator.clipboard.writeText(sql)
        layout.showSuccessToast(t('explorer.createNamespace.sqlCopied'))
    } catch {
        layout.showErrorToast(t('explorer.createNamespace.copyFailed'))
    }
}

async function save() {
    const connectionId = props.tab.connectionId
    const trimmed = name.value.trim()
    if (!connectionId || !trimmed || saving.value) return
    saving.value = true
    formError.value = ''
    try {
        if (mode.value === 'schema') {
            await explorerApi.createSchema(connectionId, {
                name: trimmed,
                catalog: catalog.value.trim() || undefined,
            })
        } else {
            await explorerApi.createDatabase(connectionId, {
                name: trimmed,
                charset: charset.value.trim() || undefined,
                collation: collation.value.trim() || undefined,
            })
        }
        await explorer.reloadConnectionCatalog(connectionId)
        layout.showSuccessToast(t('explorer.createNamespace.success', {name: trimmed}))
        workspace.closeTab(props.tab.id)
    } catch (error) {
        formError.value = resolveCreateNamespaceErrorMessage(error, t)
    } finally {
        saving.value = false
    }
}
</script>

<template>
  <!--
    配方：wb-extension（建库/建 schema 表单）
    AURA-X: [Modify] - 标注配方；裸 input → DwInput
    Protection: 功能完整性已验证，无简化行为
    人格: [@前端艺术家]
  -->
  <div class="create-db dw-workbench-page" data-wb-recipe="wb-extension">
    <header class="create-db__toolbar">
      <DwButton variant="primary" size="sm" :disabled="!canSave" @click="save">
        {{ saving ? t('explorer.createNamespace.saving') : t('common.save') }}
      </DwButton>
      <div class="dw-segment create-db__tabs" role="tablist">
        <button
            type="button"
            class="dw-segment__btn"
            :class="{ 'is-active': view === 'general' }"
            @click="view = 'general'"
        >
          {{ t('explorer.createNamespace.general') }}
        </button>
        <button
            type="button"
            class="dw-segment__btn"
            :class="{ 'is-active': view === 'sql' }"
            @click="view = 'sql'"
        >
          {{ t('explorer.createNamespace.sqlPreview') }}
        </button>
      </div>
    </header>

    <section v-if="view === 'general'" class="create-db__general">
      <label class="create-db__row">
        <span>{{ mode === 'schema' ? t('explorer.createNamespace.schemaName') : t('explorer.createNamespace.databaseName') }}</span>
        <DwInput v-model="name" class="create-db__input" autocomplete="off"/>
      </label>
      <label v-if="showCatalog" class="create-db__row">
        <span>{{ t('explorer.createNamespace.catalog') }}</span>
        <DwInput v-model="catalog" class="create-db__input" autocomplete="off"/>
      </label>
      <label v-if="showMysqlOptions" class="create-db__row">
        <span>{{ t('explorer.createNamespace.charset') }}</span>
        <DwSelect
            v-model="charset"
            :options="charsetOptions"
            :disabled="loadingOptions"
        />
      </label>
      <label v-if="showMysqlOptions" class="create-db__row">
        <span>{{ t('explorer.createNamespace.collation') }}</span>
        <DwSelect
            v-model="collation"
            :options="collationOptions"
            :disabled="loadingOptions"
        />
      </label>
      <DwInlineAlert density="banner" :message="formError"/>
    </section>

    <section v-else class="create-db__sql">
      <div class="create-db__sql-actions">
        <button type="button" class="create-db__link" @click="copySql">
          {{ t('explorer.createNamespace.copy') }}
        </button>
      </div>
      <pre class="create-db__sql-code">{{ previewSql || '--' }}</pre>
      <DwInlineAlert class="create-db__error--sql" density="banner" :message="formError"/>
    </section>
  </div>
</template>

<style scoped>
.create-db {
  min-width: 0;
}

.create-db__toolbar {
  display: flex;
  align-items: center;
  gap: var(--dw-space-6);
  padding: var(--dw-space-5) var(--dw-wb-content-pad-x);
  border-bottom: 1px solid var(--dw-wb-head-border);
  background: var(--dw-wb-head-bg);
  box-shadow: var(--dw-wb-head-shadow);
}

.create-db__tabs {
  margin-left: auto;
}

.create-db__general {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-7);
  padding: var(--dw-space-9) var(--dw-space-10);
  max-width: 640px;
}

.create-db__row {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: var(--dw-space-6);
  align-items: center;
  font-size: var(--dw-text-md);
  color: var(--dw-text);
}

.create-db__row :deep(.create-db__input.dw-input) {
  height: var(--dw-tab-height);
  border: 1px solid var(--dw-wb-card-border);
  border-radius: var(--dw-control-radius-sm);
  padding: 0 var(--dw-space-5);
  background: var(--dw-bg);
  color: inherit;
}

.create-db__sql {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  padding: var(--dw-wb-content-pad-y) var(--dw-wb-content-pad-x);
}

.create-db__sql-actions {
  margin-bottom: var(--dw-space-4);
}

.create-db__link {
  border: none;
  background: transparent;
  color: var(--dw-link);
  cursor: pointer;
  font-size: var(--dw-text-md);
  padding: 0;
}

.create-db__sql-code {
  margin: 0;
  flex: 1;
  overflow: auto;
  padding: var(--dw-space-6);
  border-radius: var(--dw-wb-card-radius);
  box-shadow: var(--dw-wb-card-shadow);
  background: var(--dw-surface-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--dw-text-md);
  line-height: var(--dw-leading-relaxed);
  white-space: pre-wrap;
}


.create-db__error--sql {
  flex-shrink: 0;
}
</style>
