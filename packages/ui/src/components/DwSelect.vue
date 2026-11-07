<!-- Package copy: @datawise/ui DwSelect. Host file kept until cutover. -->
<script setup lang="ts">
import {computed, ref} from 'vue'
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxTrigger,
  ComboboxViewport,
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui'
import {DwIcon} from '@datawise/icons'
import type {SelectOption} from './select.types'
import {fuzzyMatchSelectText} from './select-fuzzy'
import {useDwI18n} from '../i18n/useDwI18n'

export type {SelectOption}

const props = withDefaults(
    defineProps<{
      options: SelectOption[]
      id?: string
      placeholder?: string
      disabled?: boolean
      /** 选项以 font-family 展示（字体选择） */
      useOptionFont?: boolean
      size?: 'default' | 'sm' | 'pill' | 'compact' | 'inline'
      /** 下拉菜单最小宽度（默认不低于触发器宽度） */
      menuMinWidth?: string
      /** 下拉菜单最大宽度（默认 420px / 视口） */
      menuMaxWidth?: string
      /**
       * 可输入模糊筛选（触发器即搜索框）。
       * 默认：default/sm 开启；pill/compact/inline 关闭。
       */
      searchable?: boolean
      searchPlaceholder?: string
      /**
       * 显示清空按钮（×）。
       * 未指定时：选项数 > 10 时开启；≤ 10 时不显示。
       */
      clearable?: boolean
      /** 下拉弹出方向；空间不足时仍会由 avoid-collisions 翻转 */
      side?: 'top' | 'bottom'
    }>(),
    {size: 'default', side: 'bottom'},
)

const model = defineModel<string>({required: true})
const t = useDwI18n()
const open = ref(false)
const searchTerm = ref('')

/** Reka forbids empty string item values — map '' ↔ sentinel. */
const EMPTY_SENTINEL = '__dw_select_empty__'

const isSearchable = computed(() => {
  if (props.searchable != null) return props.searchable
  return props.size === 'default' || props.size === 'sm'
})

const CLEARABLE_OPTION_THRESHOLD = 10

const isClearable = computed(() => {
  if (props.clearable === false) return false
  if (props.clearable === true) return true
  return props.options.length > CLEARABLE_OPTION_THRESHOLD
})

const showClear = computed(() => {
  if (!isClearable.value || props.disabled) return false
  return Boolean(searchTerm.value.trim()) || Boolean(model.value)
})

function toRekaValue(value: string | undefined | null): string | undefined {
  if (value == null || value === '') return undefined
  return value
}

function optionToRekaValue(value: string): string {
  return value === '' ? EMPTY_SENTINEL : value
}

function fromRekaValue(value: string | undefined | null): string {
  if (value == null || value === EMPTY_SENTINEL) return ''
  return value
}

const hasEmptyOption = computed(() => props.options.some((item) => item.value === ''))

const selectValue = computed({
  get: () => {
    if (model.value === '') return hasEmptyOption.value ? EMPTY_SENTINEL : undefined
    return toRekaValue(model.value)
  },
  set: (value: string | undefined) => {
    model.value = fromRekaValue(value)
  },
})

const comboValue = computed({
  get: () => {
    if (model.value === '') return hasEmptyOption.value ? EMPTY_SENTINEL : undefined
    return model.value || undefined
  },
  set: (value: string | undefined | null) => {
    model.value = fromRekaValue(value)
  },
})

const selectedLabel = computed(() => {
  const match = props.options.find((item) => item.value === model.value)
  if (match) return match.label
  if (!model.value && props.placeholder) return props.placeholder
  return model.value
})

const isPlaceholder = computed(() => !model.value && !!props.placeholder)

const filteredOptions = computed(() => {
  if (!isSearchable.value) return props.options
  const needle = searchTerm.value.trim()
  if (!needle) return props.options
  return props.options.filter(
      (option) => fuzzyMatchSelectText(option.label, needle) || fuzzyMatchSelectText(option.value, needle),
  )
})

