<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { t, type Locale } from '../lib/i18n'
import type { ViewInfo } from '../lib/types'
import {
  loadViewFavorites,
  saveViewFavorites,
  toggleViewFavorite,
} from '../lib/viewFavorites'

const props = defineProps<{
  locale: Locale
  views: ViewInfo[]
  modelValue: string
  pinCount: number
}>()

const emit = defineEmits<{
  'update:modelValue': [tab: string]
  favorites: [names: string[]]
}>()

const open = ref(false)
const filter = ref('')
const favorites = ref<string[]>([])
const cursor = ref(0)
const root = ref<HTMLElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)

const namedViews = computed(() =>
  props.views.filter((v) => {
    const n = (v.name || '').trim()
    if (!n) return false
    const lower = n.toLowerCase()
    return lower !== 'all' && n !== '所有' && n !== '全部'
  }),
)

const viewByName = computed(() => {
  const map = new Map<string, ViewInfo>()
  for (const v of namedViews.value) map.set(v.name, v)
  return map
})

const favoriteViews = computed(() =>
  favorites.value
    .map((name) => viewByName.value.get(name))
    .filter(Boolean) as ViewInfo[],
)

const otherViews = computed(() => {
  const fav = new Set(favorites.value)
  const q = filter.value.trim().toLowerCase()
  return namedViews.value.filter((v) => {
    if (fav.has(v.name)) return false
    if (!q) return true
    return (
      v.name.toLowerCase().includes(q) ||
      (v.description || '').toLowerCase().includes(q)
    )
  })
})

const filteredFavorites = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return favoriteViews.value
  return favoriteViews.value.filter(
    (v) =>
      v.name.toLowerCase().includes(q) ||
      (v.description || '').toLowerCase().includes(q),
  )
})

const label = computed(() => {
  if (props.modelValue === '__pins__') return t(props.locale, 'viewPins')
  if (props.modelValue === '__all__') return t(props.locale, 'viewAll')
  return props.modelValue
})

const labelTone = computed(() => {
  if (props.modelValue === '__pins__') return 'star'
  if (props.modelValue === '__all__') return 'all'
  return 'view'
})

const flatTabs = computed(() => [
  '__pins__',
  '__all__',
  ...filteredFavorites.value.map((v) => v.name),
  ...otherViews.value.map((v) => v.name),
])

const viewCount = computed(() => namedViews.value.length)

async function persistFavorites(next: string[]) {
  favorites.value = next
  emit('favorites', [...next])
  await saveViewFavorites(next)
}

async function toggleFav(name: string, e?: Event) {
  e?.stopPropagation()
  e?.preventDefault()
  await persistFavorites(toggleViewFavorite(favorites.value, name))
}

async function toggle() {
  open.value = !open.value
  if (open.value) {
    filter.value = ''
    syncCursorToSelection()
    await nextTick()
    searchRef.value?.focus()
    scrollCursor()
  }
}

function pick(tab: string) {
  emit('update:modelValue', tab)
  open.value = false
}

function syncCursorToSelection() {
  const idx = flatTabs.value.indexOf(props.modelValue)
  cursor.value = idx >= 0 ? idx : 0
}

function scrollCursor() {
  const el = listRef.value?.querySelector<HTMLElement>('.vp__row.is-cursor, .vp__mode.is-cursor')
  el?.scrollIntoView({ block: 'nearest' })
}

function moveCursor(delta: number) {
  const tabs = flatTabs.value
  if (!tabs.length) return
  const next = Math.min(tabs.length - 1, Math.max(0, cursor.value + delta))
  cursor.value = next
  nextTick(scrollCursor)
}

function onDoc(e: MouseEvent) {
  if (!open.value || !root.value) return
  if (!root.value.contains(e.target as Node)) open.value = false
}

function onKey(e: KeyboardEvent) {
  if (!open.value) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault()
      void toggle()
    }
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    open.value = false
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    moveCursor(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    moveCursor(-1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const tab = flatTabs.value[cursor.value]
    if (tab) pick(tab)
  } else if (e.key === 'Home') {
    e.preventDefault()
    cursor.value = 0
    nextTick(scrollCursor)
  } else if (e.key === 'End') {
    e.preventDefault()
    cursor.value = Math.max(0, flatTabs.value.length - 1)
    nextTick(scrollCursor)
  }
}

