<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {useMigrationWizard} from '@/features/workspace/composables/useMigrationWizardInject'

const {t} = useI18n()
const w = useMigrationWizard()

const modeLabelKey: Record<string, string> = {
  FULL_APPEND: 'explorer.tableMigrationWizard.modeFullAppend',
  FULL_REPLACE: 'explorer.tableMigrationWizard.modeFullReplace',
  INCR_APPEND: 'explorer.tableMigrationWizard.modeIncrAppend',
  PK_UPSERT: 'explorer.tableMigrationWizard.modePkUpsert',
}

const modeLabel = computed(() => t(modeLabelKey[w.form.mode] ?? modeLabelKey.FULL_APPEND))
</script>

<template>
  <section class="route-summary route-summary--flow">
    <span class="route-summary__node">
      <span class="route-summary__badge">{{ t('explorer.tableMigrationWizard.source') }}</span>
      {{ w.source!.connectionLabel }} / {{ w.source!.database }}
    </span>
    <span class="route-summary__arrow" aria-hidden="true">→</span>
    <span class="route-summary__node">
      <span class="route-summary__badge">{{ t('explorer.tableMigrationWizard.tables') }}</span>
      {{ w.selectedCountLabel }}
    </span>
    <span class="route-summary__arrow" aria-hidden="true">→</span>
    <span class="route-summary__node">
      <span class="route-summary__badge">{{ t('explorer.tableMigrationWizard.migrationMode') }}</span>
      {{ modeLabel }}
    </span>
    <span class="route-summary__arrow" aria-hidden="true">→</span>
    <span class="route-summary__node">
      <span class="route-summary__badge">{{ t('explorer.tableMigrationWizard.target') }}</span>
      {{ w.targetConnectionLabel }} / {{ w.form.targetDatabase }}
    </span>
  </section>
</template>
