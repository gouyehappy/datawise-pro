package org.apache.datawise.backend.connector.facade;

import org.apache.datawise.backend.connector.facade.cicd.ConnectorCiCdAccess;
import org.apache.datawise.backend.connector.facade.clustermanager.ConnectorClusterManagerAccess;
import org.apache.datawise.backend.connector.facade.catalog.ConnectorCatalogAccess;
import org.apache.datawise.backend.connector.facade.ddl.ConnectorDdlAccess;
import org.apache.datawise.backend.connector.facade.document.ConnectorDocumentAccess;
import org.apache.datawise.backend.connector.facade.dml.ConnectorDmlAccess;
import org.apache.datawise.backend.connector.facade.elasticsearch.ConnectorElasticsearchAccess;
import org.apache.datawise.backend.connector.facade.jdbc.ConnectorJdbcAccess;
import org.apache.datawise.backend.connector.facade.kubernetes.ConnectorKubernetesAccess;
import org.apache.datawise.backend.connector.facade.messagebroker.ConnectorMessageBrokerAccess;
import org.apache.datawise.backend.connector.facade.nacos.ConnectorNacosAccess;
import org.apache.datawise.backend.connector.facade.nativecmd.ConnectorNativeAccess;
import org.apache.datawise.backend.connector.facade.ops.ConnectorOpsAccess;
import org.apache.datawise.backend.connector.facade.polaris.ConnectorPolarisAccess;
import org.apache.datawise.backend.connector.facade.schema.ConnectorSchemaAccess;
import org.springframework.stereotype.Component;

/**
 * 连接器能力编排门面：database 层统一经此访问 JDBC / DML / Schema / Catalog / DDL，避免直连底层 Registry 与 Executor。
 */
@Component
public class ConnectorFacade {

    private final ConnectorJdbcAccess jdbc;
    private final ConnectorDmlAccess dml;
    private final ConnectorSchemaAccess schema;
    private final ConnectorOpsAccess ops;
    private final ConnectorCatalogAccess catalog;
    private final ConnectorNativeAccess nativeAccess;
    private final ConnectorMessageBrokerAccess messageBroker;
    private final ConnectorClusterManagerAccess clusterManager;
    private final ConnectorCiCdAccess ciCd;
    private final ConnectorKubernetesAccess kubernetes;
    private final ConnectorNacosAccess nacos;
    private final ConnectorPolarisAccess polaris;
    private final ConnectorDdlAccess ddl;
    private final ConnectorDocumentAccess document;
    private final ConnectorElasticsearchAccess elasticsearch;

    public ConnectorFacade(
                           ConnectorJdbcAccess jdbc,
                           ConnectorDmlAccess dml,
                           ConnectorSchemaAccess schema,
                           ConnectorOpsAccess ops,
                           ConnectorCatalogAccess catalog,
                           ConnectorNativeAccess nativeAccess,
                           ConnectorMessageBrokerAccess messageBroker,
                           ConnectorClusterManagerAccess clusterManager,
                           ConnectorCiCdAccess ciCd,
                           ConnectorKubernetesAccess kubernetes,
                           ConnectorNacosAccess nacos,
                           ConnectorPolarisAccess polaris,
                           ConnectorDdlAccess ddl,
                           ConnectorDocumentAccess document,
                           ConnectorElasticsearchAccess elasticsearch) {
        this.jdbc = jdbc;
        this.dml = dml;
        this.schema = schema;
        this.ops = ops;
        this.catalog = catalog;
        this.nativeAccess = nativeAccess;
        this.messageBroker = messageBroker;
        this.clusterManager = clusterManager;
        this.ciCd = ciCd;
        this.kubernetes = kubernetes;
        this.nacos = nacos;
        this.polaris = polaris;
        this.ddl = ddl;
        this.document = document;
        this.elasticsearch = elasticsearch;
    }

    public ConnectorJdbcAccess jdbc() {
        return jdbc;
    }

    public ConnectorDmlAccess dml() {
        return dml;
    }

    public ConnectorSchemaAccess schema() {
        return schema;
    }

    public ConnectorOpsAccess ops() {
        return ops;
    }

    public ConnectorCatalogAccess catalog() {
        return catalog;
    }

    public ConnectorNativeAccess nativeAccess() {
        return nativeAccess;
    }

    public ConnectorMessageBrokerAccess messageBroker() {
        return messageBroker;
    }

    public ConnectorClusterManagerAccess clusterManager() {
        return clusterManager;
    }

    public ConnectorCiCdAccess ciCd() {
        return ciCd;
    }

    public ConnectorKubernetesAccess kubernetes() {
        return kubernetes;
    }

    public ConnectorNacosAccess nacos() {
        return nacos;
    }

    public ConnectorPolarisAccess polaris() {
        return polaris;
    }

    public ConnectorDdlAccess ddl() {
        return ddl;
    }

    public ConnectorDocumentAccess document() {
        return document;
    }

    public ConnectorElasticsearchAccess elasticsearch() {
        return elasticsearch;
    }
}
