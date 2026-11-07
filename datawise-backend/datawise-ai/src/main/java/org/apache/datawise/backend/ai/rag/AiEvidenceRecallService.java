package org.apache.datawise.backend.ai.rag;

import org.apache.datawise.backend.ai.config.AiRagProperties;
import org.apache.datawise.backend.configstore.AiKnowledgeStore;
import org.apache.datawise.backend.ai.domain.AiEvidenceBundle;
import org.apache.datawise.backend.ai.domain.AiEvidenceSnippet;
import org.apache.datawise.backend.model.AiKnowledgeEntry;
import org.apache.datawise.backend.ai.support.AiTableMatcher;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 混合 evidence 召回：词条 + schema 注释 +（预留）向量库
 */
@Service
public class AiEvidenceRecallService {

    private final AiRagProperties ragProperties;
    private final AiQueryRewriter queryRewriter;
    private final GlossaryAiEvidenceRetriever glossaryRetriever;
    private final SchemaCommentEvidenceProvider schemaCommentProvider;
    private final VectorAiEvidenceRetriever vectorRetriever;
    private final AiKnowledgeStore knowledgeStore;

    public AiEvidenceRecallService(
            AiRagProperties ragProperties,
            AiQueryRewriter queryRewriter,
            GlossaryAiEvidenceRetriever glossaryRetriever,
            SchemaCommentEvidenceProvider schemaCommentProvider,
            VectorAiEvidenceRetriever vectorRetriever,
            AiKnowledgeStore knowledgeStore
    ) {
        this.ragProperties = ragProperties;
        this.queryRewriter = queryRewriter;
        this.glossaryRetriever = glossaryRetriever;
        this.schemaCommentProvider = schemaCommentProvider;
        this.vectorRetriever = vectorRetriever;
        this.knowledgeStore = knowledgeStore;
    }

    public AiEvidenceBundle recall(AiEvidenceRecallRequest request) {
        if (!ragProperties.isEnabled()) {
            return AiEvidenceBundle.empty(queryRewriter.rewrite(request.prompt()));
        }

        String rewritten = queryRewriter.rewrite(request.prompt());
        AiEvidenceBundle.Builder builder = AiEvidenceBundle.builder(rewritten).mode("keyword");

        List<AiEvidenceSnippet> glossaryHits = glossaryRetriever.retrieve(request);
        builder.addSnippets(glossaryHits);
        Set<String> tableHints = collectTableHints(request, glossaryHits);
        for (String table : tableHints) {
            builder.hintTable(table);
        }

        List<String> commentTables = new ArrayList<>(tableHints);
        if (request.candidateTables() != null) {
            commentTables.addAll(schemaCommentProvider.tablesMentionedInPrompt(
                    request.prompt(),
                    request.candidateTables()
            ));
        }
        builder.addSnippets(schemaCommentProvider.load(
                request.connectionId(),
                request.database(),
                commentTables.stream().distinct().toList()
        ));

        if (vectorRetriever.isAvailable()) {
            builder.mode("vector");
            builder.addSnippets(vectorRetriever.retrieve(request));
        }

        return trimSnippets(builder);
    }

    private Set<String> collectTableHints(AiEvidenceRecallRequest request, List<AiEvidenceSnippet> glossaryHits) {
        Set<String> hinted = new LinkedHashSet<>();
        knowledgeStore.streamScoped(request.connectionId(), request.database()).forEach(entry -> {
            if (matchesGlossaryHit(entry, glossaryHits) && entry.getRelatedTables() != null) {
                hinted.addAll(entry.getRelatedTables());
            }
        });
        if (request.candidateTables() != null && !request.candidateTables().isEmpty()) {
            hinted.addAll(AiTableMatcher.pickTables(request.prompt(), request.candidateTables(), 4));
        }
        return hinted;
    }

    private static boolean matchesGlossaryHit(AiKnowledgeEntry entry, List<AiEvidenceSnippet> hits) {
        if (entry.getTerm() == null || hits.isEmpty()) {
            return false;
        }
        return hits.stream().anyMatch(hit ->
                hit.source().equals(AiEvidenceSnippet.SOURCE_GLOSSARY)
                        && entry.getTerm().equals(hit.title()));
    }

    private AiEvidenceBundle trimSnippets(AiEvidenceBundle.Builder builder) {
        AiEvidenceBundle bundle = builder.build();
        int max = Math.max(1, ragProperties.getMaxSnippets());
        if (bundle.snippets().size() <= max) {
            return bundle;
        }
        return new AiEvidenceBundle(
                bundle.rewrittenQuery(),
                bundle.snippets().subList(0, max),
                bundle.hintedTables(),
                bundle.retrievalModes()
        );
    }
}
