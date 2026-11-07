package org.apache.datawise.backend.database.kafka;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.connector.operation.ConnectorMessageBrokerOperations.MessageBrokerProducerCallback;
import org.apache.datawise.backend.connector.operation.MessageBrokerProducer;
import org.apache.datawise.backend.connector.support.ConnectorCapabilityGuard;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.database.table.TableDataService;
import org.apache.datawise.backend.domain.KafkaProduceResultDto;
import org.apache.datawise.backend.domain.PublishTableToKafkaRequest;
import org.apache.datawise.backend.domain.PublishTableToKafkaResult;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.service.ConnectionAccessService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * Reads table rows one at a time and publishes each row as a JSON Kafka message.
 */
@Service
public class KafkaTablePublishService {

    static final int DEFAULT_MAX_MESSAGES = 100;
    static final int MAX_MESSAGES_CAP = 10_000;
    static final long MAX_INTERVAL_MS = 300_000L;

    private final ConnectionExecutionContext connectionContext;
    private final ConnectionAccessService connectionAccessService;
    private final ConnectorFacade connectorFacade;
    private final TableDataService tableDataService;
    private final KafkaFakeRowSupplier fakeRowSupplier;

    public KafkaTablePublishService(
            ConnectionExecutionContext connectionContext,
            ConnectionAccessService connectionAccessService,
            ConnectorFacade connectorFacade,
            TableDataService tableDataService,
            @Autowired(required = false) KafkaFakeRowSupplier fakeRowSupplier
    ) {
        this.connectionContext = connectionContext;
        this.connectionAccessService = connectionAccessService;
        this.connectorFacade = connectorFacade;
        this.tableDataService = tableDataService;
        this.fakeRowSupplier = fakeRowSupplier;
    }

    public PublishTableToKafkaResult publish(String kafkaConnectionId, PublishTableToKafkaRequest request) {
        validateRequest(kafkaConnectionId, request);

        long userId = connectionContext.requireUserId();
        ConnectionEntity kafkaConnection = requireKafkaConnection(kafkaConnectionId);
        connectionAccessService.requireDmlAccess(userId, kafkaConnectionId);

        ConnectionEntity sourceConnection = connectionContext.requireAvailableConnectionForCurrentUser(
                request.sourceConnectionId(),
                "Connection not found: " + request.sourceConnectionId()
        ).entity();
        requireReadableTableSource(sourceConnection);

        int maxMessages = resolveMaxMessages(request.maxMessages());
        long intervalMs = resolveIntervalMs(request.intervalMs());
        String topic = request.topic().trim();

        return connectorFacade.messageBroker().withProducer(kafkaConnection, producer ->
                isFakeData(request)
                        ? publishFakeRows(producer, request, topic, maxMessages, intervalMs)
                        : publishRows(producer, request, topic, maxMessages, intervalMs)
        );
    }

    private PublishTableToKafkaResult publishFakeRows(
            MessageBrokerProducer producer,
            PublishTableToKafkaRequest request,
            String topic,
            int maxMessages,
            long intervalMs
    ) {
        if (fakeRowSupplier == null) {
            throw new IllegalStateException("Fake data generation is not available");
        }

        long startedAt = System.currentTimeMillis();
        long seed = request.datagenSeed() != null ? request.datagenSeed() : System.currentTimeMillis();
        int rowOffset = request.datagenRowOffset() != null ? Math.max(0, request.datagenRowOffset()) : 0;

        List<Map<String, Object>> rows = fakeRowSupplier.generateRows(
                request.sourceConnectionId(),
                request.sourceDatabase(),
                request.tableName().trim(),
                maxMessages,
                seed,
                rowOffset
        );

        int sent = 0;
        int failed = 0;
        String lastError = null;
        KafkaProduceResultDto lastProduce = null;
        String stopReason = PublishTableToKafkaResult.STOP_LIMIT_REACHED;

        if (rows == null || rows.isEmpty()) {
            return new PublishTableToKafkaResult(
                    0,
                    0,
                    System.currentTimeMillis() - startedAt,
                    PublishTableToKafkaResult.STOP_TABLE_EXHAUSTED,
                    null,
                    null
            );
        }

        for (Map<String, Object> row : rows) {
            String json = KafkaTableRowJsonSupport.toJson(row, List.of());
            String key = KafkaTableRowJsonSupport.resolveKey(row, request.keyColumn(), List.of());

            try {
                lastProduce = producer.send(topic, key, json, request.partition());
                sent++;
            } catch (RuntimeException ex) {
                failed++;
                lastError = ex.getMessage();
                stopReason = PublishTableToKafkaResult.STOP_PRODUCE_ERROR;
                break;
            }

            if (intervalMs > 0 && sent + failed < rows.size()) {
                try {
                    Thread.sleep(intervalMs);
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                    stopReason = PublishTableToKafkaResult.STOP_INTERRUPTED;
                    break;
                }
            }
        }

        return new PublishTableToKafkaResult(
                sent,
                failed,
                System.currentTimeMillis() - startedAt,
                stopReason,
                lastError,
                lastProduce
        );
    }

