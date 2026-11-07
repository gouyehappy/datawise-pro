package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.domain.ElasticsearchClearIndexResultDto;
import org.apache.datawise.backend.domain.ElasticsearchDocumentDto;
import org.apache.datawise.backend.domain.ElasticsearchDocumentMutationResultDto;
import org.apache.datawise.backend.domain.ElasticsearchDocumentUpsertRequest;
import org.apache.datawise.backend.domain.ElasticsearchIndexMetadataDto;
import org.apache.datawise.backend.domain.ElasticsearchIndicesResultDto;
import org.apache.datawise.backend.domain.ElasticsearchRestExecuteRequest;
import org.apache.datawise.backend.domain.ElasticsearchRestResultDto;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.springframework.stereotype.Service;

@Service
public class ExplorerElasticsearchService {

    private final ConnectionExecutionContext connectionContext;
    private final ConnectorFacade connectorFacade;

    public ExplorerElasticsearchService(
            ConnectionExecutionContext connectionContext,
            ConnectorFacade connectorFacade
    ) {
        this.connectionContext = connectionContext;
        this.connectorFacade = connectorFacade;
    }

    public ElasticsearchIndicesResultDto listIndices(String connectionId) {
        return connectorFacade.elasticsearch().listIndices(requireConnection(connectionId));
    }

    public ElasticsearchIndexMetadataDto getIndexMetadata(String connectionId, String index) {
        return connectorFacade.elasticsearch().getIndexMetadata(requireConnection(connectionId), index);
    }

    public ElasticsearchIndexMetadataDto getIndexMetadata(String connectionId, String index, String kind) {
        return connectorFacade.elasticsearch().getIndexMetadata(requireConnection(connectionId), index, kind);
    }

    public ElasticsearchRestResultDto executeRest(String connectionId, ElasticsearchRestExecuteRequest request) {
        if (request == null || request.requestText() == null || request.requestText().isBlank()) {
            throw new IllegalArgumentException("requestText is required");
        }
        return connectorFacade.elasticsearch().executeRest(requireConnection(connectionId), request.requestText());
    }

    public ElasticsearchClearIndexResultDto clearIndex(String connectionId, String index) {
        return connectorFacade.elasticsearch().clearIndex(requireConnection(connectionId), index);
    }

    public TableDataResult fetchDocuments(
            String connectionId,
            String index,
            Integer offset,
            Integer limit,
            String filterJson
    ) {
        int pageOffset = offset == null || offset < 0 ? 0 : offset;
        int pageSize = limit == null || limit <= 0 ? 50 : Math.min(limit, 500);
        return connectorFacade.elasticsearch().fetchDocuments(
                requireConnection(connectionId), index, pageOffset, pageSize, filterJson
        );
    }

    public long countDocuments(String connectionId, String index, String filterJson) {
        return connectorFacade.elasticsearch().countDocuments(requireConnection(connectionId), index, filterJson);
    }

    public ElasticsearchDocumentDto getDocument(String connectionId, String index, String id) {
        return connectorFacade.elasticsearch().getDocument(requireConnection(connectionId), index, id);
    }

    public ElasticsearchDocumentMutationResultDto upsertDocument(
            String connectionId,
            String index,
            ElasticsearchDocumentUpsertRequest request
    ) {
        if (request == null || request.sourceJson() == null || request.sourceJson().isBlank()) {
            throw new IllegalArgumentException("sourceJson is required");
        }
        return connectorFacade.elasticsearch().upsertDocument(
                requireConnection(connectionId),
                index,
                request.id(),
                request.sourceJson(),
                request.routing()
        );
    }

    public ElasticsearchDocumentMutationResultDto deleteDocument(
            String connectionId,
            String index,
            String id,
            String routing
    ) {
        return connectorFacade.elasticsearch().deleteDocument(requireConnection(connectionId), index, id, routing);
    }

    private ConnectionEntity requireConnection(String connectionId) {
        return connectionContext.requireAvailableConnectionForCurrentUser(
                connectionId,
                ConnectionExecutionContext.EXPLORER_CONNECTION_NOT_FOUND
        ).entity();
    }
}
