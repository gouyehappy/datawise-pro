package org.apache.datawise.backend.connector.mongodb;

import org.apache.datawise.backend.common.ExplorerConnectionException;
import org.apache.datawise.backend.connector.catalog.SchemaSession;
import org.apache.datawise.backend.connector.operation.ConnectorCatalogOperations;
import org.apache.datawise.backend.connector.operation.ConnectorConnectionOperations;
import org.apache.datawise.backend.connector.operation.ConnectorDocumentOperations;
import org.apache.datawise.backend.domain.ConnectionTestResult;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.mongodb.MongoSchemaSession;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.connector.mongodb.support.MongoConnectionErrors;
import org.apache.datawise.backend.connector.mongodb.support.MongoConnectionSupport;
import org.apache.datawise.backend.connector.mongodb.support.MongoDocumentSupport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

public class MongoConnectorOperations
        implements ConnectorConnectionOperations, ConnectorCatalogOperations, ConnectorDocumentOperations {

    private static final Logger log = LoggerFactory.getLogger(MongoConnectorOperations.class);

    @Override
    public ConnectionTestResult test(ConnectionEntity entity) {
        long start = System.currentTimeMillis();
        try {
            MongoConnectionSupport.ping(entity);
            long latency = System.currentTimeMillis() - start;
            return new ConnectionTestResult(
                    true,
                    String.format("Connected to MongoDB %s in %dms", MongoConnectionSupport.describeTarget(entity), latency),
                    latency
            );
        } catch (Exception ex) {
            ExceptionLogging.warn(
                    log,
                    "MongoDB connection test failed for " + MongoConnectionSupport.describeTarget(entity),
                    ex
            );
            long latency = System.currentTimeMillis() - start;
            return new ConnectionTestResult(
                    false,
                    MongoConnectionErrors.toUserMessage(entity, ex),
                    latency
            );
        }
    }

    @Override
    public List<TreeNode> loadConnectionRoot(ConnectionEntity connection, String pattern) {
        try {
            return MongoConnectionSupport.buildDatabaseNodes(
                    connection.getId(),
                    MongoConnectionSupport.listDatabases(connection)
            );
        } catch (Exception ex) {
            throw new ExplorerConnectionException(
                    MongoConnectionErrors.toUserMessage(connection, ex),
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
        return new MongoSchemaSession(connection);
    }

    @Override
    public TableDataResult fetchCollectionPage(
            ConnectionEntity connection,
            String database,
            String collection,
            int offset,
            int limit
    ) {
        return fetchCollectionPage(connection, database, collection, offset, limit, null);
    }

    @Override
    public TableDataResult fetchCollectionPage(
            ConnectionEntity connection,
            String database,
            String collection,
            int offset,
            int limit,
            String filterJson
    ) {
        return MongoDocumentSupport.fetchCollectionPage(
                connection,
                database,
                collection,
                offset,
                limit,
                filterJson
        );
    }

    @Override
    public TablePropertiesResult loadCollectionProperties(
            ConnectionEntity connection,
            String database,
            String collection
    ) {
        return MongoDocumentSupport.loadCollectionProperties(connection, database, collection);
    }
}
