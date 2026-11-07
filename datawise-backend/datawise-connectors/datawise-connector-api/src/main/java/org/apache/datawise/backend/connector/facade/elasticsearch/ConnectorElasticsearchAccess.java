package org.apache.datawise.backend.connector.facade.elasticsearch;

import org.apache.datawise.backend.connector.facade.catalog.ConnectorCatalogAccess;
import org.apache.datawise.backend.domain.ElasticsearchClearIndexResultDto;
import org.apache.datawise.backend.domain.ElasticsearchDocumentDto;
import org.apache.datawise.backend.domain.ElasticsearchDocumentMutationResultDto;
import org.apache.datawise.backend.domain.ElasticsearchIndexMetadataDto;
import org.apache.datawise.backend.domain.ElasticsearchIndicesResultDto;
import org.apache.datawise.backend.domain.ElasticsearchRestResultDto;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.springframework.stereotype.Component;

/** Elasticsearch REST / index metadata / document capability entry. */
@Component
public class ConnectorElasticsearchAccess {

    private final ConnectorCatalogAccess catalog;

    public ConnectorElasticsearchAccess(ConnectorCatalogAccess catalog) {
        this.catalog = catalog;
    }

    public ElasticsearchIndicesResultDto listIndices(ConnectionEntity connection) {
        return catalog.resolve(connection).elasticsearch().listIndices(connection);
    }

    public ElasticsearchIndexMetadataDto getIndexMetadata(ConnectionEntity connection, String index) {
        return catalog.resolve(connection).elasticsearch().getIndexMetadata(connection, index);
    }

    public ElasticsearchIndexMetadataDto getIndexMetadata(ConnectionEntity connection, String index, String kind) {
        return catalog.resolve(connection).elasticsearch().getIndexMetadata(connection, index, kind);
    }

    public ElasticsearchRestResultDto executeRest(ConnectionEntity connection, String requestText) {
        return catalog.resolve(connection).elasticsearch().executeRest(connection, requestText);
    }

    public ElasticsearchClearIndexResultDto clearIndex(ConnectionEntity connection, String index) {
        return catalog.resolve(connection).elasticsearch().clearIndex(connection, index);
    }

    public TableDataResult fetchDocuments(
                                          ConnectionEntity connection,
                                          String index,
                                          int offset,
                                          int limit,
                                          String filterJson) {
        return catalog.resolve(connection).elasticsearch().fetchDocuments(connection, index, offset, limit, filterJson);
    }

    public long countDocuments(ConnectionEntity connection, String index, String filterJson) {
        return catalog.resolve(connection).elasticsearch().countDocuments(connection, index, filterJson);
    }

    public ElasticsearchDocumentDto getDocument(ConnectionEntity connection, String index, String id) {
        return catalog.resolve(connection).elasticsearch().getDocument(connection, index, id);
    }

    public ElasticsearchDocumentMutationResultDto upsertDocument(
                                                                 ConnectionEntity connection,
                                                                 String index,
                                                                 String id,
                                                                 String sourceJson,
                                                                 String routing) {
        return catalog.resolve(connection).elasticsearch()
                .upsertDocument(connection, index, id, sourceJson, routing);
    }

    public ElasticsearchDocumentMutationResultDto deleteDocument(
                                                                 ConnectionEntity connection,
                                                                 String index,
                                                                 String id,
                                                                 String routing) {
        return catalog.resolve(connection).elasticsearch().deleteDocument(connection, index, id, routing);
    }
}