function isFav(name: string) {
  return favorites.value.includes(name)
}

function markName(name: string) {
  const q = filter.value.trim()
  if (!q) return [{ text: name, hit: false }]
  const lower = name.toLowerCase()
  const qi = lower.indexOf(q.toLowerCase())
  if (qi < 0) return [{ text: name, hit: false }]
  return [
    { text: name.slice(0, qi), hit: false },
    { text: name.slice(qi, qi + q.length), hit: true },
    { text: name.slice(qi + q.length), hit: false },
  ].filter((p) => p.text)
}

function rowIndex(name: string) {
  return flatTabs.value.indexOf(name)
}

watch(filter, () => {
  if (!open.value) return
  // Keep cursor on current selection if still visible; otherwise first result.
  const idx = flatTabs.value.indexOf(props.modelValue)
  cursor.value = idx >= 0 ? idx : 0
  nextTick(scrollCursor)
})

watch(() => props.modelValue, () => {
  if (open.value) {
    syncCursorToSelection()
    nextTick(scrollCursor)
  }
})

watch(
  () => props.views,
  () => {
    const known = new Set(namedViews.value.map((v) => v.name))
    const pruned = favorites.value.filter((n) => known.has(n))
    if (pruned.length !== favorites.value.length) void persistFavorites(pruned)
  },
)

onMounted(async () => {
  favorites.value = await loadViewFavorites()
  emit('favorites', [...favorites.value])
  document.addEventListener('mousedown', onDoc)
})

onBeforeUnmount(() => document.removeEventListener('mousedown', onDoc))

defineExpose({ toggleFavorite: toggleFav })
</script>

