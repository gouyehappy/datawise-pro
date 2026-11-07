package org.apache.datawise.backend.ai.web;

import org.apache.datawise.backend.ai.tag.AiTableTagService;
import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.common.pack.AiAccessGate;
import org.apache.datawise.backend.domain.AiTableTagCatalogItemDto;
import org.apache.datawise.backend.domain.UpdateAiTableTagsRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/ai/table-tags")
public class AiTableTagController {

    private final AiTableTagService tableTagService;
    private final AiAccessGate aiAccessGate;

    public AiTableTagController(AiTableTagService tableTagService, AiAccessGate aiAccessGate) {
        this.tableTagService = tableTagService;
        this.aiAccessGate = aiAccessGate;
    }

    @GetMapping("/catalog")
    public ApiResponse<List<AiTableTagCatalogItemDto>> catalog() {
        aiAccessGate.requireAiPack();
        return ApiResponse.ok(tableTagService.listCatalog());
    }

    @GetMapping
    public ApiResponse<List<String>> list(
            @RequestParam String connectionId,
            @RequestParam(required = false) String database
    ) {
        aiAccessGate.requireAiPack();
        return ApiResponse.ok(tableTagService.listTaggedTableNames(connectionId, database));
    }

    @PutMapping
    public ApiResponse<List<String>> update(@RequestBody UpdateAiTableTagsRequest request) {
        aiAccessGate.requireAiPack();
        return ApiResponse.ok(tableTagService.updateTags(request));
    }
}
