<!--
  数据范围空态推荐：把「去别的模块自己打标」换成「这里就能选到表」。
  推荐模式下给 3 张候选表，一键纳入即完成打标；也保留手工挑表的退路。
-->
<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwPanelState, SearchInput} from '@/core/components'
import {DwIcon} from '@/core/icons'
import {
    pickSuggestedTables,
    type AiScopeSuggestionScope,
} from '@/features/ai/datasource/composables/useAiScopeSuggestions'

const props = withDefaults(
    defineProps<{
      scope: AiScopeSuggestionScope
      tables: string[]
      loading?: boolean
      applying?: boolean
      error?: string | null
    }>(),
    {loading: false, applying: false, error: null},
)

const emit = defineEmits<{
  apply: [tableNames: string[]]
}>()

const {t} = useI18n()

type SuggestionMode = 'suggest' | 'manual'

const mode = ref<SuggestionMode>('suggest')
const checked = ref<string[]>([])
const manualSearch = ref('')

const suggested = computed(() => pickSuggestedTables(props.tables))
const available = computed(() => props.tables.filter((name) => name.trim()))

const visibleRows = computed(() => {
  if (mode.value === 'suggest') return suggested.value
  const query = manualSearch.value.trim().toLowerCase()
  if (!query) return available.value
  return available.value.filter((name) => name.toLowerCase().includes(query))
})

const allChecked = computed(
    () => visibleRows.value.length > 0 && visibleRows.value.every((name) => checked.value.includes(name)),
)

const applyLabel = computed(() => {
  const count = checked.value.length
  if (props.applying) return t('ai.databasePanel.recommend.applying')
  return count
      ? t('ai.databasePanel.recommend.apply', {count})
      : t('ai.databasePanel.recommend.applyEmpty')
})

// 推荐结果变化时重置勾选，避免把上一次连接的残留选择带进来
watch(
    suggested,
    (list) => {
      checked.value = [...list]
      mode.value = 'suggest'
      manualSearch.value = ''
    },
    {immediate: true},
)

function isChecked(name: string): boolean {
    return checked.value.includes(name)
}

function toggle(name: string) {
    checked.value = isChecked(name)
        ? checked.value.filter((item) => item !== name)
        : [...checked.value, name]
}

function toggleVisible() {
    if (allChecked.value) {
        const visible = new Set(visibleRows.value)
        checked.value = checked.value.filter((name) => !visible.has(name))
        return
    }
    const merged = new Set([...checked.value, ...visibleRows.value])
    checked.value = [...merged]
}

function switchMode() {
    mode.value = mode.value === 'suggest' ? 'manual' : 'suggest'
    manualSearch.value = ''
}

function submit() {
    if (!checked.value.length || props.applying) return
    emit('apply', [...checked.value])
}
</script>

<template>
  <section class="scope-suggest">
    <header class="scope-suggest__head">
      <span class="scope-suggest__eyebrow">{{ t('ai.databasePanel.recommend.eyebrow') }}</span>
      <p class="scope-suggest__lead">
        {{
          loading || !suggested.length
              ? t('ai.databasePanel.recommend.probing', {connection: scope.connectionLabel})
              : t('ai.databasePanel.recommend.title', {
                  connection: scope.connectionLabel,
                  count: suggested.length,
                })
        }}
      </p>
      <p class="scope-suggest__sub">{{ t('ai.databasePanel.recommend.subtitle') }}</p>
    </header>

    <DwPanelState
        v-if="loading"
        status="loading"
        compact
        :message="t('ai.databasePanel.recommend.loading')"
    />

    <p v-else-if="error" class="scope-suggest__error">
      <DwIcon name="alert-circle" size="sm" :stroke-width="1.6"/>
      {{ error }}
    </p>

    <p v-else-if="!available.length" class="scope-suggest__hint">
      {{ t('ai.databasePanel.recommend.empty') }}
    </p>

    <template v-else>
      <div class="scope-suggest__tools">
        <SearchInput
            v-if="mode === 'manual'"
            v-model="manualSearch"
            class="scope-suggest__search"
            :placeholder="t('ai.databasePanel.recommend.searchTables')"
        />
        <button type="button" class="scope-suggest__select-all" @click="toggleVisible">
          {{ allChecked ? t('ai.databasePanel.recommend.unselectAll') : t('ai.databasePanel.recommend.selectAll') }}
        </button>
      </div>

      <ul class="scope-suggest__list" :class="{ 'is-manual': mode === 'manual' }">
        <li v-for="name in visibleRows" :key="name">
          <button
              type="button"
              class="scope-row"
              :class="{ 'is-checked': isChecked(name) }"
              role="checkbox"
              :aria-checked="isChecked(name)"
              @click="toggle(name)"
          >
            <span class="scope-row__box" aria-hidden="true">
              <DwIcon v-if="isChecked(name)" name="check" size="xs" :stroke-width="2.4"/>
            </span>
            <span class="scope-row__name">{{ name }}</span>
          </button>
        </li>
      </ul>

      <p v-if="mode === 'manual' && !visibleRows.length" class="scope-suggest__hint">
        {{ t('ai.databasePanel.recommend.noMatch') }}
      </p>

      <DwButton
          block
          size="sm"
          :disabled="!checked.length || applying"
          @click="submit"
      >
        {{ applyLabel }}
      </DwButton>
      <button type="button" class="scope-suggest__link" @click="switchMode">
        {{
          mode === 'suggest'
              ? t('ai.databasePanel.recommend.manual')
              : t('ai.databasePanel.recommend.backToSuggest')
        }}
      </button>
    </template>
  </section>
