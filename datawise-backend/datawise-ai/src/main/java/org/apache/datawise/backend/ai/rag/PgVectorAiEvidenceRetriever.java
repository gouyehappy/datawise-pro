package org.apache.datawise.backend.ai.rag;

import org.apache.datawise.backend.ai.config.AiRagProperties;
import org.apache.datawise.backend.ai.domain.EffectiveAiRagConfig;
import org.apache.datawise.backend.ai.rag.embedding.AiEmbeddingService;
import org.apache.datawise.backend.configstore.AiKnowledgeStore;
import org.apache.datawise.backend.ai.domain.AiEvidenceSnippet;
import org.apache.datawise.backend.model.AiKnowledgeEntry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * pgvector 向量检索。
 * 需 PostgreSQL + pgvector 扩展，表结构见 {@link #ensureSchema(Connection)}。
 */
@Component
public class PgVectorAiEvidenceRetriever implements VectorAiEvidenceRetriever {

    private static final Logger log = LoggerFactory.getLogger(PgVectorAiEvidenceRetriever.class);

    private final AiRagConfigResolver ragConfigResolver;
    private final AiRagProperties ragProperties;
    private final AiEmbeddingService embeddingService;
    private final AiKnowledgeStore knowledgeStore;

    public PgVectorAiEvidenceRetriever(
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

    @Override
    public boolean isAvailable() {
        EffectiveAiRagConfig config = ragConfigResolver.resolveForCurrentUser();
        return config.isVectorStoreEnabled()
                && "pgvector".equalsIgnoreCase(config.vectorStore().trim())
                && config.pgvector().isConfigured();
    }

    @Override
    public List<AiEvidenceSnippet> retrieve(AiEvidenceRecallRequest request) {
        if (!isAvailable()) {
            return List.of();
        }
        syncKnowledgeIndex(request.connectionId(), request.database());
        float[] queryVector = embeddingService.embed(request.prompt());
        String vectorLiteral = toVectorLiteral(queryVector);
        AiRagProperties.PgVector pg = ragConfigResolver.resolveForCurrentUser().toLegacyPgVector();
        String sql = """
                SELECT title, content, 1 - (embedding <=> ?::vector) AS score
                FROM %s
                WHERE connection_id = ? AND database_name = ?
                ORDER BY embedding <=> ?::vector
                LIMIT ?
                """.formatted(pg.getTable());
        List<AiEvidenceSnippet> snippets = new ArrayList<>();
        try (Connection connection = openConnection(pg);
             PreparedStatement ps = connection.prepareStatement(sql)) {
            ps.setString(1, vectorLiteral);
            ps.setString(2, request.connectionId());
            ps.setString(3, request.database());
            ps.setString(4, vectorLiteral);
            ps.setInt(5, Math.max(1, ragProperties.getMaxGlossaryHits()));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    snippets.add(AiEvidenceSnippet.vector(
                            rs.getString("title"),
                            rs.getString("content"),
                            rs.getDouble("score")
                    ));
                }
            }
        } catch (Exception ex) {
            log.warn("pgvector retrieval failed: {}", ex.getMessage());
            return List.of();
        }
        return snippets;
    }

    private void syncKnowledgeIndex(String connectionId, String database) {
        for (AiKnowledgeEntry entry : knowledgeStore.listScoped(connectionId, database)) {
            upsertEntry(connectionId, database, entry);
        }
    }

    private void upsertEntry(String connectionId, String database, AiKnowledgeEntry entry) {
        if (entry.getTerm() == null || entry.getDefinition() == null) {
            return;
        }
        AiRagProperties.PgVector pg = ragConfigResolver.resolveForCurrentUser().toLegacyPgVector();
        String id = entry.getId() != null ? entry.getId() : entry.getTerm();
        String content = entry.getDefinition();
        float[] vector = embeddingService.embed(entry.getTerm() + "\n" + content);
        String sql = """
                INSERT INTO %s (id, connection_id, database_name, title, content, embedding)
                VALUES (?, ?, ?, ?, ?, ?::vector)
                ON CONFLICT (id) DO UPDATE SET
                  title = EXCLUDED.title,
                  content = EXCLUDED.content,
                  embedding = EXCLUDED.embedding
                """.formatted(pg.getTable());
        try (Connection connection = openConnection(pg)) {
            ensureSchema(connection, embeddingService.dimensions());
            try (PreparedStatement ps = connection.prepareStatement(sql)) {
                ps.setString(1, id);
                ps.setString(2, connectionId);
                ps.setString(3, database);
                ps.setString(4, entry.getTerm());
                ps.setString(5, content);
                ps.setString(6, toVectorLiteral(vector));
                ps.executeUpdate();
            }
        } catch (Exception ex) {
            log.debug("Skip pgvector upsert for {}: {}", id, ex.getMessage());
        }
    }

    static void ensureSchema(Connection connection, int dimensions) throws Exception {
        try (PreparedStatement ps = connection.prepareStatement("CREATE EXTENSION IF NOT EXISTS vector")) {
            ps.execute();
        }
        try (PreparedStatement ps = connection.prepareStatement("""
                CREATE TABLE IF NOT EXISTS ai_evidence_embeddings (
                  id TEXT PRIMARY KEY,
                  connection_id TEXT NOT NULL,
                  database_name TEXT NOT NULL,
                  title TEXT,
                  content TEXT,
                  embedding vector(%d)
                )
                """.formatted(Math.max(1, dimensions)))) {
            ps.execute();
        }
    }

    private static Connection openConnection(AiRagProperties.PgVector pg) throws Exception {
        return DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
    }

    static String toVectorLiteral(float[] vector) {
        StringBuilder builder = new StringBuilder("[");
        for (int i = 0; i < vector.length; i++) {
            if (i > 0) {
                builder.append(',');
            }
            builder.append(String.format(Locale.ROOT, "%.6f", vector[i]));
        }
        builder.append(']');
        return builder.toString();
    }
}
