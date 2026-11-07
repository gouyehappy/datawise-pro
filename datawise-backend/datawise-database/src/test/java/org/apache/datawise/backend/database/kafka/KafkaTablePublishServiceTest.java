package org.apache.datawise.backend.database.kafka;

import org.apache.datawise.backend.connector.ConnectorCapability;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.connector.facade.catalog.ConnectorCatalogAccess;
import org.apache.datawise.backend.connector.facade.messagebroker.ConnectorMessageBrokerAccess;
import org.apache.datawise.backend.connector.facade.ops.ConnectorOpsAccess;
import org.apache.datawise.backend.connector.operation.MessageBrokerProducer;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.database.table.TableDataService;
import org.apache.datawise.backend.domain.KafkaProduceResultDto;
import org.apache.datawise.backend.domain.PublishTableToKafkaRequest;
import org.apache.datawise.backend.domain.PublishTableToKafkaResult;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.ops.DatabaseOpsRegistry;
import org.apache.datawise.backend.service.ConnectionAccessService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.EnumSet;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class KafkaTablePublishServiceTest {

    @Mock
    private ConnectionExecutionContext connectionContext;
    @Mock
    private ConnectionAccessService connectionAccessService;
    @Mock
    private ConnectorFacade connectorFacade;
    @Mock
    private ConnectorCatalogAccess catalogAccess;
    @Mock
    private ConnectorOpsAccess opsAccess;
    @Mock
    private DatabaseOpsRegistry opsRegistry;
    @Mock
    private DataSourceConnector connector;
    @Mock
    private ConnectorMessageBrokerAccess messageBrokerAccess;
    @Mock
    private TableDataService tableDataService;
    @Mock
    private MessageBrokerProducer producer;

    private KafkaTablePublishService service;

    @BeforeEach
    void setUp() {
        service = new KafkaTablePublishService(
                connectionContext,
                connectionAccessService,
                connectorFacade,
                tableDataService,
                null
        );
        when(connectorFacade.messageBroker()).thenReturn(messageBrokerAccess);
        when(connectorFacade.catalog()).thenReturn(catalogAccess);
        when(connectorFacade.ops()).thenReturn(opsAccess);
        when(opsAccess.registry()).thenReturn(opsRegistry);
        lenient().when(opsRegistry.supportsActiveSession(any())).thenReturn(false);
        lenient().when(opsRegistry.supportsSessionKill(any())).thenReturn(false);
        lenient().when(opsRegistry.supportsLockWait(any())).thenReturn(false);
        when(catalogAccess.resolve(any(ConnectionEntity.class))).thenReturn(connector);
        when(connector.capabilities()).thenReturn(EnumSet.of(
                ConnectorCapability.CONNECTION_TEST,
                ConnectorCapability.CATALOG,
                ConnectorCapability.SQL_EXECUTE
        ));
    }

    @Test
    void publish_readsOneRowAtATimeAndHonorsIntervalAndLimit() {
        ConnectionEntity kafka = kafkaConnection("kafka-1");
        ConnectionEntity mysql = jdbcConnection("mysql-1");

        when(connectionContext.requireUserId()).thenReturn(7L);
        when(connectionContext.requireAvailableConnectionForCurrentUser(
                eq("kafka-1"),
                eq(ConnectionExecutionContext.EXPLORER_CONNECTION_NOT_FOUND)
        )).thenReturn(new ConnectionExecutionContext.ResolvedConnection(7L, kafka));
        when(connectionContext.requireAvailableConnectionForCurrentUser(
                eq("mysql-1"),
                eq("Connection not found: mysql-1")
        )).thenReturn(new ConnectionExecutionContext.ResolvedConnection(7L, mysql));

        when(tableDataService.fetch(eq("orders"), eq("mysql-1"), eq("shop"), eq(1), eq(null)))
                .thenReturn(new TableDataResult(
                        List.of(Map.of("key", "c1", "name", "id")),
                        List.of(Map.of("c1", 1)),
                        "cursor-1",
                        true,
                        0,
                        1
                ));
        when(tableDataService.fetch(eq("orders"), eq("mysql-1"), eq("shop"), eq(1), eq("cursor-1")))
                .thenReturn(new TableDataResult(
                        List.of(Map.of("key", "c1", "name", "id")),
                        List.of(Map.of("c1", 2)),
                        null,
                        false,
                        1,
                        1
                ));

        when(messageBrokerAccess.withProducer(eq(kafka), any())).thenAnswer(invocation -> {
            var callback = invocation.getArgument(1, org.apache.datawise.backend.connector.operation.ConnectorMessageBrokerOperations.MessageBrokerProducerCallback.class);
            return callback.apply(producer);
        });
        when(producer.send(eq("events"), eq("1"), any(), eq(null)))
                .thenReturn(new KafkaProduceResultDto("events", 0, 10L));
        when(producer.send(eq("events"), eq("2"), any(), eq(null)))
                .thenReturn(new KafkaProduceResultDto("events", 0, 11L));

        PublishTableToKafkaResult result = service.publish(
                "kafka-1",
                new PublishTableToKafkaRequest(
                        "mysql-1",
                        "shop",
                        "orders",
                        "events",
                        "id",
                        2,
                        0L,
                        null
                )
        );

        assertEquals(2, result.messagesSent());
        assertEquals(0, result.messagesFailed());
        assertEquals(PublishTableToKafkaResult.STOP_LIMIT_REACHED, result.stopReason());

        ArgumentCaptor<String> payloadCaptor = ArgumentCaptor.forClass(String.class);
        verify(producer).send(eq("events"), eq("1"), payloadCaptor.capture(), eq(null));
        assertTrue(payloadCaptor.getValue().contains("\"id\":1"));
        verify(connectionAccessService).requireDmlAccess(7L, "kafka-1");
    }

    @Test
    void publish_fakeDataUsesSupplierAndHonorsLimit() {
        KafkaFakeRowSupplier fakeRowSupplier = org.mockito.Mockito.mock(KafkaFakeRowSupplier.class);
        service = new KafkaTablePublishService(
                connectionContext,
                connectionAccessService,
                connectorFacade,
                tableDataService,
                fakeRowSupplier
        );

        ConnectionEntity kafka = kafkaConnection("kafka-1");
        ConnectionEntity mysql = jdbcConnection("mysql-1");

        when(connectionContext.requireUserId()).thenReturn(7L);
        when(connectionContext.requireAvailableConnectionForCurrentUser(
                eq("kafka-1"),
                eq(ConnectionExecutionContext.EXPLORER_CONNECTION_NOT_FOUND)
        )).thenReturn(new ConnectionExecutionContext.ResolvedConnection(7L, kafka));
        when(connectionContext.requireAvailableConnectionForCurrentUser(
                eq("mysql-1"),
                eq("Connection not found: mysql-1")
        )).thenReturn(new ConnectionExecutionContext.ResolvedConnection(7L, mysql));

        when(fakeRowSupplier.generateRows(eq("mysql-1"), eq("shop"), eq("orders"), eq(3), eq(99L), eq(5)))
                .thenReturn(List.of(
                        Map.of("id", 1, "name", "a"),
                        Map.of("id", 2, "name", "b"),
                        Map.of("id", 3, "name", "c")
                ));

        when(messageBrokerAccess.withProducer(eq(kafka), any())).thenAnswer(invocation -> {
            var callback = invocation.getArgument(1, org.apache.datawise.backend.connector.operation.ConnectorMessageBrokerOperations.MessageBrokerProducerCallback.class);
            return callback.apply(producer);
        });
        when(producer.send(eq("events"), any(), any(), eq(null)))
                .thenReturn(new KafkaProduceResultDto("events", 0, 10L));

        PublishTableToKafkaResult result = service.publish(
                "kafka-1",
                new PublishTableToKafkaRequest(
                        "mysql-1",
                        "shop",
                        "orders",
                        "events",
                        "id",
                        3,
                        0L,
                        null,
                        true,
                        99L,
                        5
                )
        );

        assertEquals(3, result.messagesSent());
        assertEquals(0, result.messagesFailed());
        assertEquals(PublishTableToKafkaResult.STOP_LIMIT_REACHED, result.stopReason());
        verify(fakeRowSupplier).generateRows("mysql-1", "shop", "orders", 3, 99L, 5);
        verify(tableDataService, org.mockito.Mockito.never()).fetch(any(), any(), any(), any(), any());
    }

    private static ConnectionEntity kafkaConnection(String id) {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setId(id);
        entity.setDbType("kafka");
        entity.setHost("localhost");
        entity.setPort("9092");
        return entity;
    }

    private static ConnectionEntity jdbcConnection(String id) {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setId(id);
        entity.setDbType("mysql");
        entity.setHost("localhost");
        entity.setPort("3306");
        return entity;
    }
}
