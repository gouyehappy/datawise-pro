package org.apache.datawise.backend.connector.elasticsearch;

import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.connector.elasticsearch.support.ElasticsearchConnectionErrors;
import org.apache.datawise.backend.connector.operation.ConnectorConnectionOperations;
import org.apache.datawise.backend.connector.operation.ConnectorDocumentOperations;
import org.apache.datawise.backend.connector.operation.ConnectorElasticsearchOperations;
import org.apache.datawise.backend.domain.ConnectionTestResult;
import org.apache.datawise.backend.domain.ElasticsearchClearIndexResultDto;
import org.apache.datawise.backend.domain.ElasticsearchDocumentDto;
import org.apache.datawise.backend.domain.ElasticsearchDocumentMutationResultDto;
import org.apache.datawise.backend.domain.ElasticsearchIndexMetadataDto;
import org.apache.datawise.backend.domain.ElasticsearchIndicesResultDto;
import org.apache.datawise.backend.domain.ElasticsearchRestResultDto;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.elasticsearch.ElasticsearchConnectionSupport;
import org.apache.datawise.backend.elasticsearch.ElasticsearchDocumentSupport;
import org.apache.datawise.backend.elasticsearch.ElasticsearchIndexSupport;
import org.apache.datawise.backend.elasticsearch.ElasticsearchRestClient;
import org.apache.datawise.backend.elasticsearch.ElasticsearchRestExecutor;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** REST-backed connection + Elasticsearch ops (hybrid with JDBC SQL). */
public class ElasticsearchConnectorOperations
        implements ConnectorConnectionOperations, ConnectorElasticsearchOperations, ConnectorDocumentOperations {

    private static final Logger log = LoggerFactory.getLogger(ElasticsearchConnectorOperations.class);

    @Override
    public ConnectionTestResult test(ConnectionEntity entity) {
        long start = System.currentTimeMillis();
        try {
            ElasticsearchRestClient.RestResponse response = ElasticsearchConnectionSupport.probe(entity);
            long latency = System.currentTimeMillis() - start;
            if (!response.isSuccessful()) {
                return new ConnectionTestResult(
                        false,
                        "Elasticsearch responded with HTTP " + response.status()
                                + " for " + ElasticsearchConnectionSupport.describeTarget(entity),
                        latency
                );
            }
            return new ConnectionTestResult(
                    true,
                    String.format(
                            "Connected to Elasticsearch %s in %dms",
                            ElasticsearchConnectionSupport.describeTarget(entity),
                            latency
                    ),
                    latency
            );
        } catch (Exception ex) {
            ExceptionLogging.warn(
                    log,
                    "Elasticsearch REST connection test failed for "
                            + ElasticsearchConnectionSupport.describeTarget(entity),
                    ex
            );
            long latency = System.currentTimeMillis() - start;
            return new ConnectionTestResult(false, ElasticsearchConnectionErrors.toUserMessage(entity, ex), latency);
        }
    }

    @Override
    public ElasticsearchIndicesResultDto listIndices(ConnectionEntity connection) {
        return wrap(() -> ElasticsearchIndexSupport.listIndices(connection));
    }

    @Override
    public ElasticsearchIndexMetadataDto getIndexMetadata(ConnectionEntity connection, String index) {
        return wrap(() -> ElasticsearchIndexSupport.getIndexMetadata(connection, index));
    }

    @Override
    public ElasticsearchIndexMetadataDto getIndexMetadata(ConnectionEntity connection, String index, String kind) {
        return wrap(() -> ElasticsearchIndexSupport.getIndexMetadata(connection, index, kind));
    }

    @Override
    public ElasticsearchRestResultDto executeRest(ConnectionEntity connection, String requestText) {
        return wrap(() -> ElasticsearchRestExecutor.execute(connection, requestText));
    }

    @Override
    public ElasticsearchClearIndexResultDto clearIndex(ConnectionEntity connection, String index) {
        return wrap(() -> ElasticsearchIndexSupport.clearIndex(connection, index));
    }

    @Override
    public TableDataResult fetchDocuments(
            ConnectionEntity connection,
            String index,
            int offset,
            int limit,
            String filterJson
    ) {
        return wrap(() -> ElasticsearchDocumentSupport.fetchDocumentPage(connection, index, offset, limit, filterJson));
    }

    @Override
    public long countDocuments(ConnectionEntity connection, String index, String filterJson) {
        return wrap(() -> ElasticsearchDocumentSupport.countDocuments(connection, index, filterJson));
    }

    @Override
    public ElasticsearchDocumentDto getDocument(ConnectionEntity connection, String index, String id) {
        return wrap(() -> ElasticsearchDocumentSupport.getDocument(connection, index, id));
    }

    @Override
    public ElasticsearchDocumentMutationResultDto upsertDocument(
            ConnectionEntity connection,
            String index,
            String id,
            String sourceJson,
            String routing
    ) {
        return wrap(() -> ElasticsearchDocumentSupport.upsertDocument(connection, index, id, sourceJson, routing));
    }

    @Override
    public ElasticsearchDocumentMutationResultDto deleteDocument(
            ConnectionEntity connection,
            String index,
            String id,
            String routing
    ) {
        return wrap(() -> ElasticsearchDocumentSupport.deleteDocument(connection, index, id, routing));
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
        return fetchDocuments(connection, collection, offset, limit, filterJson);
    }

    @Override
    public TablePropertiesResult loadCollectionProperties(
            ConnectionEntity connection,
            String database,
            String collection
    ) {
        return wrap(() -> {
            TableDataResult sample = ElasticsearchDocumentSupport.fetchDocumentPage(
                    connection, collection, 0, 50, null
            );
            java.util.List<org.apache.datawise.backend.domain.TableColumnDetail> columns =
                    new java.util.ArrayList<>(sample.columns().size());
            int ordinal = 1;
            for (java.util.Map<String, Object> column : sample.columns()) {
                String name = String.valueOf(column.get("name"));
                String type = String.valueOf(column.getOrDefault("type", "string"));
                columns.add(new org.apache.datawise.backend.domain.TableColumnDetail(
                        ordinal++,
                        name,
                        type,
                        true,
                        false,
                        "_id".equals(name) ? "PRI" : null,
                        null,
                        null,
                        null
                ));
            }
            return new TablePropertiesResult(
                    collection,
                    null,
                    null,
                    null,
                    null,
                    null,
                    columns,
                    java.util.List.of(),
                    java.util.List.of()
            );
        });
    }

    private static <T> T wrap(ElasticsearchCallable<T> callable) {
        try {
            return callable.call();
        } catch (Exception ex) {
            throw new IllegalStateException(ex.getMessage(), ex);
        }
    }

    @FunctionalInterface
    private interface ElasticsearchCallable<T> {
        T call() throws Exception;
    }
}
