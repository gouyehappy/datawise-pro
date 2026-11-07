<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwInlineAlert, DwInput, DwSelect} from '@/core/components'
import {explorerApi} from '@/api'
import type {K8sApplyResult, K8sNamespaceSummary} from '@/features/explorer/services/k8s-workloads.service'
import {toK8sNamespaceOptions} from '@/features/explorer/services/k8s-namespace-options'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const props = defineProps<{
  connectionId: string
  preferredNamespace?: string | null
}>()
const {t} = useI18n()

const namespaces = ref<K8sNamespaceSummary[]>([])
const namespace = ref('default')
const yaml = ref(`apiVersion: v1
kind: ConfigMap
metadata:
  name: datawise-demo
data:
  hello: world
`)
const applying = ref(false)
const error = ref<string | null>(null)
const result = ref<K8sApplyResult | null>(null)

const namespaceOptions = computed(() =>
    toK8sNamespaceOptions(namespaces.value, {
      includeAll: true,
      allLabel: t('explorer.k8sApply.namespaceFromYaml'),
      currentValue: namespace.value
    }),
)

async function loadNamespaces() {
  if (!props.connectionId) return
  try {
    const response = await explorerApi.fetchK8sNamespaces(props.connectionId, {limit: 200})
    namespaces.value = response.namespaces
    if (namespace.value && !namespaces.value.some((item) => item.name === namespace.value) && namespaces.value[0]?.name) {
      namespace.value = namespaces.value[0].name
    }
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.k8sApply.loadFailed')
  }
}

async function apply() {
  if (!props.connectionId || !yaml.value.trim()) return
  applying.value = true
  error.value = null
  result.value = null
  try {
    result.value = await explorerApi.applyK8sYaml(props.connectionId, yaml.value, namespace.value)
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.k8sApply.applyFailed')
  } finally {
    applying.value = false
  }
}

async function refresh() {
  await loadNamespaces()
}

defineExpose({refresh})
onMounted(() => { void refresh() })
watch(() => props.connectionId, () => { void refresh() })
</script>

<template>
  <div class="k8s-resource-panel">
    <DwInlineAlert v-if="error" variant="error" :message="error"/>
    <p class="k8s-resource-panel__status">{{ t('explorer.k8sApply.hint') }}</p>
    <div class="k8s-resource-panel__toolbar">
      <label class="k8s-resource-panel__ns">
        <span>{{ t('explorer.k8sApply.namespace') }}</span>
        <DwSelect
            v-model="namespace"
            size="sm"
            searchable
            :search-placeholder="t('explorer.k8sCommon.namespaceSearch')"
            :options="namespaceOptions"
        />
      </label>
      <DwButton size="sm" :disabled="applying || !yaml.trim()" @click="apply">
        {{ applying ? t('explorer.k8sApply.applying') : t('explorer.k8sApply.applyAction') }}
      </DwButton>
    </div>
    <DwInput
        v-model="yaml"
        class="k8s-resource-panel__editor"
        variant="mono"
        :rows="16"
        :spellcheck="false"
    />
    <pre v-if="result" class="k8s-resource-panel__result">{{ result.message }}
<template v-for="(item, idx) in result.resources" :key="idx">
- {{ item.success ? 'OK' : 'ERR' }} {{ item.kind }}/{{ item.name }} ({{ item.action }}) {{ item.message }}
</template></pre>
  </div>
</template>

<style scoped src="./k8s-resource-panel.css"></style>