const resolvedSearchPlaceholder = computed(
    () => props.searchPlaceholder?.trim()
        || props.placeholder
        || t('common.select.searchPlaceholder'),
)

const matchMeta = computed(() => {
  if (!isSearchable.value || !searchTerm.value.trim()) return ''
  return t('common.select.matchCount', {count: filteredOptions.value.length})
})

const menuStyle = computed(() => {
  const triggerWidth = 'var(--reka-combobox-trigger-width, var(--reka-select-trigger-width))'
  return {
    // Grow with longest option; never narrower than the field (unless overridden).
    minWidth: props.menuMinWidth ?? triggerWidth,
    width: 'max-content',
    maxWidth: props.menuMaxWidth ?? 'min(420px, 92vw)',
    maxHeight: 'min(320px, var(--reka-combobox-content-available-height, var(--reka-select-content-available-height, 320px)))',
  }
})

/** Keep menus clear of status bar / window chrome when flipped near the bottom. */
const collisionPadding = {top: 8, right: 8, bottom: 48, left: 8} as const

function displayComboValue(val: unknown): string {
  const raw = fromRekaValue(typeof val === 'string' ? val : undefined)
  if (open.value && searchTerm.value) return searchTerm.value
  const match = props.options.find((item) => item.value === raw)
  if (match) return match.label
  if (!raw) return ''
  return raw
}

function onOpenChange(next: boolean) {
  open.value = next
  if (!next) searchTerm.value = ''
}

function clearSelection(event?: Event) {
  event?.preventDefault()
  event?.stopPropagation()
  if (props.disabled) return
  searchTerm.value = ''
  if (model.value !== '') {
    model.value = ''
  }
}
</script>

