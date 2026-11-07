package org.apache.datawise.backend.ai.rag;

import org.apache.datawise.backend.ai.config.AiRagProperties;
import org.apache.datawise.backend.ai.domain.EffectiveAiRagConfig;
import org.apache.datawise.backend.ai.rag.embedding.AiEmbeddingService;
import org.apache.datawise.backend.configstore.AiKnowledgeStore;
import org.apache.datawise.backend.model.AiKnowledgeEntry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.util.List;
import java.util.Locale;

/** 将业务词条同步到 pgvector 索引。 */
@Service
public class AiKnowledgeIndexService {

    private static final Logger log = LoggerFactory.getLogger(AiKnowledgeIndexService.class);

    private final AiRagConfigResolver ragConfigResolver;
    private final AiRagProperties ragProperties;
    private final AiEmbeddingService embeddingService;
    private final AiKnowledgeStore knowledgeStore;

    public AiKnowledgeIndexService(
            AiRagConfigResolver ragConfigResolver,
            AiRagProperties ragProperties,
            AiEmbeddingService embeddingService,
            AiKnowledgeStore knowledgeStore
    ) {
        this.ragConfigResolver = ragConfigResolver;
        this.ragProperties = ragProperties;
        this.embeddingService = embeddingService;
        this.knowledgeStore = knowledgeStore;
    }

    public boolean isPgVectorConfigured() {
        EffectiveAiRagConfig config = ragConfigResolver.resolveForCurrentUser();
        return config.isVectorStoreEnabled()
                && "pgvector".equalsIgnoreCase(config.vectorStore().trim())
                && config.pgvector().isConfigured();
    }

    public int rebuildIndex(String connectionId, String database) {
        if (!isPgVectorConfigured()) {
            return 0;
        }
        List<AiKnowledgeEntry> entries = knowledgeStore.listScoped(connectionId, database);
        int synced = 0;
        for (AiKnowledgeEntry entry : entries) {
            if (upsertEntry(connectionId, database, entry)) {
                synced++;
            }
        }
        return synced;
    }

    public int countKnowledgeEntries(String connectionId, String database) {
        return knowledgeStore.listScoped(connectionId, database).size();
    }

    private boolean upsertEntry(String connectionId, String database, AiKnowledgeEntry entry) {
        if (entry.getTerm() == null || entry.getDefinition() == null) {
            return false;
        }
        AiRagProperties.PgVector pg = ragConfigResolver.resolveForCurrentUser().toLegacyPgVector();
        String id = entry.getId() != null ? entry.getId() : entry.getTerm();
        float[] vector = embeddingService.embed(entry.getTerm() + "\n" + entry.getDefinition());
        String sql = """
                INSERT INTO %s (id, connection_id, database_name, title, content, embedding)
                VALUES (?, ?, ?, ?, ?, ?::vector)
                ON CONFLICT (id) DO UPDATE SET
                  title = EXCLUDED.title,
                  content = EXCLUDED.content,
                  embedding = EXCLUDED.embedding
                """.formatted(pg.getTable());
        try (Connection connection = openConnection(pg)) {
            PgVectorAiEvidenceRetriever.ensureSchema(connection, embeddingService.dimensions());
            try (PreparedStatement ps = connection.prepareStatement(sql)) {
                ps.setString(1, id);
                ps.setString(2, connectionId);
                ps.setString(3, database);
                ps.setString(4, entry.getTerm());
                ps.setString(5, entry.getDefinition());
                ps.setString(6, PgVectorAiEvidenceRetriever.toVectorLiteral(vector));
                ps.executeUpdate();
            }
            return true;
        } catch (Exception ex) {
            log.warn("Failed to upsert knowledge index entry {}: {}", id, ex.getMessage());
            return false;
        }
    }

    private static Connection openConnection(AiRagProperties.PgVector pg) throws Exception {
        return DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
    }
}
