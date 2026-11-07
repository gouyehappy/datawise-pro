/**
 * Connector Kit (A-08): shared header loading + HTTP console open for L1 workbenches.
 */
import {computed, onMounted, ref, watch, type MaybeRefOrGetter, toValue} from 'vue'
import type {ConnectionConfig} from '@/core/types'
import {useExplorerStore} from '@/features/explorer'
import {fetchConnectionConfig} from '@/shared/config/connections-catalog.service'
import {isHttpUrl, openUrl} from '@/shared/browser/open-url'

export function isHttpConsoleUrl(url: string | null | undefined): boolean {
    return isHttpUrl(url)
}

/** Open an http(s) endpoint per Settings → open links preference. */
export function openHttpConsole(url: string | null | undefined): void {
    void openUrl(url)
}

export type FormatConnectorEndpoint = (
    config: ConnectionConfig,
    fallbackLabel: string,
) => string

/**
 * Loads connection display name + endpoint label for ConnectorWorkbenchFrame.
 * `formatEndpoint` owns brand-specific address formatting (yarn/jenkins/nacos/…).
 */
export function useConnectorWorkbenchHeader(options: {
    connectionId: MaybeRefOrGetter<string>
    noConnectionLabel: MaybeRefOrGetter<string>
    formatEndpoint: FormatConnectorEndpoint
}) {
    const explorer = useExplorerStore()
    const endpointLabel = ref('')

    const connectionId = computed(() => toValue(options.connectionId))
    const connectionName = computed(() => {
        const id = connectionId.value
        if (!id) return toValue(options.noConnectionLabel)
        return explorer.findNode(id)?.label ?? id
    })

    const displayEndpoint = computed(() => endpointLabel.value || connectionName.value)
    const canOpenConsole = computed(() => isHttpConsoleUrl(endpointLabel.value))

    async function loadHeader() {
        const id = connectionId.value
        if (!id) {
            endpointLabel.value = ''
            return
        }
        const config = await fetchConnectionConfig(id)
        if (!config) {
            endpointLabel.value = connectionName.value
            return
        }
        endpointLabel.value = options.formatEndpoint(config, connectionName.value)
    }

    function openConsole() {
        openHttpConsole(endpointLabel.value)
    }

    onMounted(() => {
        void loadHeader()
    })
    watch(connectionId, () => {
        void loadHeader()
    })

    return {
        connectionId,
        connectionName,
        endpointLabel,
        displayEndpoint,
        canOpenConsole,
        loadHeader,
        openConsole,
    }
}

/** Shared fallback chain: formatted → config.url → label. */
export function connectorEndpointFromConfig(
    config: ConnectionConfig,
    fallbackLabel: string,
    format: (config: ConnectionConfig) => string | undefined | null,
): string {
    return format(config)?.trim() || config.url?.trim() || fallbackLabel
}
