package org.apache.datawise.backend.ai.rag;

import org.apache.datawise.backend.ai.config.AiRagProperties;
import org.apache.datawise.backend.ai.domain.EffectiveAiRagConfig;
import org.apache.datawise.backend.ai.rag.embedding.AiEmbeddingCosineSupport;
import org.apache.datawise.backend.ai.rag.embedding.AiEmbeddingService;
import org.apache.datawise.backend.configstore.AiKnowledgeStore;
import org.apache.datawise.backend.ai.domain.AiEvidenceSnippet;
import org.apache.datawise.backend.model.AiKnowledgeEntry;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * 内存向量检索。
 * {@code embedding.provider=openai} 时使用 cosine 相似度；否则使用 token 重叠启发式。
 */
@Component
public class MemoryVectorAiEvidenceRetriever implements VectorAiEvidenceRetriever {

    private final AiRagConfigResolver ragConfigResolver;
    private final AiRagProperties ragProperties;
    private final AiKnowledgeStore knowledgeStore;
    private final AiEmbeddingService embeddingService;

    public MemoryVectorAiEvidenceRetriever(
            AiRagConfigResolver ragConfigResolver,
            AiRagProperties ragProperties,
            AiKnowledgeStore knowledgeStore,
            AiEmbeddingService embeddingService
    ) {
        this.ragConfigResolver = ragConfigResolver;
        this.ragProperties = ragProperties;
        this.knowledgeStore = knowledgeStore;
        this.embeddingService = embeddingService;
    }

    @Override
    public boolean isAvailable() {
        EffectiveAiRagConfig config = ragConfigResolver.resolveForCurrentUser();
        return config.isVectorStoreEnabled()
                && "memory".equalsIgnoreCase(config.vectorStore().trim());
    }

    @Override
    public List<AiEvidenceSnippet> retrieve(AiEvidenceRecallRequest request) {
        if (!isAvailable()) {
            return List.of();
        }
        if (embeddingService.provider().equals("openai")) {
            return retrieveByEmbedding(request);
        }
        return retrieveByTokenOverlap(request);
    }

    private List<AiEvidenceSnippet> retrieveByEmbedding(AiEvidenceRecallRequest request) {
        String query = request.prompt() != null ? request.prompt().trim() : "";
        if (query.isBlank()) {
            return List.of();
        }
        List<AiKnowledgeEntry> entries = knowledgeStore.listScoped(request.connectionId(), request.database());
        List<String> titles = new ArrayList<>();
        List<String> contents = new ArrayList<>();
        List<String> docTexts = new ArrayList<>();
        for (AiKnowledgeEntry entry : entries) {
            String content = buildContent(entry);
            if (content.isBlank()) {
                continue;
            }
            String title = entry.getTerm() != null ? entry.getTerm() : "knowledge";
            titles.add(title);
            contents.add(content);
            docTexts.add(title + "\n" + content);
        }
        if (docTexts.isEmpty()) {
            return List.of();
        }
        List<String> batch = new ArrayList<>(docTexts.size() + 1);
        batch.add(query);
        batch.addAll(docTexts);
        List<float[]> vectors = embeddingService.embedAll(batch);
        if (vectors.size() != batch.size()) {
            throw new IllegalStateException("Embedding batch size mismatch");
        }
        float[] queryVector = vectors.get(0);
        List<ScoredSnippet> scored = new ArrayList<>();
        for (int i = 0; i < docTexts.size(); i++) {
            double score = AiEmbeddingCosineSupport.cosineSimilarity(queryVector, vectors.get(i + 1));
            if (score <= 0D) {
                continue;
            }
            scored.add(new ScoredSnippet(
                    AiEvidenceSnippet.vector(titles.get(i), contents.get(i), score),
                    score
            ));
        }
        return topSnippets(scored);
    }

    private List<AiEvidenceSnippet> retrieveByTokenOverlap(AiEvidenceRecallRequest request) {
        String query = request.prompt() != null ? request.prompt().trim() : "";
        if (query.isBlank()) {
            return List.of();
        }
        Set<String> queryTokens = tokenize(query);
        if (queryTokens.isEmpty()) {
            return List.of();
        }

        List<ScoredSnippet> scored = new ArrayList<>();
        for (AiKnowledgeEntry entry : knowledgeStore.listScoped(request.connectionId(), request.database())) {
            double score = scoreEntry(queryTokens, entry);
            if (score <= 0D) {
                continue;
            }
            String title = entry.getTerm() != null ? entry.getTerm() : "knowledge";
            String content = buildContent(entry);
            scored.add(new ScoredSnippet(
                    AiEvidenceSnippet.vector(title, content, score),
                    score
            ));
        }
        return topSnippets(scored);
    }

    private List<AiEvidenceSnippet> topSnippets(List<ScoredSnippet> scored) {
        scored.sort(Comparator.comparingDouble(ScoredSnippet::score).reversed());
        int limit = Math.max(1, ragProperties.getMaxGlossaryHits());
        return scored.stream()
                .limit(limit)
                .map(ScoredSnippet::snippet)
                .toList();
    }

    private static String buildContent(AiKnowledgeEntry entry) {
        StringBuilder builder = new StringBuilder();
        if (entry.getDefinition() != null && !entry.getDefinition().isBlank()) {
            builder.append(entry.getDefinition().trim());
        }
        if (entry.getRelatedTables() != null && !entry.getRelatedTables().isEmpty()) {
            if (!builder.isEmpty()) {
                builder.append('\n');
            }
            builder.append("Related tables: ").append(String.join(", ", entry.getRelatedTables()));
        }
        return builder.toString();
    }

    private static double scoreEntry(Set<String> queryTokens, AiKnowledgeEntry entry) {
        Set<String> docTokens = new LinkedHashSet<>();
        if (entry.getTerm() != null) {
            docTokens.addAll(tokenize(entry.getTerm()));
        }
        if (entry.getDefinition() != null) {
            docTokens.addAll(tokenize(entry.getDefinition()));
        }
        if (entry.getSynonyms() != null) {
            for (String synonym : entry.getSynonyms()) {
                docTokens.addAll(tokenize(synonym));
            }
        }
        if (docTokens.isEmpty()) {
            return 0D;
        }
        int overlap = 0;
        for (String token : queryTokens) {
            if (docTokens.contains(token)) {
                overlap++;
            }
        }
        if (overlap == 0) {
            return 0D;
        }
        return overlap / (double) Math.max(queryTokens.size(), docTokens.size());
    }

    private static Set<String> tokenize(String text) {
        Set<String> tokens = new LinkedHashSet<>();
        if (text == null || text.isBlank()) {
            return tokens;
        }
        for (String part : text.toLowerCase(Locale.ROOT).split("[\\s,;，。、/]+")) {
            String token = part.trim();
            if (token.length() >= 2) {
                tokens.add(token);
            }
        }
        return tokens;
    }

    private record ScoredSnippet(AiEvidenceSnippet snippet, double score) {
    }
}