<template>
  <!-- Searchable: Combobox — input lives in the trigger (always visible) -->
  <ComboboxRoot
      v-if="isSearchable"
      v-model="comboValue"
      class="dw-select-host"
      :open="open"
      :disabled="disabled"
      ignore-filter
      open-on-click
      open-on-focus
      reset-search-term-on-blur
      reset-search-term-on-select
      @update:open="onOpenChange"
  >
    <div
        class="dw-select dw-select--combo"
        :class="[
          `dw-select--${size}`,
          {
            'is-open': open,
            'is-disabled': disabled,
            'is-placeholder': isPlaceholder && !searchTerm,
            'is-searchable': true,
            'is-clearable': isClearable,
          },
        ]"
    >
      <ComboboxAnchor class="dw-select__trigger">
        <DwIcon
            class="dw-select__search-icon"
            name="search"
            muted
            size="sm"
            :stroke-width="1.5"
        />
        <ComboboxInput
            :id="id"
            v-model="searchTerm"
            class="dw-select__combo-input"
            :display-value="displayComboValue"
            :placeholder="resolvedSearchPlaceholder"
            :disabled="disabled"
            autocomplete="off"
            spellcheck="false"
        />
        <div class="dw-select__actions">
          <button
              v-if="showClear"
              class="dw-select__icon-btn"
              type="button"
              :title="t('common.clear')"
              :aria-label="t('common.clear')"
              @pointerdown.prevent.stop
              @click.prevent.stop="clearSelection"
          >
            <DwIcon name="x" size="sm" :stroke-width="2" aria-hidden="true"/>
          </button>
          <ComboboxTrigger
              v-else
              class="dw-select__icon-btn"
              :disabled="disabled"
              tabindex="-1"
          >
            <DwIcon class="dw-select__chevron" name="chevron-down" size="sm" :stroke-width="1.6"/>
          </ComboboxTrigger>
        </div>
      </ComboboxAnchor>

      <ComboboxPortal>
        <ComboboxContent
            class="dw-select__menu dw-select__menu--portal dw-select__menu--combo"
            position="popper"
            :side="side"
            align="start"
            :side-offset="4"
            :align-offset="0"
            :collision-padding="collisionPadding"
            :prioritize-position="side === 'top'"
            sticky="always"
            avoid-collisions
            :style="menuStyle"
        >
          <ComboboxViewport class="dw-select__viewport">
            <ComboboxEmpty class="dw-select__empty">
              {{ t('common.select.noMatch') }}
            </ComboboxEmpty>
            <ComboboxItem
                v-for="option in filteredOptions"
                :key="optionToRekaValue(option.value)"
                class="dw-select__item"
                :class="{ 'is-active': option.value === model }"
                :value="optionToRekaValue(option.value)"
                :disabled="option.disabled"
                :text-value="option.label"
            >
              <span
                  class="dw-select__item-label"
                  :style="useOptionFont && option.value ? { fontFamily: option.value } : undefined"
              >
                {{ option.label }}
              </span>
              <ComboboxItemIndicator>
                <DwIcon
                    class="dw-select__check"
                    name="submit"
                    size="sm"
                    :stroke-width="1.6"
                />
              </ComboboxItemIndicator>
            </ComboboxItem>
          </ComboboxViewport>
          <div v-if="matchMeta" class="dw-select__menu-footer">
            {{ matchMeta }}
          </div>
        </ComboboxContent>
      </ComboboxPortal>
    </div>
  </ComboboxRoot>

  <!-- Non-searchable: classic Select -->
  <SelectRoot
      v-else
      v-model="selectValue"
      v-model:open="open"
      class="dw-select-host"
      :disabled="disabled"
  >
    <div
        class="dw-select"
        :class="[
          `dw-select--${size}`,
          {
            'is-open': open,
            'is-disabled': disabled,
            'is-placeholder': isPlaceholder,
            'is-clearable': isClearable,
          },
        ]"
    >
      <SelectTrigger
          :id="id"
          class="dw-select__trigger"
          :disabled="disabled"
      >
        <span
            class="dw-select__value"
            :style="useOptionFont && model ? { fontFamily: model } : undefined"
        >
          <SelectValue :placeholder="placeholder">
            {{ selectedLabel }}
          </SelectValue>
        </span>
        <div class="dw-select__actions">
          <button
              v-if="showClear"
              class="dw-select__icon-btn"
              type="button"
              :title="t('common.clear')"
              :aria-label="t('common.clear')"
              @pointerdown.prevent.stop
              @click.prevent.stop="clearSelection"
          >
            <DwIcon name="x" size="sm" :stroke-width="2" aria-hidden="true"/>
          </button>
          <span
              v-else
              class="dw-select__icon-btn dw-select__icon-btn--static"
              aria-hidden="true"
          >
            <SelectIcon as-child>
              <DwIcon class="dw-select__chevron" name="chevron-down" size="sm" :stroke-width="1.6"/>
            </SelectIcon>
          </span>
        </div>
      </SelectTrigger>

      <SelectPortal>
        <SelectContent
            class="dw-select__menu dw-select__menu--portal"
            position="popper"
            :side="side"
            align="start"
            :side-offset="4"
            :align-offset="0"
            :collision-padding="collisionPadding"
            :prioritize-position="side === 'top'"
            sticky="always"
            avoid-collisions
            :style="menuStyle"
        >
          <SelectViewport class="dw-select__viewport">
            <SelectItem
                v-for="option in options"
                :key="optionToRekaValue(option.value)"
                class="dw-select__item"
                :class="{ 'is-active': option.value === model }"
                :value="optionToRekaValue(option.value)"
                :disabled="option.disabled"
                :text-value="option.label"
            >
              <SelectItemText as-child>
                <span
                    class="dw-select__item-label"
                    :style="useOptionFont && option.value ? { fontFamily: option.value } : undefined"
                >
                  {{ option.label }}
                </span>
              </SelectItemText>
              <SelectItemIndicator>
                <DwIcon
                    class="dw-select__check"
                    name="submit"
                    size="sm"
                    :stroke-width="1.6"
                />
              </SelectItemIndicator>
            </SelectItem>
          </SelectViewport>
        </SelectContent>
      </SelectPortal>
    </div>
  </SelectRoot>
</template>
