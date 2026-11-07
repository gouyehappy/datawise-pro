package org.apache.datawise.backend.ai.web;

import org.apache.datawise.backend.ai.schema.AiSchemaContextService;
import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.common.pack.AiAccessGate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/ai/schema")
public class AiSchemaController {

    private final AiSchemaContextService schemaContextService;
    private final AiAccessGate aiAccessGate;

    public AiSchemaController(AiSchemaContextService schemaContextService, AiAccessGate aiAccessGate) {
        this.schemaContextService = schemaContextService;
        this.aiAccessGate = aiAccessGate;
    }

    @GetMapping("/tables")
    public ApiResponse<List<String>> listTables(
            @RequestParam String connectionId,
            @RequestParam(required = false) String database
    ) {
        aiAccessGate.requireAiPack();
        return ApiResponse.ok(schemaContextService.listTableNames(connectionId, database));
    }
}
