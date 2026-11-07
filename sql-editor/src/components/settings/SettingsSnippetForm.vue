<script setup lang="ts">
import {useSqlEditorI18n} from '@sql-editor/composables/useSqlEditorI18n'

/**
 * 片段编辑表单字段（标签 / 插入内容 / 说明）。
 * 新建与编辑共用，减少 settings 面板重复 markup。
 */
withDefaults(
    defineProps<{
      label: string
      insertText: string
      detail?: string
      showDetail?: boolean
      insertPlaceholder?: string
      insertRows?: number
      compact?: boolean
      fillHeight?: boolean
    }>(),
    {
      showDetail: true,
      detail: '',
      insertRows: 4,
      compact: false,
      fillHeight: false,
    },
)

const emit = defineEmits<{
  'update:label': [value: string]
  'update:insertText': [value: string]
  'update:detail': [value: string]
}>()

const {t} = useSqlEditorI18n()
</script>

<template>
  <div
      class="snippet-form"
      :class="{
        'snippet-form--compact': compact,
        'snippet-form--fill': fillHeight,
      }"
  >
    <div v-if="compact" class="snippet-form__meta-row">
      <label class="dw-field">
        <span class="dw-field__label">{{ t('settings.snippets_label') }}</span>
        <input
            class="dw-input dw-input--mono"
            type="text"
            :value="label"
            autocomplete="off"
            spellcheck="false"
            :placeholder="t('settings.snippets_label')"
            @input="emit('update:label', ($event.target as HTMLInputElement).value)"
        />
      </label>

      <label v-if="showDetail" class="dw-field">
        <span class="dw-field__label">{{ t('settings.snippets_detail') }}</span>
        <input
            class="dw-input"
            type="text"
            :value="detail"
            autocomplete="off"
            :placeholder="t('settings.snippets_detail')"
            @input="emit('update:detail', ($event.target as HTMLInputElement).value)"
        />
      </label>

      <slot name="meta-extra"/>
    </div>

    <template v-else>
      <label class="dw-field">
        <span class="dw-field__label">{{ t('settings.snippets_label') }}</span>
        <input
            class="dw-input dw-input--mono"
            type="text"
            :value="label"
            autocomplete="off"
            spellcheck="false"
            :placeholder="t('settings.snippets_label')"
            @input="emit('update:label', ($event.target as HTMLInputElement).value)"
        />
      </label>

      <label v-if="showDetail" class="dw-field">
        <span class="dw-field__label">{{ t('settings.snippets_detail') }}</span>
        <input
            class="dw-input"
            type="text"
            :value="detail"
            autocomplete="off"
            :placeholder="t('settings.snippets_detail')"
            @input="emit('update:detail', ($event.target as HTMLInputElement).value)"
        />
      </label>
    </template>

    <label class="dw-field snippet-form__field--grow">
      <span class="dw-field__label">{{ t('settings.snippets_insert') }}</span>
      <textarea
          class="dw-input dw-input--mono"
          :value="insertText"
          spellcheck="false"
          :rows="insertRows"
          :placeholder="insertPlaceholder || t('settings.snippets_insert_placeholder')"
          @input="emit('update:insertText', ($event.target as HTMLTextAreaElement).value)"
      />
    </label>
  </div>
</template>

<style scoped>
.snippet-form {
  display: flex;
  flex-direction: column;
  gap: clamp(10px, 1.2vmin, 12px);
  min-height: 0;
}

.snippet-form--fill {
  flex: 1;
  min-height: 0;
}

.snippet-form--compact .snippet-form__meta-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
  gap: clamp(10px, 1.2vmin, 12px);
  align-items: end;
}

.snippet-form--compact .snippet-form__meta-row:has(> :nth-child(3)) {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) minmax(120px, 0.8fr);
}

.snippet-form__field--grow {
  flex: 1;
  min-height: 0;
}

.snippet-form--fill .snippet-form__field--grow {
  display: flex;
  flex-direction: column;
}

.snippet-form--fill .snippet-form__field--grow textarea {
  flex: 1;
  min-height: 140px;
  max-height: 280px;
  resize: vertical;
}
</style>
