<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {DwCheckbox} from '@/core/components'
import type {ProfileDomainOptions} from '@/features/settings/services/config-portability.service'

const DOMAIN_KEYS = [
  'connections',
  'app',
  'snippets',
  'savedConsoles',
  'aiWorkspace',
  'projects',
  'sqlHistory',
] as const

type DomainKey = (typeof DOMAIN_KEYS)[number]

const domains = defineModel<ProfileDomainOptions>({required: true})

withDefaults(
    defineProps<{
      ariaLabel?: string
      disabled?: boolean
    }>(),
    {disabled: false},
)

const {t} = useI18n()

function domainLabel(key: DomainKey) {
  return t(`settings.configPortability.domain.${key}`)
}
</script>

<template>
  <div
      class="profile-domain-picker"
      role="group"
      :aria-label="ariaLabel"
  >
    <DwCheckbox
        v-for="key in DOMAIN_KEYS"
        :key="key"
        v-model="domains[key]"
        :label="domainLabel(key)"
        :disabled="disabled"
    />
  </div>
</template>

<style scoped>
.profile-domain-picker {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--dw-space-2);
  align-items: stretch;
}

.profile-domain-picker :deep(.dw-checkbox) {
  margin: 0;
  width: 100%;
  min-height: var(--dw-control-h);
  padding: var(--dw-space-3) var(--dw-space-4);
  border: 1px solid color-mix(in srgb, var(--dw-text) 10%, transparent);
  border-radius: var(--dw-control-radius);
  background: color-mix(in srgb, var(--dw-text) 3%, var(--dw-bg));
  transition: var(--dw-transition-colors);
}

.profile-domain-picker :deep(.dw-checkbox:hover) {
  border-color: color-mix(in srgb, var(--dw-text) 18%, transparent);
  background: color-mix(in srgb, var(--dw-text) 5%, var(--dw-bg));
}

.profile-domain-picker :deep(.dw-checkbox:has(.dw-checkbox__control:checked)) {
  border-color: color-mix(in srgb, var(--dw-primary) 40%, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-primary) 8%, var(--dw-bg-panel));
}

.profile-domain-picker :deep(.dw-checkbox:has(.dw-checkbox__control:checked) .dw-checkbox__label) {
  color: var(--dw-text);
  font-weight: 600;
}

@media (max-width: 640px) {
  .profile-domain-picker {
    grid-template-columns: 1fr;
  }
}
</style>
