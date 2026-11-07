package org.apache.datawise.backend.ai.rag;

import org.apache.datawise.backend.ai.config.AiRagProperties;
import org.apache.datawise.backend.configstore.AiKnowledgeStore;
import org.apache.datawise.backend.ai.domain.AiEvidenceSnippet;
import org.apache.datawise.backend.model.AiKnowledgeEntry;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

@Component
public class GlossaryAiEvidenceRetriever implements KeywordAiEvidenceRetriever {

    private final AiKnowledgeStore knowledgeStore;
    private final AiQueryRewriter queryRewriter;
    private final AiRagProperties ragProperties;

    public GlossaryAiEvidenceRetriever(
            AiKnowledgeStore knowledgeStore,
            AiQueryRewriter queryRewriter,
            AiRagProperties ragProperties
    ) {
        this.knowledgeStore = knowledgeStore;
        this.queryRewriter = queryRewriter;
        this.ragProperties = ragProperties;
    }

    @Override
    public List<AiEvidenceSnippet> retrieve(AiEvidenceRecallRequest request) {
        String query = queryRewriter.rewrite(request.prompt());
        if (query.isBlank()) {
            return List.of();
        }
        String queryNorm = normalize(query);
        List<String> tokens = queryRewriter.tokens(query);

        List<ScoredEntry> scored = new ArrayList<>();
        for (AiKnowledgeEntry entry : knowledgeStore.listScoped(request.connectionId(), request.database())) {
            int score = scoreEntry(queryNorm, tokens, entry);
            if (score > 0) {
                scored.add(new ScoredEntry(entry, score));
            }
        }
        scored.sort(Comparator.comparingInt(ScoredEntry::score).reversed());

        int limit = Math.max(1, ragProperties.getMaxGlossaryHits());
        List<AiEvidenceSnippet> snippets = new ArrayList<>();
        for (int i = 0; i < Math.min(limit, scored.size()); i++) {
            ScoredEntry item = scored.get(i);
            String definition = item.entry().getDefinition();
            if (definition == null || definition.isBlank()) {
                continue;
            }
            snippets.add(AiEvidenceSnippet.glossary(
                    item.entry().getTerm(),
                    definition.trim(),
                    item.score()
            ));
        }
        return snippets;
    }

    static int scoreEntry(String queryNorm, List<String> tokens, AiKnowledgeEntry entry) {
        int score = 0;
        String term = entry.getTerm();
        if (term != null && !term.isBlank()) {
            String termNorm = normalize(term);
            if (queryNorm.contains(termNorm)) {
                score += 100 + termNorm.length() * 2;
            }
        }
        if (entry.getSynonyms() != null) {
            for (String synonym : entry.getSynonyms()) {
                if (synonym == null || synonym.isBlank()) {
                    continue;
                }
                String synonymNorm = normalize(synonym);
                if (queryNorm.contains(synonymNorm)) {
                    score += 60 + synonymNorm.length();
                }
            }
        }
        for (String token : tokens) {
            if (term != null && normalize(term).contains(token)) {
                score += token.length() * 4;
            }
            if (entry.getSynonyms() != null) {
                for (String synonym : entry.getSynonyms()) {
                    if (synonym != null && normalize(synonym).contains(token)) {
                        score += token.length() * 3;
                    }
                }
            }
            if (entry.getRelatedTables() != null) {
                for (String table : entry.getRelatedTables()) {
                    if (table != null && normalize(table).contains(token)) {
                        score += token.length() * 2;
                    }
                }
            }
        }
        return score;
    }

    private static String normalize(String value) {
        return value.toLowerCase(Locale.ROOT).replaceAll("\\s+", "");
    }

    private record ScoredEntry(AiKnowledgeEntry entry, int score) {
    }
}
