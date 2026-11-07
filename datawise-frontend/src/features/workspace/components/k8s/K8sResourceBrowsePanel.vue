<script setup lang="ts">
import {DwButton, DwInlineAlert, DwSelect, EmptyState} from '@/core/components'
import type {SelectOption} from '@/core/components'
import {useI18n} from 'vue-i18n'

withDefaults(
    defineProps<{
      namespace: string
      namespaceOptions: SelectOption[]
      statusText: string
      error?: string | null
      loading?: boolean
      empty?: boolean
      emptyTitle?: string
      showNamespace?: boolean
      /** Nested split / master-detail: list wrapper fills without own scroll */
      fillList?: boolean
      refreshLabel?: string
    }>(),
    {
      error: null,
      loading: false,
      empty: false,
      showNamespace: true,
      fillList: false,
    },
)

const emit = defineEmits<{
  'update:namespace': [value: string]
  refresh: []
  'namespace-change': []
}>()

const {t} = useI18n()

function onNamespace(value: string) {
  emit('update:namespace', value)
  emit('namespace-change')
}
</script>

<template>
  <div class="k8s-resource-panel">
    <DwInlineAlert v-if="error" density="banner" variant="error" :message="error"/>
    <div class="k8s-resource-panel__toolbar">
      <label v-if="showNamespace" class="k8s-resource-panel__ns">
        <span>{{ t('explorer.k8sCommon.namespace') }}</span>
        <DwSelect
            :model-value="namespace"
            size="sm"
            searchable
            :search-placeholder="t('explorer.k8sCommon.namespaceSearch')"
            :placeholder="t('explorer.k8sCommon.namespace')"
            :options="namespaceOptions"
            @update:model-value="onNamespace(String($event))"
        />
      </label>
      <slot name="toolbar-extra"/>
      <span class="k8s-resource-panel__status">{{ statusText }}</span>
      <DwButton size="sm" variant="ghost" @click="emit('refresh')">
        {{ refreshLabel || t('explorer.k8sCommon.refresh') }}
      </DwButton>
    </div>
    <div
        class="k8s-resource-panel__list"
        :class="{ 'k8s-resource-panel__list--fill': fillList }"
    >
      <EmptyState v-if="!loading && empty" :title="emptyTitle || t('explorer.k8sCommon.empty')"/>
      <slot v-else/>
    </div>
  </div>
</template>

<style src="./k8s-resource-panel.css"></style>