<template>
  <div ref="root" class="vp" @keydown="onKey">
    <button
      type="button"
      class="vp__trigger"
      :class="[`is-${labelTone}`, { 'is-open': open }]"
      :aria-expanded="open"
      :aria-label="`${t(locale, 'views')}: ${label}`"
      :title="`${t(locale, 'views')} · ${label}`"
      @click="toggle"
    >
      <span class="vp__icon" aria-hidden="true">
        <svg v-if="labelTone === 'star'" viewBox="0 0 24 24" class="vp__svg">
          <path
            d="M12 2.6l2.75 5.57 6.15.9-4.45 4.33 1.05 6.12L12 16.9l-5.5 2.92 1.05-6.12L3.1 9.07l6.15-.9L12 2.6z"
            fill="currentColor"
          />
        </svg>
        <svg v-else viewBox="0 0 24 24" class="vp__svg">
          <path
            d="M4 5.5h7v6H4v-6zm9 0h7v4h-7v-4zM4 13.5h7v5H4v-5zm9 2h7v3h-7v-3z"
            fill="currentColor"
          />
        </svg>
      </span>
      <span class="vp__text">
        <span class="vp__value">{{ label }}</span>
      </span>
      <span class="vp__chev" aria-hidden="true">
        <svg viewBox="0 0 16 16" class="vp__chev-svg">
          <path
            d="M4.2 6.2L8 10l3.8-3.8"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
    </button>

    <div v-if="open" class="vp__pop" role="listbox" :aria-label="t(locale, 'views')">
      <div class="vp__search">
        <span class="vp__search-ico" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="12" height="12">
            <circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path d="M10.2 10.2L13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </span>
        <input
          ref="searchRef"
          v-model="filter"
          class="vp__search-input"
          type="search"
          :placeholder="t(locale, 'searchViews')"
          autocomplete="off"
          spellcheck="false"
          @keydown.stop="onKey"
        />
        <button
          v-if="filter"
          type="button"
          class="vp__search-clear"
          :title="t(locale, 'clearFilter')"
          @click="filter = ''; searchRef?.focus()"
        >
          ×
        </button>
      </div>

      <div class="vp__modes">
        <button
          type="button"
          class="vp__mode"
          :class="{ 'is-on': modelValue === '__pins__', 'is-cursor': cursor === 0 }"
          role="option"
          :aria-selected="modelValue === '__pins__'"
          @mouseenter="cursor = 0"
          @click="pick('__pins__')"
        >
          <span class="vp__mode-ico" aria-hidden="true">★</span>
          <span class="vp__mode-label">{{ t(locale, 'viewPins') }}</span>
          <em v-if="pinCount">{{ pinCount }}</em>
        </button>
        <button
          type="button"
          class="vp__mode"
          :class="{ 'is-on': modelValue === '__all__', 'is-cursor': cursor === 1 }"
          role="option"
          :aria-selected="modelValue === '__all__'"
          @mouseenter="cursor = 1"
          @click="pick('__all__')"
        >
          <span class="vp__mode-ico" aria-hidden="true">☰</span>
          <span class="vp__mode-label">{{ t(locale, 'viewAll') }}</span>
          <em v-if="viewCount">{{ viewCount }}</em>
        </button>
      </div>

      <div ref="listRef" class="vp__list thin-scroll">
        <template v-if="filteredFavorites.length">
          <div class="vp__section">
            <div class="vp__section-h">
              <span>{{ t(locale, 'viewFavorites') }}</span>
              <em>{{ filteredFavorites.length }}</em>
            </div>
            <button
              v-for="v in filteredFavorites"
              :key="`fav-${v.name}`"
              type="button"
              class="vp__row"
              :class="{
                'is-active': modelValue === v.name,
                'is-cursor': cursor === rowIndex(v.name),
              }"
              role="option"
              :aria-selected="modelValue === v.name"
              :title="v.description || v.name"
              @mouseenter="cursor = rowIndex(v.name)"
              @click="pick(v.name)"
            >
              <span class="vp__mark" aria-hidden="true">
                <svg v-if="modelValue === v.name" viewBox="0 0 16 16" width="11" height="11">
                  <path d="M3.5 8.2l2.8 2.8 6.2-6.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <i v-else class="vp__dot vp__dot--fav" />
              </span>
              <span class="vp__row-body">
                <span class="vp__row-name">
                  <template v-for="(p, i) in markName(v.name)" :key="i">
                    <mark v-if="p.hit">{{ p.text }}</mark>
                    <template v-else>{{ p.text }}</template>
                  </template>
                </span>
                <span v-if="v.description" class="vp__row-desc">{{ v.description }}</span>
              </span>
              <button
                type="button"
                class="vp__star is-on"
                :title="t(locale, 'unpinView')"
                @click="toggleFav(v.name, $event)"
              >
                ★
              </button>
            </button>
          </div>
        </template>

        <div v-if="otherViews.length || filter.trim() || !filteredFavorites.length" class="vp__section">
          <div class="vp__section-h">
            <span>{{ t(locale, 'viewAllList') }}</span>
            <em>{{ otherViews.length }}</em>
          </div>
          <button
            v-for="v in otherViews"
            :key="v.name"
            type="button"
            class="vp__row"
            :class="{
              'is-active': modelValue === v.name,
              'is-cursor': cursor === rowIndex(v.name),
            }"
            role="option"
            :aria-selected="modelValue === v.name"
            :title="v.description || v.name"
            @mouseenter="cursor = rowIndex(v.name)"
            @click="pick(v.name)"
          >
            <span class="vp__mark" aria-hidden="true">
              <svg v-if="modelValue === v.name" viewBox="0 0 16 16" width="11" height="11">
                <path d="M3.5 8.2l2.8 2.8 6.2-6.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <i v-else class="vp__dot" />
            </span>
            <span class="vp__row-body">
              <span class="vp__row-name">
                <template v-for="(p, i) in markName(v.name)" :key="i">
                  <mark v-if="p.hit">{{ p.text }}</mark>
                  <template v-else>{{ p.text }}</template>
                </template>
              </span>
              <span v-if="v.description" class="vp__row-desc">{{ v.description }}</span>
            </span>
            <button
              type="button"
              class="vp__star"
              :class="{ 'is-on': isFav(v.name) }"
              :title="isFav(v.name) ? t(locale, 'unpinView') : t(locale, 'pinView')"
              @click="toggleFav(v.name, $event)"
            >
              {{ isFav(v.name) ? '★' : '☆' }}
            </button>
          </button>
          <div v-if="!otherViews.length && !filteredFavorites.length" class="vp__empty">
            {{ t(locale, 'noViews') }}
          </div>
          <div
            v-else-if="!otherViews.length && filteredFavorites.length && filter.trim()"
            class="vp__empty vp__empty--soft"
          >
            {{ t(locale, 'noViews') }}
          </div>
        </div>
      </div>

      <div v-if="!favorites.length" class="vp__hint">{{ t(locale, 'viewFavHint') }}</div>
      <div v-else class="vp__foot">
        <kbd>↑↓</kbd><span>{{ t(locale, 'viewNavMove') }}</span>
        <kbd>Enter</kbd><span>{{ t(locale, 'viewNavOpen') }}</span>
        <kbd>Esc</kbd><span>{{ t(locale, 'viewNavClose') }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vp {
  position: relative;
  flex: 0 0 auto;
  width: 158px;
}
.vp__trigger {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  box-sizing: border-box;
  width: 158px;
  height: 28px;
  padding: 0 6px 0 5px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--fg) 3%, var(--surface)), var(--surface));
  color: var(--fg);
  transition: border-color .14s ease, background .14s ease, box-shadow .14s ease;
}
.vp__trigger:hover {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--line));
  background: color-mix(in srgb, var(--fg) 4%, var(--surface));
}
.vp__trigger.is-open {
  border-color: color-mix(in srgb, var(--accent) 48%, var(--line));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent);
}
.vp__trigger.is-star {
  border-color: color-mix(in srgb, #f0c14b 36%, var(--line));
}
.vp__trigger.is-star.is-open {
  box-shadow: 0 0 0 2px color-mix(in srgb, #f0c14b 18%, transparent);
}
.vp__icon {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: color-mix(in srgb, var(--accent) 85%, #fff);
  flex: 0 0 auto;
}
.vp__trigger.is-star .vp__icon {
  background: color-mix(in srgb, #f0c14b 18%, transparent);
  color: #f0c14b;
}
.vp__trigger.is-all .vp__icon {
  background: color-mix(in srgb, var(--fg) 7%, transparent);
  color: var(--muted);
}
.vp__svg {
  width: 11px;
  height: 11px;
  display: block;
}
.vp__text {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
}
.vp__value {
  font-weight: 600;
  font-size: var(--dw-font-size);
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: .01em;
}
.vp__count {
  flex: 0 0 auto;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--fg) 8%, transparent);
  color: var(--muted);
  font-size: var(--dw-text-2xs);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}
.vp__chev {
  display: grid;
  place-items: center;
  color: var(--muted);
  flex: 0 0 auto;
  width: 12px;
  transition: transform .16s ease;
}
.vp__trigger.is-open .vp__chev {
  transform: rotate(180deg);
}
.vp__chev-svg {
  width: 11px;
  height: 11px;
  display: block;
}

.vp__pop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 40;
  width: min(320px, 78vw);
  max-height: min(440px, 66vh);
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--panel) 97%, #000);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow:
    0 18px 44px rgb(0 0 0 / .48),
    0 0 0 1px color-mix(in srgb, var(--fg) 3%, transparent);
  overflow: hidden;
  animation: vp-pop .14s ease;
  transform-origin: top left;
}
@keyframes vp-pop {
  from { opacity: 0; transform: translateY(-4px) scale(.98); }
  to { opacity: 1; transform: none; }
}

