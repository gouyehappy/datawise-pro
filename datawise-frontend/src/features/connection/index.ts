/**
 * Connection feature public exports.
 * Cross-feature code should prefer this barrel over deep paths.
 */
export {formatNacosConsoleAddress} from './utils/nacos-endpoint'
export {formatHttpEndpoint} from './utils/http-endpoint'
export {
    CONNECTION_ENV_DEFAULT,
    CONNECTION_ENV_OPTIONS,
    resolveConnectionEnvironmentLabel,
    resolveConnectionEnvironmentVariant,
    type ConnectionEnvironment,
} from './services/connection-environment.service'
