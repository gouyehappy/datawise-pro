<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwInlineAlert} from '@/core/components'
import type {AiDatabaseTarget} from '@/features/ai/shared/utils/database-targets'
import {fetchAiSchemaTables} from '@/features/ai/datasource/services/ai-schema.service'

const props = defineProps<{
  targets: AiDatabaseTarget[]
}>()

const {t} = useI18n()

interface SchemaScope {
  key: string
  connectionLabel: string
  databaseLabel: string
  connectionId: string
  database?: string
}

interface SchemaPreviewEntry extends SchemaScope {
  loading: boolean
  error: boolean
  tables: string[]
}

const entries = ref<SchemaPreviewEntry[]>([])

const scopes = computed<SchemaScope[]>(() => {
  const seen = new Set<string>()
  const result: SchemaScope[] = []
  for (const target of props.targets) {
    const database =
        target.level === 'connection' || target.databaseId === '__conn__'
            ? undefined
            : target.databaseLabel
    const key = `${target.connectionId}:${database ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({
      key,
      connectionId: target.connectionId,
      connectionLabel: target.connectionLabel,
      databaseLabel: target.databaseLabel,
      database,
    })
  }
  return result
})

async function loadScope(scope: SchemaScope): Promise<SchemaPreviewEntry> {
  const entry: SchemaPreviewEntry = {
    ...scope,
    loading: true,
    error: false,
    tables: [],
  }
  try {
    entry.tables = await fetchAiSchemaTables(scope.connectionId, scope.database)
  } catch {
    entry.error = true
  } finally {
    entry.loading = false
  }
  return entry
}

watch(
    scopes,
    async (nextScopes) => {
      if (!nextScopes.length) {
        entries.value = []
        return
      }
      entries.value = nextScopes.map((scope) => ({
        ...scope,
        loading: true,
        error: false,
        tables: [],
      }))
      const loaded = await Promise.all(nextScopes.map((scope) => loadScope(scope)))
      entries.value = loaded
    },
    {immediate: true},
)
</script>

<template>
  <section v-if="entries.length" class="schema-preview">
    <header class="schema-preview__head">
      <span class="schema-preview__title">{{ t('ai.databasePanel.schemaPreviewTitle') }}</span>
      <span class="schema-preview__hint">{{ t('ai.databasePanel.schemaPreviewHint') }}</span>
    </header>
    <ul class="schema-preview__list">
      <li v-for="entry in entries" :key="entry.key" class="schema-preview__item">
        <div class="schema-preview__scope">
          <span class="schema-preview__scope-name">{{ entry.connectionLabel }}</span>
          <span v-if="entry.databaseLabel !== entry.connectionLabel" class="schema-preview__scope-db">
            / {{ entry.databaseLabel }}
          </span>
        </div>
        <p v-if="entry.loading" class="schema-preview__status">{{ t('ai.databasePanel.schemaPreviewLoading') }}</p>
        <DwInlineAlert
            v-else-if="entry.error"
            :message="t('ai.databasePanel.schemaPreviewFailed')"
        />
        <p v-else-if="!entry.tables.length" class="schema-preview__status">
          {{ t('ai.databasePanel.schemaPreviewEmpty') }}
        </p>
        <p v-else class="schema-preview__tables">
          {{ t('ai.databasePanel.schemaPreviewCount', {count: entry.tables.length}) }}:
          {{ entry.tables.slice(0, 12).join(', ') }}
          <span v-if="entry.tables.length > 12">…</span>
        </p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.schema-preview {
  margin-top: var(--dw-space-5);
  padding: var(--dw-pad-control-lg);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  background: color-mix(in srgb, var(--dw-bg-panel) 88%, var(--dw-bg));
}

.schema-preview__head {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-1);
  margin-bottom: var(--dw-space-4);
}

.schema-preview__title {
  font-size: var(--dw-text-sm);
  font-weight: 600;
  color: var(--dw-text);
}

.schema-preview__hint {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  line-height: var(--dw-leading);
}

.schema-preview__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
}

.schema-preview__item {
  padding-top: var(--dw-space-4);
  border-top: 1px solid var(--dw-border-subtle);
}

.schema-preview__item:first-child {
  padding-top: 0;
  border-top: none;
}

.schema-preview__scope {
  font-size: var(--dw-text-sm);
  font-weight: 600;
  color: var(--dw-text-secondary);
}

.schema-preview__scope-db {
  color: var(--dw-text-muted);
  font-weight: 500;
}

.schema-preview__status,
.schema-preview__tables {
  margin: var(--dw-space-2) 0 0;
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
  color: var(--dw-text-muted);
}

.schema-preview__tables {
  font-family: var(--dw-mono);
}
</style>
