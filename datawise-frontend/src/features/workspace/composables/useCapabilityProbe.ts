import {computed, ref, shallowRef, watch, type Ref} from 'vue'
import {
    isSpecializedCapabilityLive,
    runCapabilityProbe,
    specializedCapabilityReason,
    type CapabilityProbeResult,
    type SpecializedCapabilityKey,
} from '@/shared/capabilities/capability-probe'

/**
 * Tab 生命周期内缓存专项探测结果；connectionId / dbType 变化时重跑。
 */
export function useCapabilityProbe(options: {
    connectionId: Ref<string> | (() => string)
    dbType: Ref<string> | (() => string)
}) {
    const probe = shallowRef<CapabilityProbeResult | null>(null)
    const probing = ref(false)
    const probeError = ref('')

    function readId(): string {
        return typeof options.connectionId === 'function' ? options.connectionId() : options.connectionId.value
    }

    function readDbType(): string {
        return typeof options.dbType === 'function' ? options.dbType() : options.dbType.value
    }

    async function refresh() {
        const connectionId = readId().trim()
        const dbType = readDbType().trim()
        if (!connectionId || !dbType) {
            probe.value = null
            probeError.value = ''
            return
        }
        probing.value = true
        probeError.value = ''
        try {
            probe.value = await runCapabilityProbe({connectionId, dbType})
        } catch (error) {
            probe.value = null
            probeError.value = error instanceof Error ? error.message : String(error)
        } finally {
            probing.value = false
        }
    }

    watch(
        [() => readId(), () => readDbType()],
        () => {
            void refresh()
        },
        {immediate: true},
    )

    const surfaceOk = computed(() => isSpecializedCapabilityLive(probe.value, 'surface'))

    function isLive(key: SpecializedCapabilityKey): boolean {
        return isSpecializedCapabilityLive(probe.value, key)
    }

    function reason(key: SpecializedCapabilityKey): string | undefined {
        return specializedCapabilityReason(probe.value, key)
    }

    return {
        probe,
        probing,
        probeError,
        surfaceOk,
        refresh,
        isLive,
        reason,
    }
}