.vp__search {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 9px 9px 0;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg) 72%, var(--surface));
}
.vp__search:focus-within {
  border-color: color-mix(in srgb, var(--accent) 46%, var(--line));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 14%, transparent);
}
.vp__search-ico {
  color: var(--muted);
  display: grid;
  place-items: center;
  flex: 0 0 auto;
}
.vp__search-input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  padding: 7px 0;
  color: var(--fg);
  font-size: var(--dw-font-size);
}
.vp__search-input::-webkit-search-cancel-button {
  display: none;
}
.vp__search-clear {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 5px;
  background: color-mix(in srgb, var(--fg) 8%, transparent);
  color: var(--muted);
  font-size: var(--dw-font-size);
  line-height: 1;
  display: grid;
  place-items: center;
}
.vp__search-clear:hover {
  color: var(--fg);
  background: color-mix(in srgb, var(--fg) 14%, transparent);
}

.vp__modes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
  padding: 8px 9px;
}
.vp__mode {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: color-mix(in srgb, var(--fg) 2.5%, transparent);
  color: var(--muted);
  font-size: var(--dw-text-xs);
  transition: background .12s ease, border-color .12s ease, color .12s ease;
}
.vp__mode:hover,
.vp__mode.is-cursor {
  color: var(--fg);
  background: color-mix(in srgb, var(--fg) 6%, transparent);
}
.vp__mode.is-on {
  color: var(--fg);
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  border-color: color-mix(in srgb, var(--accent) 40%, var(--line));
}
.vp__mode.is-on.is-cursor {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent);
}
.vp__mode-ico {
  font-size: var(--dw-text-2xs);
  opacity: .9;
}
.vp__mode-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vp__mode em {
  font-style: normal;
  min-width: 15px;
  padding: 0 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--fg) 10%, transparent);
  font-size: var(--dw-text-2xs);
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.vp__list {
  flex: 1;
  overflow: auto;
  padding: 0 5px 5px;
  max-height: 268px;
}
.vp__section {
  padding: 0 0 4px;
}
.vp__section-h {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 9px 4px;
  color: var(--muted);
  font-size: var(--dw-text-2xs);
  letter-spacing: .05em;
  text-transform: uppercase;
  font-weight: 560;
  background: color-mix(in srgb, var(--panel) 94%, transparent);
  backdrop-filter: blur(6px);
}
.vp__section-h em {
  font-style: normal;
  margin-left: auto;
  opacity: .65;
  font-variant-numeric: tabular-nums;
}

