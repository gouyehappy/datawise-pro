package org.apache.datawise.backend.connector.spi;

import org.apache.datawise.backend.connector.DataSourceConnector;

/**
 * SPI for datasource connector plugins dropped into {@code config/plugins/}.
 * Implementations are discovered via {@code META-INF/services/} and loaded at runtime.
 */
public interface DataSourceConnectorProvider {

    DataSourceConnector create(ConnectorPluginContext context);

    /** 插件 JAR 提供的 DDL / 类型映射 / Schema 方言（classpath AutoConfiguration 可省略）。 */
    default ConnectorDialectContributions dialectContributions() {
        return ConnectorDialectContributions.EMPTY;
    }
}
