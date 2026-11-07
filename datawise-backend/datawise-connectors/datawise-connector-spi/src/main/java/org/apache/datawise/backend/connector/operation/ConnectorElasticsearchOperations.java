package org.apache.datawise.backend.connector.operation;

import org.apache.datawise.backend.domain.ElasticsearchClearIndexResultDto;
import org.apache.datawise.backend.domain.ElasticsearchDocumentDto;
import org.apache.datawise.backend.domain.ElasticsearchDocumentMutationResultDto;
import org.apache.datawise.backend.domain.ElasticsearchIndexMetadataDto;
import org.apache.datawise.backend.domain.ElasticsearchIndicesResultDto;
import org.apache.datawise.backend.domain.ElasticsearchRestResultDto;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.model.ConnectionEntity;

/** Elasticsearch REST / index metadata / document operations (hybrid with JDBC SQL). */
public interface ConnectorElasticsearchOperations {

    ElasticsearchIndicesResultDto listIndices(ConnectionEntity connection);

    ElasticsearchIndexMetadataDto getIndexMetadata(ConnectionEntity connection, String index);

    ElasticsearchIndexMetadataDto getIndexMetadata(ConnectionEntity connection, String index, String kind);

    ElasticsearchRestResultDto executeRest(ConnectionEntity connection, String requestText);

    ElasticsearchClearIndexResultDto clearIndex(ConnectionEntity connection, String index);

    TableDataResult fetchDocuments(
                                   ConnectionEntity connection,
                                   String index,
                                   int offset,
                                   int limit,
                                   String filterJson);

    long countDocuments(ConnectionEntity connection, String index, String filterJson);

    ElasticsearchDocumentDto getDocument(ConnectionEntity connection, String index, String id);

    ElasticsearchDocumentMutationResultDto upsertDocument(
                                                          ConnectionEntity connection,
                                                          String index,
                                                          String id,
                                                          String sourceJson,
                                                          String routing);

    ElasticsearchDocumentMutationResultDto deleteDocument(
                                                          ConnectionEntity connection,
                                                          String index,
                                                          String id,
                                                          String routing);
}
