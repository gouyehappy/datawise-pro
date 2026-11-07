package org.apache.datawise.backend.ai.rag;

import java.util.List;

/**
 * RAG 召回请求
 */
public record AiEvidenceRecallRequest(
        String connectionId,
        String database,
        String prompt,
        List<String> candidateTables
) {
}