</template>

<style scoped>
.scope-suggest {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-4);
  min-height: 0;
  padding: var(--dw-space-5);
  border: 1px solid color-mix(in srgb, var(--dw-primary) 22%, var(--dw-border-light));
  border-radius: var(--dw-control-radius);
  background: linear-gradient(
      165deg,
      color-mix(in srgb, var(--dw-primary-soft) 55%, var(--dw-bg-panel)),
      color-mix(in srgb, var(--dw-bg-panel) 96%, transparent)
  );
}

.scope-suggest__head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.scope-suggest__eyebrow {
  font-size: var(--dw-text-2xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--dw-primary);
}

.scope-suggest__lead {
  margin: 0;
  font-size: var(--dw-text-sm);
  font-weight: 600;
  line-height: var(--dw-leading-snug);
  color: var(--dw-text);
  overflow-wrap: anywhere;
}

.scope-suggest__sub {
  margin: 0;
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-snug);
  color: var(--dw-text-secondary);
}

.scope-suggest__tools {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
  min-width: 0;
}

.scope-suggest__search {
  flex: 1;
  min-width: 0;
}

.scope-suggest__select-all {
  flex-shrink: 0;
  padding: 0 var(--dw-space-2);
  border: none;
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-density-md);
  cursor: pointer;
  white-space: nowrap;
}

.scope-suggest__select-all:hover {
  color: var(--dw-primary);
  background: color-mix(in srgb, var(--dw-primary) 10%, transparent);
}

.scope-suggest__list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  min-width: 0;
}

.scope-suggest__list.is-manual {
  max-height: 232px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.scope-row {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
  width: 100%;
  min-width: 0;
  padding: 5px var(--dw-space-3) 5px var(--dw-space-2);
  border: 1px solid transparent;
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
  text-align: left;
  cursor: pointer;
  transition: background var(--dw-duration-fast) var(--dw-ease),
  border-color var(--dw-duration-fast) var(--dw-ease);
}

.scope-row:hover {
  background: color-mix(in srgb, var(--dw-text) 5%, transparent);
}

.scope-row.is-checked {
  border-color: color-mix(in srgb, var(--dw-primary) 24%, transparent);
  background: color-mix(in srgb, var(--dw-primary) 8%, transparent);
}

.scope-row__box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 15px;
  height: 15px;
  border: 1px solid color-mix(in srgb, var(--dw-text-muted) 55%, transparent);
  border-radius: 3px;
  background: transparent;
  color: var(--dw-on-accent);
}

.scope-row.is-checked .scope-row__box {
  border-color: var(--dw-primary);
  background: var(--dw-primary);
}

.scope-row__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--dw-font-mono, ui-monospace, monospace);
  font-size: var(--dw-text-xs);
}

.scope-suggest__link {
  align-self: center;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  cursor: pointer;
}

.scope-suggest__link:hover {
  color: var(--dw-primary);
}

.scope-suggest__hint,
.scope-suggest__error {
  display: flex;
  align-items: flex-start;
  gap: var(--dw-gap-sm);
  margin: 0;
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-snug);
  color: var(--dw-text-secondary);
}

.scope-suggest__error {
  color: var(--dw-warning-fg);
}
</style>
