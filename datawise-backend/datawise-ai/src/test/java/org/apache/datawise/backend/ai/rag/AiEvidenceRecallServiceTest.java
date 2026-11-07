package org.apache.datawise.backend.ai.rag;

import org.apache.datawise.backend.ai.config.AiRagProperties;
import org.apache.datawise.backend.configstore.AiKnowledgeStore;
import org.apache.datawise.backend.ai.domain.AiEvidenceBundle;
import org.apache.datawise.backend.ai.domain.AiEvidenceSnippet;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiEvidenceRecallServiceTest {

    private static final String PROMPT = "analyze sales amount";

    @Mock
    private GlossaryAiEvidenceRetriever glossaryRetriever;
    @Mock
    private SchemaCommentEvidenceProvider schemaCommentProvider;
    @Mock
    private VectorAiEvidenceRetriever vectorRetriever;
    @Mock
    private AiKnowledgeStore knowledgeStore;

    private AiRagProperties ragProperties;
    private AiQueryRewriter queryRewriter;
    private AiEvidenceRecallService service;

    @BeforeEach
    void setUp() {
        ragProperties = new AiRagProperties();
        ragProperties.setEnabled(true);
        queryRewriter = new AiQueryRewriter();
        service = new AiEvidenceRecallService(
                ragProperties,
                queryRewriter,
                glossaryRetriever,
                schemaCommentProvider,
                vectorRetriever,
                knowledgeStore
        );
    }

    @Test
    void returnsEmptyBundleWhenRagDisabled() {
        ragProperties.setEnabled(false);

        AiEvidenceBundle bundle = service.recall(new AiEvidenceRecallRequest(
                "conn-1",
                "shop",
                PROMPT,
                List.of("orders")
        ));

        assertEquals(PROMPT, bundle.rewrittenQuery());
        assertTrue(bundle.snippets().isEmpty());
        verify(glossaryRetriever, never()).retrieve(any());
    }

    @Test
    void mergesGlossarySchemaAndVectorSnippets() {
        when(glossaryRetriever.retrieve(any())).thenReturn(List.of(
                AiEvidenceSnippet.glossary("sales", "order amount sum", 90)
        ));
        when(knowledgeStore.streamScoped("conn-1", "shop")).thenReturn(Stream.empty());
        when(schemaCommentProvider.tablesMentionedInPrompt(PROMPT, List.of("orders")))
                .thenReturn(List.of("orders"));
        when(schemaCommentProvider.load("conn-1", "shop", List.of("orders"))).thenReturn(List.of(
                AiEvidenceSnippet.schemaComment("orders", "table comment: orders", 50)
        ));
        when(vectorRetriever.isAvailable()).thenReturn(true);
        when(vectorRetriever.retrieve(any())).thenReturn(List.of(
                AiEvidenceSnippet.vector("doc-1", "historical analysis template", 0.8)
        ));

        AiEvidenceBundle bundle = service.recall(new AiEvidenceRecallRequest(
                "conn-1",
                "shop",
                PROMPT,
                List.of("orders")
        ));

        assertEquals(3, bundle.snippets().size());
        assertTrue(bundle.retrievalModes().contains("vector"));
    }
}
