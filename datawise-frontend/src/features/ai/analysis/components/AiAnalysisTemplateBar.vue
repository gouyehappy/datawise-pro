<script setup lang="ts">
import {onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import type {AiAnalysisMode} from '@/features/ai/types/analysis'
import {
    createAnalysisTemplate,
    readAnalysisTemplates,
    removeAnalysisTemplate,
    upsertAnalysisTemplate,
    writeAnalysisTemplates,
} from '@/features/ai/analysis/services/analysis-template.service'
import type {AiAnalysisTemplate} from '@/features/ai/analysis/types/analysis-template.types'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {EmptyState} from '@/core/components'

const props = defineProps<{
    prompt: string
    selectedTargetIds: string[]
    analysisMode: AiAnalysisMode
}>()

const emit = defineEmits<{
    apply: [template: AiAnalysisTemplate]
}>()

const {t} = useI18n()
const auth = useAuthStore()
const toast = useAppToast()
const templates = ref<AiAnalysisTemplate[]>([])
const expanded = ref(false)

function reload() {
    templates.value = readAnalysisTemplates()
}

onMounted(reload)

watch(
    () => [auth.user?.userId, auth.user?.userName, auth.isGuest] as const,
    () => reload(),
)

function saveCurrent() {
    const prompt = props.prompt.trim()
    if (!prompt) return
    const template = createAnalysisTemplate({
        prompt,
        targetIds: props.selectedTargetIds,
        analysisMode: props.analysisMode,
    })
    templates.value = upsertAnalysisTemplate(templates.value, template)
    if (!writeAnalysisTemplates(templates.value)) {
        toast.error(t('ai.templates.saveFailed'))
        return
    }
}

function applyTemplate(template: AiAnalysisTemplate) {
    emit('apply', template)
    expanded.value = false
}

function deleteTemplate(template: AiAnalysisTemplate, event: MouseEvent) {
    event.stopPropagation()
    templates.value = removeAnalysisTemplate(templates.value, template.id)
    writeAnalysisTemplates(templates.value)
}
</script>

<template>
  <div class="template-bar">
    <button
        class="dw-text-btn dw-text-btn--compact"
        type="button"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
    >
      {{ t('ai.templates.title') }}
      <span v-if="templates.length" class="template-bar__count">{{ templates.length }}</span>
    </button>

    <button
        class="dw-text-btn dw-text-btn--compact"
        type="button"
        :disabled="!prompt.trim()"
        @click="saveCurrent"
    >
      {{ t('ai.templates.saveCurrent') }}
    </button>

    <div v-if="expanded" class="template-bar__list">
      <EmptyState v-if="!templates.length" embedded compact :title="t('ai.templates.empty')"/>
      <button
          v-for="template in templates"
          :key="template.id"
          class="template-chip"
          type="button"
          :title="template.prompt"
          @click="applyTemplate(template)"
      >
        <span class="template-chip__name">{{ template.name }}</span>
        <span class="template-chip__meta">{{ template.analysisMode }}</span>
        <span
            class="template-chip__delete"
            role="button"
            tabindex="-1"
            :aria-label="t('ai.templates.delete')"
            @click="deleteTemplate(template, $event)"
        >
          ×
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.template-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-gap);
  padding: var(--dw-space-5) var(--dw-space-9) 0;
}

.template-bar__toggle,


.template-bar__count {
  margin-left: var(--dw-space-3);
  padding: 0 var(--dw-space-3);
  border-radius: var(--dw-radius-pill);
  background: color-mix(in srgb, var(--dw-primary) 12%, var(--dw-bg));
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
}

.template-bar__list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-sm);
  width: 100%;
}

.template-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  max-width: 240px;
  padding: var(--dw-space-2) var(--dw-space-4);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-radius-pill);
  background: var(--dw-bg);
  cursor: pointer;
}

.template-chip__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--dw-text-sm);
  color: var(--dw-text);
}

.template-chip__meta {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  text-transform: uppercase;
}

.template-chip__delete {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xl);
  line-height: 1;
}

.template-chip__delete:hover {
  color: var(--dw-danger);
}
</style>
