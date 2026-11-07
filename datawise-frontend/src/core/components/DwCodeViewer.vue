<script setup lang="ts">
/**
 * Thin host wrapper around `@datawise/code` `DwCodeViewer`.
 * Clipboard via `registerCodeEditorHost` (`DW_CLIPBOARD`); locale via `registerUiI18nHost`.
 * Force host `one-dark` when `dark` so preview matches product themes.
 */
import {ref, useSlots} from 'vue'
import {DwCodeViewer as PackageDwCodeViewer} from '@datawise/code'

const props = withDefaults(
  defineProps<{
    content: string
    title?: string
    subtitle?: string
    /** Explicit Monaco language id */
    language?: string | null
    /** Content-type / Nacos type hint */
    typeHint?: string | null
    /** File name or dataId for extension sniffing */
    filename?: string | null
    loading?: boolean
    emptyText?: string
    card?: boolean
    /** Force dark editor chrome (default true) */
    dark?: boolean
    readonly?: boolean
  }>(),
  {
    content: '',
    loading: false,
    card: true,
    dark: true,
    readonly: true,
  },
)

defineEmits<{
  'update:content': [value: string]
  copied: [ok: boolean]
}>()

const slots = useSlots()
const viewerRef = ref<{
  openFullscreen: () => void | Promise<void>
  closeFullscreen: () => void
} | null>(null)

defineExpose({
  openFullscreen: () => viewerRef.value?.openFullscreen(),
  closeFullscreen: () => viewerRef.value?.closeFullscreen(),
})
</script>

<template>
  <PackageDwCodeViewer
      ref="viewerRef"
      :content="props.content"
      :title="props.title"
      :subtitle="props.subtitle"
      :language="props.language"
      :type-hint="props.typeHint"
      :filename="props.filename"
      :loading="props.loading"
      :empty-text="props.emptyText"
      :card="props.card"
      :dark="props.dark"
      :readonly="props.readonly"
      :force-theme="props.dark ? 'one-dark' : undefined"
      @update:content="$emit('update:content', $event)"
      @copied="$emit('copied', $event)"
  >
    <template v-for="(_, name) in slots" #[name]="slotData">
      <slot :name="name" v-bind="slotData ?? {}"/>
    </template>
  </PackageDwCodeViewer>
</template>
