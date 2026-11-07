<script setup lang="ts">
import {nextTick, ref, watch} from 'vue'
import TabCloseIcon from './TabCloseIcon.vue'

const props = withDefaults(
  defineProps<{
    tabId: string
    title: string
    active?: boolean
    closable?: boolean
    renamable?: boolean
    renaming?: boolean
    /** Editable suffix while renaming; defaults to full title. */
    renameSuffix?: string
    /** Edit suffix only (hide host prefix; caller rejoins on commit). */
    renameSuffixOnly?: boolean
    /** Content modified / unsaved (e.g. SQL console). */
    dirty?: boolean
    setRef?: (el: unknown) => void
  }>(),
  {
    renamable: false,
    renaming: false,
    dirty: false,
  },
)

const emit = defineEmits<{
  select: []
  close: []
  contextmenu: [event: MouseEvent]
  rename: [title: string]
  'cancel-rename': []
  'request-rename': []
  'pointer-drag-start': [event: PointerEvent]
}>()

const draft = ref('')
const inputRef = ref<HTMLInputElement>()

watch(
  () => props.renaming,
  async (isRenaming) => {
    if (!isRenaming) return
    draft.value = props.renameSuffix ?? props.title
    await nextTick()
    inputRef.value?.focus()
    inputRef.value?.select()
  },
)

function commitRename() {
  const next = draft.value.trim()
  const current = (props.renameSuffix ?? props.title).trim()
  if (!next || next === current) {
    emit('cancel-rename')
    return
  }
  emit('rename', next)
}

function onTitleDblClick(event: MouseEvent) {
  if (!props.renamable) return
  event.preventDefault()
  event.stopPropagation()
  emit('request-rename')
}
</script>

<template>
  <button
      :ref="setRef"
      class="dw-tab"
      :class="{ active, 'is-renaming': renaming }"
      :data-tab-id="tabId"
      type="button"
      @click="!renaming && emit('select')"
      @contextmenu="emit('contextmenu', $event)"
      @pointerdown="!renaming && emit('pointer-drag-start', $event)"
  >
    <slot name="leading"/>
    <span
        v-if="!renaming"
        class="dw-tab__title"
        @dblclick="onTitleDblClick"
    >{{ title }}</span>
    <template v-else>
      <input
          ref="inputRef"
          v-model="draft"
          class="dw-tab__rename-input"
          :class="{ 'dw-tab__rename-input--suffix-only': renameSuffixOnly }"
          type="text"
          :aria-label="renameSuffix ?? title"
          @click.stop
          @mousedown.stop
          @keydown.enter.prevent="commitRename"
          @keydown.escape.prevent="emit('cancel-rename')"
          @blur="commitRename"
      />
    </template>
    <span
        v-if="dirty && !renaming"
        class="dw-tab__dirty"
        :title="title"
        aria-hidden="true"
    >●</span>
    <span
        v-if="closable && !renaming"
        class="dw-tab__close"
        role="button"
        tabindex="-1"
        @pointerdown.stop
        @mousedown.stop.prevent
        @click.stop.prevent="emit('close')"
    >
      <TabCloseIcon/>
    </span>
  </button>
</template>
