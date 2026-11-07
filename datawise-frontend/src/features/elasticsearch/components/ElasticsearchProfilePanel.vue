<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import ElasticsearchProfileNodeRow from '@/features/elasticsearch/components/ElasticsearchProfileNodeRow.vue'
import {
    countProfileNodes,
    formatProfileNanos,
    parseElasticsearchProfile,
    type ElasticsearchProfileNode,
    type ElasticsearchProfileShard,
} from '@/features/elasticsearch/services/elasticsearch-profile'

const props = defineProps<{ body: string }>()
const {t} = useI18n()

const parsed = computed(() => parseElasticsearchProfile(props.body))
const shards = computed<ElasticsearchProfileShard[]>(() => parsed.value?.shards ?? [])
const activeShardIndex = ref(0)
const expanded = ref<Set<string>>(new Set())

watch(() => props.body, () => {
    activeShardIndex.value = 0
    expanded.value = new Set()
})

const activeShard = computed(() => shards.value[activeShardIndex.value])
const nodeCount = computed(() => (activeShard.value ? countProfileNodes(activeShard.value.tree) : 0))

function toggle(key: string) {
    const next = new Set(expanded.value)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    expanded.value = next
}

function expandAll() {
    if (!activeShard.value) return
    const next = new Set<string>()
    function walk(node: ElasticsearchProfileNode, path: string) {
        node.children.forEach((child, index) => {
            const key = `${path}.${index}`
            next.add(key)
            walk(child, key)
        })
    }
    walk(activeShard.value.tree, 'root')
    expanded.value = next
}

function collapseAll() {
    expanded.value = new Set()
}
</script>

<template>
  <section v-if="parsed" class="es-profile">
    <header class="es-profile__bar">
      <strong>{{ t('explorer.elasticsearchConsole.profile') }}</strong>
      <span class="es-profile__meta">
        {{ activeShard ? formatProfileNanos(activeShard.totalTimeInNanos) : '—' }}
        · {{ nodeCount }} {{ t('explorer.elasticsearchConsole.profileNodes') }}
      </span>
      <div v-if="shards.length > 1" class="es-profile__shards">
        <button
            v-for="(shard, index) in shards"
            :key="shard.id"
            type="button"
            class="es-profile__shard"
            :class="{'es-profile__shard--active': activeShardIndex === index}"
            @click="activeShardIndex = index"
        >
          {{ shard.id }}
        </button>
      </div>
      <button type="button" class="es-profile__btn" @click="expandAll">
        {{ t('explorer.elasticsearchConsole.expandAll') }}
      </button>
      <button type="button" class="es-profile__btn" @click="collapseAll">
        {{ t('explorer.elasticsearchConsole.collapseAll') }}
      </button>
    </header>
    <ul v-if="activeShard" class="es-profile__tree">
      <ElasticsearchProfileNodeRow
          :node="activeShard.tree"
          path="root"
          :depth="0"
          :expanded="expanded"
          @toggle="toggle"
      />
    </ul>
  </section>
</template>

<style scoped>
.es-profile {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 160px;
}
.es-profile__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.es-profile__meta {
  font-size: var(--dw-text-sm);
  opacity: 0.75;
}
.es-profile__shards {
  display: inline-flex;
  gap: 4px;
}
.es-profile__shard,
.es-profile__btn {
  border: 1px solid var(--dw-border);
  background: transparent;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: var(--dw-text-sm);
  cursor: pointer;
}
.es-profile__shard--active {
  background: var(--dw-primary-soft);
}
.es-profile__tree {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--dw-text-sm);
}
</style>
