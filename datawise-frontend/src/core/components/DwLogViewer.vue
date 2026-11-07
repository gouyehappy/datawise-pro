<script setup lang="ts">
/**
 * Thin host wrapper around `@datawise/code` `DwLogViewer`.
 * Clipboard via `registerCodeEditorHost` (`DW_CLIPBOARD`); locale via `registerUiI18nHost`.
 */
import {ref, useSlots} from 'vue'
import {DwLogViewer as PackageDwLogViewer} from '@datawise/code'

const props = withDefaults(
  defineProps<{
    /** Raw log text (unfiltered). */
    content: string
    title: string
    subtitle?: string
    loading?: boolean
    /** Show live badge when streaming/polling. */
    live?: boolean
    liveLabel?: string
    /** Auto-scroll to bottom when content grows. */
    follow?: boolean
    emptyText?: string
    /** Optional card chrome (border/padding) around the viewer. */
    card?: boolean
    showFollowToggle?: boolean
    /** Match DwCodeViewer dark chrome (default true). */
    dark?: boolean
  }>(),
  {
    content: '',
    loading: false,
    live: false,
    follow: true,
    card: false,
    showFollowToggle: true,
    dark: true,
  },
)

defineEmits<{
  'update:follow': [value: boolean]
  copied: [ok: boolean]
}>()

const slots = useSlots()
const viewerRef = ref<{
  scrollToBottom: () => void | Promise<void>
  scrollToTop: () => void | Promise<void>
  openFullscreen: () => void | Promise<void>
  closeFullscreen: () => void
  openFind: () => void
  closeFind: () => void
} | null>(null)

defineExpose({
  scrollToBottom: () => viewerRef.value?.scrollToBottom(),
  scrollToTop: () => viewerRef.value?.scrollToTop(),
  openFullscreen: () => viewerRef.value?.openFullscreen(),
  closeFullscreen: () => viewerRef.value?.closeFullscreen(),
  openFind: () => viewerRef.value?.openFind(),
  closeFind: () => viewerRef.value?.closeFind(),
})
</script>

<template>
  <PackageDwLogViewer
      ref="viewerRef"
      :content="props.content"
      :title="props.title"
      :subtitle="props.subtitle"
      :loading="props.loading"
      :live="props.live"
      :live-label="props.liveLabel"
      :follow="props.follow"
      :empty-text="props.emptyText"
      :card="props.card"
      :show-follow-toggle="props.showFollowToggle"
      :dark="props.dark"
      @update:follow="$emit('update:follow', $event)"
      @copied="$emit('copied', $event)"
  >
    <template v-for="(_, name) in slots" #[name]="slotData">
      <slot :name="name" v-bind="slotData ?? {}"/>
    </template>
  </PackageDwLogViewer>
</template>