.vp__row {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  color: var(--fg);
  border-radius: 7px;
  padding: 5px 6px 5px 8px;
  min-height: 30px;
  transition: background .1s ease;
}
.vp__row:hover,
.vp__row.is-cursor {
  background: color-mix(in srgb, var(--fg) 5%, transparent);
}
.vp__row.is-active {
  background: color-mix(in srgb, var(--accent) 13%, transparent);
  box-shadow: inset 2px 0 0 var(--accent);
}
.vp__row.is-active.is-cursor {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}
.vp__mark {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  color: var(--accent);
}
.vp__dot {
  display: block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--fg) 20%, transparent);
}
.vp__dot--fav {
  background: #f0c14b;
  box-shadow: 0 0 0 2px color-mix(in srgb, #f0c14b 18%, transparent);
}
.vp__row-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.vp__row-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 540;
  font-size: var(--dw-font-size);
}
.vp__row-name mark {
  background: color-mix(in srgb, var(--accent) 28%, transparent);
  color: inherit;
  border-radius: 2px;
  padding: 0 1px;
}
.vp__row-desc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  font-size: var(--dw-text-xs);
}
.vp__star {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: color-mix(in srgb, var(--muted) 70%, transparent);
  font-size: var(--dw-font-size);
  line-height: 1;
  display: grid;
  place-items: center;
  opacity: 0;
  transition: opacity .1s ease, color .1s ease, background .1s ease;
}
.vp__row:hover .vp__star,
.vp__row.is-cursor .vp__star,
.vp__star.is-on,
.vp__star:focus-visible {
  opacity: 1;
}
.vp__star:hover {
  color: #f0c14b;
  background: color-mix(in srgb, #f0c14b 12%, transparent);
}
.vp__star.is-on {
  color: #f5c542;
}

.vp__empty {
  padding: 16px 10px;
  text-align: center;
  color: var(--muted);
  font-size: var(--dw-text-xs);
}
.vp__empty--soft {
  padding: 4px 10px 8px;
}
.vp__hint,
.vp__foot {
  padding: 7px 11px 9px;
  border-top: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
  color: var(--muted);
  font-size: var(--dw-text-xs);
  line-height: 1.4;
}
.vp__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
}
.vp__foot kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 16px;
  padding: 0 4px;
  border-radius: 4px;
  border: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
  background: color-mix(in srgb, var(--fg) 5%, transparent);
  font-family: inherit;
  font-size: var(--dw-text-2xs);
  color: var(--fg);
}
</style>
