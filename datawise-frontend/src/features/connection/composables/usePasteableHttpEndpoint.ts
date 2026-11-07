import {computed, ref, watch, type Ref} from 'vue'
import type {ConnectionConfig, DbType} from '@/core/types'
import {
    applyParsedHttpEndpoint,
    endpointDefaults,
    formatHttpEndpoint,
    parseHttpEndpoint,
    type HttpEndpointKind,
} from '@/features/connection/utils/http-endpoint'

const PASTEABLE_KINDS = new Set<DbType>(['jenkins', 'polaris', 'yarn', 'kubernetes'])

export function isPasteableHttpEndpoint(dbType: DbType): dbType is HttpEndpointKind {
    return PASTEABLE_KINDS.has(dbType)
}

export function usePasteableHttpEndpoint(
    form: Ref<ConnectionConfig> | {value: ConnectionConfig},
    dbType: Ref<DbType> | (() => DbType),
) {
    const draft = ref('')
    const focused = ref(false)

    const kind = computed((): HttpEndpointKind | null => {
        const type = typeof dbType === 'function' ? dbType() : dbType.value
        return isPasteableHttpEndpoint(type) ? type : null
    })

    const placeholder = computed(() =>
        kind.value ? endpointDefaults(kind.value).placeholder : 'localhost',
    )

    function syncFromForm() {
        if (!kind.value || focused.value) return
        draft.value = formatHttpEndpoint(
            kind.value,
            form.value.host,
            form.value.port,
            form.value.advancedConfig,
        )
    }

    function commit() {
        if (!kind.value) return
        const parsed = parseHttpEndpoint(draft.value, kind.value)
        if (!parsed) {
            syncFromForm()
            return
        }
        const next = applyParsedHttpEndpoint(kind.value, parsed, {
            host: form.value.host,
            port: form.value.port,
            advancedConfig: form.value.advancedConfig,
        })
        form.value.host = next.host
        form.value.port = next.port
        form.value.advancedConfig = next.advancedConfig
        draft.value = formatHttpEndpoint(kind.value, next.host, next.port, next.advancedConfig)
    }

    function onBlur() {
        focused.value = false
        commit()
    }

    function onPaste(event: ClipboardEvent) {
        const text = event.clipboardData?.getData('text')?.trim()
        if (!text) return
        event.preventDefault()
        draft.value = text
        commit()
    }

    watch(
        () => [
            kind.value,
            form.value.host,
            form.value.port,
            form.value.advancedConfig,
        ] as const,
        () => syncFromForm(),
        {immediate: true},
    )

    return {
        kind,
        draft,
        focused,
        placeholder,
        onFocus: () => { focused.value = true },
        onBlur,
        onPaste,
        commit,
    }
}