    private PublishTableToKafkaResult publishRows(
            MessageBrokerProducer producer,
            PublishTableToKafkaRequest request,
            String topic,
            int maxMessages,
            long intervalMs
    ) {
        long startedAt = System.currentTimeMillis();
        int sent = 0;
        int failed = 0;
        String lastError = null;
        KafkaProduceResultDto lastProduce = null;
        String stopReason = PublishTableToKafkaResult.STOP_TABLE_EXHAUSTED;

        String cursorId = null;
        while (sent + failed < maxMessages) {
            TableDataResult page = tableDataService.fetch(
                    request.tableName().trim(),
                    request.sourceConnectionId(),
                    request.sourceDatabase(),
                    1,
                    cursorId
            );
            List<Map<String, Object>> rows = page.rows();
            if (rows == null || rows.isEmpty()) {
                stopReason = PublishTableToKafkaResult.STOP_TABLE_EXHAUSTED;
                break;
            }

            Map<String, Object> row = rows.get(0);
            List<Map<String, Object>> columns = page.columns();
            String json = KafkaTableRowJsonSupport.toJson(row, columns);
            String key = KafkaTableRowJsonSupport.resolveKey(row, request.keyColumn(), columns);

            try {
                lastProduce = producer.send(topic, key, json, request.partition());
                sent++;
            } catch (RuntimeException ex) {
                failed++;
                lastError = ex.getMessage();
                stopReason = PublishTableToKafkaResult.STOP_PRODUCE_ERROR;
                break;
            }

            if (sent >= maxMessages) {
                stopReason = PublishTableToKafkaResult.STOP_LIMIT_REACHED;
                break;
            }

            cursorId = page.cursorId();
            if (!hasMoreRows(page)) {
                stopReason = PublishTableToKafkaResult.STOP_TABLE_EXHAUSTED;
                break;
            }

            if (intervalMs > 0) {
                try {
                    Thread.sleep(intervalMs);
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                    stopReason = PublishTableToKafkaResult.STOP_INTERRUPTED;
                    break;
                }
            }
        }

        return new PublishTableToKafkaResult(
                sent,
                failed,
                System.currentTimeMillis() - startedAt,
                stopReason,
                lastError,
                lastProduce
        );
    }

    private void validateRequest(String kafkaConnectionId, PublishTableToKafkaRequest request) {
        if (kafkaConnectionId == null || kafkaConnectionId.isBlank()) {
            throw new IllegalArgumentException("kafkaConnectionId is required");
        }
        if (request == null) {
            throw new IllegalArgumentException("request is required");
        }
        if (request.sourceConnectionId() == null || request.sourceConnectionId().isBlank()) {
            throw new IllegalArgumentException("sourceConnectionId is required");
        }
        if (request.tableName() == null || request.tableName().isBlank()) {
            throw new IllegalArgumentException("tableName is required");
        }
        if (request.topic() == null || request.topic().isBlank()) {
            throw new IllegalArgumentException("topic is required");
        }
        if (request.sourceConnectionId().equals(kafkaConnectionId)) {
            throw new IllegalArgumentException("sourceConnectionId must differ from kafka connection");
        }
        if (isFakeData(request) && fakeRowSupplier == null) {
            throw new IllegalArgumentException("Fake data generation is not available");
        }
    }

    private static boolean isFakeData(PublishTableToKafkaRequest request) {
        return Boolean.TRUE.equals(request.fakeData());
    }

    private ConnectionEntity requireKafkaConnection(String kafkaConnectionId) {
        ConnectionEntity entity = connectionContext.requireAvailableConnectionForCurrentUser(
                kafkaConnectionId,
                ConnectionExecutionContext.EXPLORER_CONNECTION_NOT_FOUND
        ).entity();
        if (!"kafka".equalsIgnoreCase(DbType.normalizeId(entity.getDbType()))) {
            throw new IllegalArgumentException("Kafka connection is required");
        }
        return entity;
    }

    private void requireReadableTableSource(ConnectionEntity sourceConnection) {
        String dbType = DbType.normalizeId(sourceConnection.getDbType());
        if ("kafka".equalsIgnoreCase(dbType)) {
            throw new IllegalArgumentException("source connection cannot be Kafka");
        }
        ConnectorCapabilityGuard.requireTableData(connectorFacade, sourceConnection);
    }

    private static int resolveMaxMessages(Integer maxMessages) {
        if (maxMessages == null || maxMessages <= 0) {
            return DEFAULT_MAX_MESSAGES;
        }
        return Math.min(maxMessages, MAX_MESSAGES_CAP);
    }

    private static long resolveIntervalMs(Long intervalMs) {
        if (intervalMs == null || intervalMs < 0) {
            return 0L;
        }
        return Math.min(intervalMs, MAX_INTERVAL_MS);
    }

    private static boolean hasMoreRows(TableDataResult page) {
        if (Boolean.TRUE.equals(page.hasMore())) {
            return true;
        }
        return page.cursorId() != null && !page.cursorId().isBlank();
    }
}
