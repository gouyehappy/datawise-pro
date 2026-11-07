package org.apache.datawise.backend.domain;

/**
 * Outcome of a table → Kafka publish run.
 */
public record PublishTableToKafkaResult(
        int messagesSent,
        int messagesFailed,
        long durationMs,
        String stopReason,
        String lastError,
        KafkaProduceResultDto lastProduce) {

    public static final String STOP_LIMIT_REACHED = "LIMIT_REACHED";
    public static final String STOP_TABLE_EXHAUSTED = "TABLE_EXHAUSTED";
    public static final String STOP_PRODUCE_ERROR = "PRODUCE_ERROR";
    public static final String STOP_INTERRUPTED = "INTERRUPTED";
}
