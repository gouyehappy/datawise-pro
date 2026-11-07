package org.apache.datawise.backend.ai.web;

import org.apache.datawise.backend.ai.knowledge.AiKnowledgeService;
import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.model.AiKnowledgeEntry;
import org.apache.datawise.backend.common.pack.AiAccessGate;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * AI knowledge CRUD; write access gated by {@link org.apache.datawise.backend.service.UserResource#AI_KNOWLEDGE}.
 */
@RestController
@RequestMapping("/api/ai/knowledge")
@ConditionalOnBean(AiKnowledgeService.class)
public class AiKnowledgeController {

    private final AiKnowledgeService knowledgeService;
    private final AiAccessGate aiAccessGate;

    public AiKnowledgeController(AiKnowledgeService knowledgeService, AiAccessGate aiAccessGate) {
        this.knowledgeService = knowledgeService;
        this.aiAccessGate = aiAccessGate;
    }

    @GetMapping
    public ApiResponse<List<AiKnowledgeEntry>> list(
            @RequestParam(required = false) String connectionId,
            @RequestParam(required = false) String database
    ) {
        aiAccessGate.requireAiPack();
        return ApiResponse.ok(knowledgeService.list(connectionId, database));
    }

    @PutMapping
    public ApiResponse<List<AiKnowledgeEntry>> replace(@RequestBody List<AiKnowledgeEntry> entries) {
        aiAccessGate.requireAiPack();
        return ApiResponse.ok(knowledgeService.replaceAll(entries));
    }
}
