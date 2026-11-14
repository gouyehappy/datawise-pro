<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwInlineAlert} from '@/core/components'
import type {CapabilityProbeResult, SpecializedCapabilityKey} from '@/shared/capabilities/capability-probe'
import {specializedCapabilityReason} from '@/shared/capabilities/capability-probe'

const props = defineProps<{
    probe: CapabilityProbeResult | null
    /** 主检查键，默认 surface */
    capability?: SpecializedCapabilityKey
    probing?: boolean
}>()

const {t} = useI18n()

const key = computed(() => props.capability ?? 'surface')

const message = computed(() => {
    if (props.probing) return t('capabilities.probe.checking')
    const reason = specializedCapabilityReason(props.probe, key.value)
    if (!reason) return ''
    return t('capabilities.probe.unavailable', {detail: reason})
})

const visible = computed(() => Boolean(message.value))
</script>

<template>
  <DwInlineAlert
      v-if="visible"
      density="banner"
      variant="warning"
      :message="message"
  />
</template>
