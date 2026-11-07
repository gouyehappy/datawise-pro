package org.apache.datawise.backend.connector.spi;

import org.apache.datawise.backend.connector.operation.ConnectorCatalogOperations;
import org.apache.datawise.backend.connector.operation.ConnectorConnectionOperations;
import org.apache.datawise.backend.connector.operation.ConnectorDdlOperations;
import org.apache.datawise.backend.connector.operation.ConnectorMetadataOperations;

/** 宿主提供给插件 JAR 的 JDBC 连接器委托面（实现类 {@code JdbcConnectorOperations} 在 connector-api）。 */
public interface ConnectorJdbcOperations
        extends
            ConnectorConnectionOperations,
            ConnectorCatalogOperations,
            ConnectorMetadataOperations,
            ConnectorDdlOperations {
}
