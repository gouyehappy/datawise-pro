package org.apache.datawise.backend.controller.explorer;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.database.explorer.ExplorerElasticsearchService;
import org.apache.datawise.backend.domain.ElasticsearchClearIndexResultDto;
import org.apache.datawise.backend.domain.ElasticsearchDocumentDto;
import org.apache.datawise.backend.domain.ElasticsearchDocumentMutationResultDto;
import org.apache.datawise.backend.domain.ElasticsearchDocumentUpsertRequest;
import org.apache.datawise.backend.domain.ElasticsearchIndexMetadataDto;
import org.apache.datawise.backend.domain.ElasticsearchIndicesResultDto;
import org.apache.datawise.backend.domain.ElasticsearchRestExecuteRequest;
import org.apache.datawise.backend.domain.ElasticsearchRestResultDto;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.service.FeaturePermissionAccess;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/explorer")
public class ExplorerElasticsearchController {

    private final ExplorerElasticsearchService elasticsearchService;
    private final FeaturePermissionAccess featurePermissionAccess;

    public ExplorerElasticsearchController(
            ExplorerElasticsearchService elasticsearchService,
            FeaturePermissionAccess featurePermissionAccess
    ) {
        this.elasticsearchService = elasticsearchService;
        this.featurePermissionAccess = featurePermissionAccess;
    }

    @GetMapping("/connections/{connectionId}/elasticsearch/indices")
    public ApiResponse<ElasticsearchIndicesResultDto> listIndices(@PathVariable String connectionId) {
        return ApiResponse.ok(elasticsearchService.listIndices(connectionId));
    }

    @GetMapping("/connections/{connectionId}/elasticsearch/indices/{index}/metadata")
    public ApiResponse<ElasticsearchIndexMetadataDto> indexMetadata(
            @PathVariable String connectionId,
            @PathVariable String index,
            @RequestParam(required = false) String kind
    ) {
        if (kind == null || kind.isBlank()) {
            return ApiResponse.ok(elasticsearchService.getIndexMetadata(connectionId, index));
        }
        return ApiResponse.ok(elasticsearchService.getIndexMetadata(connectionId, index, kind));
    }

    @PostMapping("/connections/{connectionId}/elasticsearch/rest")
    public ApiResponse<ElasticsearchRestResultDto> executeRest(
            @PathVariable String connectionId,
            @RequestBody ElasticsearchRestExecuteRequest request
    ) {
        featurePermissionAccess.requireExplorerContextConsole();
        return ApiResponse.ok(elasticsearchService.executeRest(connectionId, request));
    }

    @PostMapping("/connections/{connectionId}/elasticsearch/indices/{index}/clear")
    public ApiResponse<ElasticsearchClearIndexResultDto> clearIndex(
            @PathVariable String connectionId,
            @PathVariable String index
    ) {
        featurePermissionAccess.requireExplorerContextExport();
        return ApiResponse.ok(elasticsearchService.clearIndex(connectionId, index));
    }

    @GetMapping("/connections/{connectionId}/elasticsearch/indices/{index}/documents")
    public ApiResponse<TableDataResult> listDocuments(
            @PathVariable String connectionId,
            @PathVariable String index,
            @RequestParam(required = false) Integer offset,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) String filter
    ) {
        return ApiResponse.ok(elasticsearchService.fetchDocuments(connectionId, index, offset, limit, filter));
    }

    @GetMapping("/connections/{connectionId}/elasticsearch/indices/{index}/count")
    public ApiResponse<Long> countDocuments(
            @PathVariable String connectionId,
            @PathVariable String index,
            @RequestParam(required = false) String filter
    ) {
        return ApiResponse.ok(elasticsearchService.countDocuments(connectionId, index, filter));
    }

    @GetMapping("/connections/{connectionId}/elasticsearch/indices/{index}/documents/{id}")
    public ApiResponse<ElasticsearchDocumentDto> getDocument(
            @PathVariable String connectionId,
            @PathVariable String index,
            @PathVariable String id
    ) {
        return ApiResponse.ok(elasticsearchService.getDocument(connectionId, index, id));
    }

    @PostMapping("/connections/{connectionId}/elasticsearch/indices/{index}/documents")
    public ApiResponse<ElasticsearchDocumentMutationResultDto> createDocument(
            @PathVariable String connectionId,
            @PathVariable String index,
            @RequestBody ElasticsearchDocumentUpsertRequest request
    ) {
        featurePermissionAccess.requireExplorerContextEdit();
        return ApiResponse.ok(elasticsearchService.upsertDocument(connectionId, index, request));
    }

    @PutMapping("/connections/{connectionId}/elasticsearch/indices/{index}/documents/{id}")
    public ApiResponse<ElasticsearchDocumentMutationResultDto> updateDocument(
            @PathVariable String connectionId,
            @PathVariable String index,
            @PathVariable String id,
            @RequestBody ElasticsearchDocumentUpsertRequest request
    ) {
        featurePermissionAccess.requireExplorerContextEdit();
        ElasticsearchDocumentUpsertRequest payload = request == null
                ? new ElasticsearchDocumentUpsertRequest(id, null, null)
                : new ElasticsearchDocumentUpsertRequest(id, request.sourceJson(), request.routing());
        return ApiResponse.ok(elasticsearchService.upsertDocument(connectionId, index, payload));
    }

    @DeleteMapping("/connections/{connectionId}/elasticsearch/indices/{index}/documents/{id}")
    public ApiResponse<ElasticsearchDocumentMutationResultDto> deleteDocument(
            @PathVariable String connectionId,
            @PathVariable String index,
            @PathVariable String id,
            @RequestParam(required = false) String routing
    ) {
        featurePermissionAccess.requireExplorerContextEdit();
        return ApiResponse.ok(elasticsearchService.deleteDocument(connectionId, index, id, routing));
    }
}
