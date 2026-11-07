package org.apache.datawise.backend.connector.kudu;

import org.apache.datawise.backend.common.ExplorerConnectionException;
import org.apache.datawise.backend.connector.catalog.SchemaSession;
import org.apache.datawise.backend.connector.kudu.support.KuduConnectionErrors;
import org.apache.datawise.backend.connector.kudu.support.KuduConnectionSupport;
import org.apache.datawise.backend.connector.kudu.support.KuduTableSupport;
import org.apache.datawise.backend.connector.operation.ConnectorCatalogOperations;
import org.apache.datawise.backend.connector.operation.ConnectorConnectionOperations;
import org.apache.datawise.backend.connector.operation.ConnectorDocumentOperations;
import org.apache.datawise.backend.domain.ConnectionTestResult;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.kudu.KuduSchemaSession;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

public class KuduConnectorOperations
        implements ConnectorConnectionOperations, ConnectorCatalogOperations, ConnectorDocumentOperations {

    private static final Logger log = LoggerFactory.getLogger(KuduConnectorOperations.class);

    @Override
    public ConnectionTestResult test(ConnectionEntity entity) {
        long start = System.currentTimeMillis();
        try {
            KuduConnectionSupport.ping(entity);
            long latency = System.currentTimeMillis() - start;
            return new ConnectionTestResult(
                    true,
                    String.format("Connected to Kudu masters %s in %dms", KuduConnectionSupport.describeTarget(entity), latency),
                    latency
            );
        } catch (Exception ex) {
            ExceptionLogging.warn(
                    log,
                    "Kudu connection test failed for " + KuduConnectionSupport.describeTarget(entity),
                    ex
            );
            long latency = System.currentTimeMillis() - start;
            return new ConnectionTestResult(
                    false,
                    KuduConnectionErrors.toUserMessage(entity, ex),
                    latency
            );
        }
    }

    @Override
    public List<TreeNode> loadConnectionRoot(ConnectionEntity connection, String pattern) {
        try {
            return KuduConnectionSupport.buildDatabaseNodes(
                    connection.getId(),
                    List.of(KuduConnectionSupport.DEFAULT_CATALOG)
            );
        } catch (Exception ex) {
            throw new ExplorerConnectionException(
                    KuduConnectionErrors.toUserMessage(connection, ex),
                    "CONNECTION_INTROSPECT_FAILED",
                    ex
            );
        }
    }

    @Override
    public boolean supportsSchemaTree() {
        return true;
    }

    @Override
    public SchemaSession openSchemaSession(ConnectionEntity connection) {
        return new KuduSchemaSession(connection);
    }

    @Override
    public TableDataResult fetchCollectionPage(
            ConnectionEntity connection,
            String database,
            String collection,
            int offset,
            int limit
    ) {
        return KuduTableSupport.fetchTablePage(connection, database, collection, offset, limit);
    }

    @Override
    public TablePropertiesResult loadCollectionProperties(
            ConnectionEntity connection,
            String database,
            String collection
    ) {
        return KuduTableSupport.loadTableProperties(connection, database, collection);
    }
}
