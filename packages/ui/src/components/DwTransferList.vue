<script setup lang="ts">
import {computed, ref, type Ref} from 'vue'
import DwButton from './DwButton.vue'
import {useDwI18n} from '../i18n/useDwI18n'

export type DwTransferItem = {
  id: string
  label: string
  disabled?: boolean
}

const selected = defineModel<string[]>({default: () => []})

const props = withDefaults(
  defineProps<{
    items: DwTransferItem[]
    availableTitle?: string
    selectedTitle?: string
  }>(),
  {},
)

const t = useDwI18n()
const pickLeft = ref<string[]>([])
const pickRight = ref<string[]>([])

const selectedSet = computed(() => new Set(selected.value))

const available = computed(() =>
  props.items.filter((item) => !selectedSet.value.has(item.id)),
)

const chosen = computed(() =>
  props.items.filter((item) => selectedSet.value.has(item.id)),
)

function toggle(list: Ref<string[]>, id: string) {
  const next = new Set(list.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  list.value = [...next]
}

function toggleLeft(id: string) {
  toggle(pickLeft, id)
}

function toggleRight(id: string) {
  toggle(pickRight, id)
}

function add() {
  const next = new Set(selected.value)
  for (const id of pickLeft.value) next.add(id)
  selected.value = [...next]
  pickLeft.value = []
}

function remove() {
  const drop = new Set(pickRight.value)
  selected.value = selected.value.filter((id) => !drop.has(id))
  pickRight.value = []
}
</script>

<template>
  <div class="dw-transfer">
    <div class="dw-transfer__column">
      <div class="dw-transfer__head">
        <span>{{ availableTitle ?? t('transfer.available') }}</span>
        <span>{{ available.length }}</span>
      </div>
      <ul class="dw-transfer__list">
        <li v-for="item in available" :key="item.id">
          <button
            type="button"
            class="dw-transfer__item"
            :class="{ 'is-selected': pickLeft.includes(item.id) }"
            :disabled="item.disabled"
            @click="toggleLeft(item.id)"
          >
            {{ item.label }}
          </button>
        </li>
      </ul>
    </div>

    <div class="dw-transfer__actions">
      <DwButton variant="secondary" size="sm" :disabled="!pickLeft.length" @click="add">
        {{ t('transfer.add') }} →
      </DwButton>
      <DwButton variant="secondary" size="sm" :disabled="!pickRight.length" @click="remove">
        ← {{ t('transfer.remove') }}
      </DwButton>
    </div>

    <div class="dw-transfer__column">
      <div class="dw-transfer__head">
        <span>{{ selectedTitle ?? t('transfer.selected') }}</span>
        <span>{{ chosen.length }}</span>
      </div>
      <ul class="dw-transfer__list">
        <li v-for="item in chosen" :key="item.id">
          <button
            type="button"
            class="dw-transfer__item"
            :class="{ 'is-selected': pickRight.includes(item.id) }"
            :disabled="item.disabled"
            @click="toggleRight(item.id)"
          >
            {{ item.label }}
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
