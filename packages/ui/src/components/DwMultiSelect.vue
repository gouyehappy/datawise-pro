<script setup lang="ts">
import {computed, ref} from 'vue'
import {
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItemIndicator,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'
import type {SelectOption} from './select.types'
import {DwIcon} from '@datawise/icons'

export type {SelectOption}

const props = withDefaults(
    defineProps<{
      options: SelectOption[]
      id?: string
      placeholder?: string
      disabled?: boolean
      size?: 'default' | 'sm' | 'pill' | 'compact' | 'inline'
      menuMinWidth?: string
    }>(),
    {size: 'default'},
)

const model = defineModel<string[]>({default: () => []})
const open = ref(false)

const selectedLabel = computed(() => {
  const selected = model.value
  if (!selected.length) {
    return props.placeholder ?? ''
  }
  const labels = selected.map((value) => {
    const match = props.options.find((item) => item.value === value)
    return match?.label ?? value
  })
  const joined = labels.join(', ')
  if (labels.length <= 2 && joined.length <= 36) {
    return joined
  }
  return `${labels[0]} +${labels.length - 1}`
})

const isPlaceholder = computed(() => !model.value.length && !!props.placeholder)

const menuStyle = computed(() => ({
  minWidth: props.menuMinWidth ?? 'var(--reka-dropdown-menu-trigger-width)',
  width: 'max-content',
  maxHeight: '280px',
  overflow: 'auto',
}))

function isSelected(value: string) {
  return model.value.includes(value)
}

function onCheckedChange(value: string, checked: boolean | 'indeterminate') {
  const selected = isSelected(value)
  const nextChecked = checked === true
  if (nextChecked && !selected) {
    model.value = [...model.value, value]
    return
  }
  if (!nextChecked && selected) {
    model.value = model.value.filter((item) => item !== value)
  }
}
</script>

<template>
  <DropdownMenuRoot v-model:open="open">
    <div
        :id="id"
        class="dw-select dw-select--multiple"
        :class="[
          `dw-select--${size}`,
          {
            'is-open': open,
            'is-disabled': disabled,
            'is-placeholder': isPlaceholder,
          },
        ]"
    >
      <DropdownMenuTrigger as-child>
        <button
            class="dw-select__trigger"
            type="button"
            :disabled="disabled"
        >
          <span class="dw-select__value">{{ selectedLabel }}</span>
          <span class="dw-select__affix" aria-hidden="true">
            <DwIcon class="dw-select__chevron" name="chevron-down" size="sm" :stroke-width="1.5"/>
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuPortal>
        <DropdownMenuContent
            class="dw-select__menu dw-select__menu--portal"
            side="bottom"
            align="start"
            :side-offset="6"
            :collision-padding="8"
            :style="menuStyle"
        >
          <DropdownMenuCheckboxItem
              v-for="option in options"
              :key="option.value"
              class="dw-select__item"
              :class="{ 'is-active': isSelected(option.value) }"
              :model-value="isSelected(option.value)"
              :disabled="option.disabled"
              @select.prevent
              @update:model-value="(checked) => onCheckedChange(option.value, checked)"
          >
            <span class="dw-select__item-label">{{ option.label }}</span>
            <DropdownMenuItemIndicator>
              <DwIcon
                  class="dw-select__check"
                  name="submit"
                  size="sm"
                  :stroke-width="1.6"
              />
            </DropdownMenuItemIndicator>
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </div>
  </DropdownMenuRoot>
</template>
