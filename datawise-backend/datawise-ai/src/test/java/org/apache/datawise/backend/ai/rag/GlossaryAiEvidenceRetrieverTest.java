package org.apache.datawise.backend.ai.rag;

import org.apache.datawise.backend.model.AiKnowledgeEntry;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GlossaryAiEvidenceRetrieverTest {

    @Test
    void scoresTermAndSynonymMatches() {
        AiKnowledgeEntry entry = new AiKnowledgeEntry();
        entry.setTerm("销售额");
        entry.setSynonyms(List.of("GMV", "sales"));
        entry.setRelatedTables(List.of("orders"));

        int score = GlossaryAiEvidenceRetriever.scoreEntry(
                "分析今年的销售额和gmv趋势",
                List.of("分析", "今年", "销售额", "gmv", "趋势"),
                entry
        );

        assertTrue(score > 0);
    }

    @Test
    void ignoresUnrelatedEntries() {
        AiKnowledgeEntry entry = new AiKnowledgeEntry();
        entry.setTerm("库存周转");
        entry.setDefinition("warehouse metric");

        int score = GlossaryAiEvidenceRetriever.scoreEntry(
                "分析今年的销售额",
                List.of("分析", "今年", "销售额"),
                entry
        );

        assertEquals(0, score);
    }
}
