package org.apache.datawise.backend.ai.domain;

/**
 * RAG 检索到的一条 evidence（注入 SQL 生成 prompt）
 */
public record AiEvidenceSnippet(
        String source,
        String title,
        String content,
        double score
) {
    public static final String SOURCE_GLOSSARY = "glossary";
    public static final String SOURCE_SCHEMA_COMMENT = "schema_comment";
    public static final String SOURCE_VECTOR = "vector";

    public static AiEvidenceSnippet glossary(String term, String definition, double score) {
        return new AiEvidenceSnippet(SOURCE_GLOSSARY, term, definition, score);
    }

    public static AiEvidenceSnippet schemaComment(String table, String content, double score) {
        return new AiEvidenceSnippet(SOURCE_SCHEMA_COMMENT, table, content, score);
    }

    public static AiEvidenceSnippet vector(String title, String content, double score) {
        return new AiEvidenceSnippet(SOURCE_VECTOR, title, content, score);
    }
}
