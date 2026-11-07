/**
 * Connector Kit (A-08) — minimal surface for L1 platform workbenches.
 *
 * Frame UI: `components/shared/ConnectorWorkbenchFrame.vue`
 * Styles: `components/shared/connector-workbench.css`
 * Namespace bar: `components/shared/ConnectorNamespaceBar.vue`
 * Header composable: `composables/useConnectorWorkbenchHeader.ts`
 */
export {
    connectorEndpointFromConfig,
    isHttpConsoleUrl,
    openHttpConsole,
    useConnectorWorkbenchHeader,
    type FormatConnectorEndpoint,
} from './composables/useConnectorWorkbenchHeader'
