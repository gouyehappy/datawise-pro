package org.apache.datawise.backend.connector;

import org.apache.datawise.backend.connector.operation.ConnectorCatalogOperations;
import org.apache.datawise.backend.connector.operation.ConnectorCiCdOperations;
import org.apache.datawise.backend.connector.operation.ConnectorClusterManagerOperations;
import org.apache.datawise.backend.connector.operation.ConnectorConnectionOperations;
import org.apache.datawise.backend.connector.operation.ConnectorDdlOperations;
import org.apache.datawise.backend.connector.operation.ConnectorDocumentOperations;
import org.apache.datawise.backend.connector.operation.ConnectorElasticsearchOperations;
import org.apache.datawise.backend.connector.operation.ConnectorKubernetesOperations;
import org.apache.datawise.backend.connector.operation.ConnectorMetadataOperations;
import org.apache.datawise.backend.connector.operation.ConnectorKeyValueOperations;
import org.apache.datawise.backend.connector.operation.ConnectorMessageBrokerOperations;
import org.apache.datawise.backend.connector.operation.ConnectorNacosOperations;
import org.apache.datawise.backend.connector.operation.ConnectorNativeCommandOperations;
import org.apache.datawise.backend.connector.operation.ConnectorPolarisOperations;
import org.apache.datawise.backend.domain.ConnectorExplorerUiProfileDto;

import java.util.EnumSet;

/**
 * 数据源连接器入口，借鉴 SeaTunnel Factory + 能力契约分层。
 * <p>
 * 新增 Oracle / StarRocks 等：实现本接口并注册为 Spring Bean 即可。
 */
public interface DataSourceConnector {

    /** 稳定标识，如 {@code jdbc-mysql}、{@code redis} */
    String id();

    /**
     * 解析顺序优先级：数值越小越优先。多个连接器同时 {@link #supports(String)} 时，Registry 取排序后首个。
     */
    default int priority() {
        return 500;
    }

    boolean supports(String dbType);

    EnumSet<ConnectorCapability> capabilities();

    /**
     * Optional explorer UI declaration (feature tree children + connection open-menu rows).
     * {@code null} means this connector does not contribute explorer UI catalog entries.
     */
    default ConnectorExplorerUiProfileDto explorerUi() {
        return null;
    }

    default ConnectorConnectionOperations connection() {
        throw new UnsupportedConnectorOperationException(id(), "connection");
    }

    default ConnectorCatalogOperations catalog() {
        throw new UnsupportedConnectorOperationException(id(), "catalog");
    }

    default ConnectorMetadataOperations metadata() {
        throw new UnsupportedConnectorOperationException(id(), "metadata");
    }

    default ConnectorDdlOperations ddl() {
        throw new UnsupportedConnectorOperationException(id(), "ddl");
    }

    default ConnectorNativeCommandOperations nativeCommand() {
        throw new UnsupportedConnectorOperationException(id(), "nativeCommand");
    }

    default ConnectorKeyValueOperations keyValue() {
        throw new UnsupportedConnectorOperationException(id(), "keyValue");
    }

    default ConnectorMessageBrokerOperations messageBroker() {
        throw new UnsupportedConnectorOperationException(id(), "messageBroker");
    }

    default ConnectorDocumentOperations document() {
        throw new UnsupportedConnectorOperationException(id(), "document");
    }

    default ConnectorClusterManagerOperations clusterManager() {
        throw new UnsupportedConnectorOperationException(id(), "clusterManager");
    }

    default ConnectorCiCdOperations ciCd() {
        throw new UnsupportedConnectorOperationException(id(), "ciCd");
    }

    default ConnectorKubernetesOperations kubernetes() {
        throw new UnsupportedConnectorOperationException(id(), "kubernetes");
    }

    default ConnectorNacosOperations nacos() {
        throw new UnsupportedConnectorOperationException(id(), "nacos");
    }

    default ConnectorPolarisOperations polaris() {
        throw new UnsupportedConnectorOperationException(id(), "polaris");
    }

    default ConnectorElasticsearchOperations elasticsearch() {
        throw new UnsupportedConnectorOperationException(id(), "elasticsearch");
    }
}
