package org.apache.datawise.backend.ai.schema;

/**
 * AI schema 上下文体量上限，避免 prompt 膨胀。
 */
public final class AiSchemaLimits {

    public static final int MAX_TABLES = 6;
    public static final int MAX_DDL_CHARS = 4000;
    public static final int MAX_RELATIONS = 24;

    private AiSchemaLimits() {
    }
}
