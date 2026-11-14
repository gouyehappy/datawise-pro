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
import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.security.ExplorerFeatureGate;
import org.apache.datawise.backend.security.RequiresExplorerGate;
import org.apache.datawise.backend.security.RequiresFeature;
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

    public ExplorerElasticsearchController(ExplorerElasticsearchService elasticsearchService) {
        this.elasticsearchService = elasticsearchService;
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

    @RequiresFeature(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_CONSOLE)
    @PostMapping("/connections/{connectionId}/elasticsearch/rest")
    public ApiResponse<ElasticsearchRestResultDto> executeRest(
            @PathVariable String connectionId,
            @RequestBody ElasticsearchRestExecuteRequest request
    ) {
        return ApiResponse.ok(elasticsearchService.executeRest(connectionId, request));
    }

    @RequiresFeature(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_EXPORT)
    @PostMapping("/connections/{connectionId}/elasticsearch/indices/{index}/clear")
    public ApiResponse<ElasticsearchClearIndexResultDto> clearIndex(
            @PathVariable String connectionId,
            @PathVariable String index
    ) {
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
    @RequiresExplorerGate(ExplorerFeatureGate.CATALOG_MUTATION)
    public ApiResponse<ElasticsearchDocumentMutationResultDto> createDocument(
            @PathVariable String connectionId,
            @PathVariable String index,
            @RequestBody ElasticsearchDocumentUpsertRequest request
    ) {
        return ApiResponse.ok(elasticsearchService.upsertDocument(connectionId, index, request));
    }

    @PutMapping("/connections/{connectionId}/elasticsearch/indices/{index}/documents/{id}")
    @RequiresExplorerGate(ExplorerFeatureGate.CATALOG_MUTATION)
    public ApiResponse<ElasticsearchDocumentMutationResultDto> updateDocument(
            @PathVariable String connectionId,
            @PathVariable String index,
            @PathVariable String id,
            @RequestBody ElasticsearchDocumentUpsertRequest request
    ) {
        ElasticsearchDocumentUpsertRequest payload = request == null
                ? new ElasticsearchDocumentUpsertRequest(id, null, null)
                : new ElasticsearchDocumentUpsertRequest(id, request.sourceJson(), request.routing());
        return ApiResponse.ok(elasticsearchService.upsertDocument(connectionId, index, payload));
    }

    @DeleteMapping("/connections/{connectionId}/elasticsearch/indices/{index}/documents/{id}")
    @RequiresExplorerGate(ExplorerFeatureGate.CATALOG_MUTATION)
    public ApiResponse<ElasticsearchDocumentMutationResultDto> deleteDocument(
            @PathVariable String connectionId,
            @PathVariable String index,
            @PathVariable String id,
            @RequestParam(required = false) String routing
    ) {
        return ApiResponse.ok(elasticsearchService.deleteDocument(connectionId, index, id, routing));
    }
}
