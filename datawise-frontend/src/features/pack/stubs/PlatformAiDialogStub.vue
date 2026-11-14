<script setup lang="ts">
import {watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {useLayoutStore} from '@/features/layout/stores/layout'

/** Standard-edition stand-in for AI-backed platform dialogs (federated SQL / canvas rerun). */
const props = withDefaults(
    defineProps<{
        open?: boolean
        /** Paywall context key suffix under pack.paywall.context.* */
        context?: string
    }>(),
    {
        open: false,
        context: 'platform.ai',
    },
)

const emit = defineEmits<{
    'update:open': [value: boolean]
}>()

const {t} = useI18n()
const entitlement = useEntitlementStore()
const layout = useLayoutStore()

watch(
    () => props.open,
    (isOpen) => {
        if (!isOpen) return
        if (entitlement.isAiUsable()) {
        } else {
            entitlement.openPaywall('pack.ai', props.context)
        }
        emit('update:open', false)
    },
    {immediate: true},
)
</script>

<template>
  <div class="platform-ai-dialog-stub" hidden aria-hidden="true"/>
</template>
