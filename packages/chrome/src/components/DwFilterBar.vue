<script setup lang="ts">
import {computed, ref} from 'vue'
import {SearchInput, useDwI18n} from '@datawise/ui'

export type DwFilterOption = {
  value: string
  label: string
}

const model = defineModel<string>({required: true})

const props = withDefaults(
  defineProps<{
    options: DwFilterOption[]
    label: string
    statusText?: string
    searchPlaceholder?: string
    loading?: boolean
    searchThreshold?: number
  }>(),
  {
    statusText: '',
    searchPlaceholder: '',
    loading: false,
    searchThreshold: 8,
  },
)

const emit = defineEmits<{
  select: [value: string]
}>()

const t = useDwI18n()
const query = ref('')

const showSearch = computed(() => props.options.length >= props.searchThreshold)

const displayOptions = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.options
  return props.options.filter(
    (item) =>
      item.label.toLowerCase().includes(q) || item.value.toLowerCase().includes(q),
  )
})

const filterHint = computed(() => {
  if (!showSearch.value || !query.value.trim()) return ''
  return t('filter.hint', {
    shown: displayOptions.value.length,
    total: props.options.length,
  })
})

function onSelect(value: string) {
  if (model.value === value) return
  model.value = value
  emit('select', value)
}
</script>

<template>
  <header class="dw-filter-bar">
    <div class="dw-filter-bar__meta">
      <div class="dw-filter-bar__meta-start">
        <span class="dw-filter-bar__eyebrow">{{ label }}</span>
        <span v-if="filterHint" class="dw-filter-bar__hint">{{ filterHint }}</span>
      </div>
      <span v-if="statusText" class="dw-filter-bar__status">{{ statusText }}</span>
    </div>

    <div class="dw-filter-bar__row">
      <div v-if="showSearch" class="dw-filter-bar__search">
        <SearchInput
          v-model="query"
          size="sm"
          :placeholder="searchPlaceholder || t('common.search')"
          :aria-label="searchPlaceholder || t('common.search')"
        />
      </div>

      <nav v-if="displayOptions.length" class="dw-filter-bar__tabs" :aria-label="label">
        <button
          v-for="item in displayOptions"
          :key="item.value || '__empty__'"
          type="button"
          class="dw-filter-bar__tab"
          :class="{ 'is-active': model === item.value }"
          :disabled="loading"
          @click="onSelect(item.value)"
        >
          {{ item.label }}
        </button>
      </nav>
      <p v-else class="dw-filter-bar__empty">{{ t('filter.empty') }}</p>
    </div>
  </header>
</template>
