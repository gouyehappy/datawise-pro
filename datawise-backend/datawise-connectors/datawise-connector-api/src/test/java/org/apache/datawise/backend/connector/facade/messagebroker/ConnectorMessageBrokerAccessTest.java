package org.apache.datawise.backend.connector.facade.messagebroker;

import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.facade.catalog.ConnectorCatalogAccess;
import org.apache.datawise.backend.connector.operation.ConnectorMessageBrokerOperations;
import org.apache.datawise.backend.connector.operation.MessageBrokerProducer;
import org.apache.datawise.backend.domain.KafkaProduceResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ConnectorMessageBrokerAccessTest {

    @Mock
    private ConnectorCatalogAccess catalog;

    private ConnectorMessageBrokerAccess access;
    private ConnectionEntity connection;

    @BeforeEach
    void setUp() {
        access = new ConnectorMessageBrokerAccess(catalog);
        connection = new ConnectionEntity();
        connection.setId("kafka-1");
        connection.setDbType("kafka");
        connection.setHost("192.0.2.56");
        connection.setPort("9092");
    }

    @Test
    void withProducer_fallsBackToProduceMessageWhenSessionUnsupported() {
        ConnectorMessageBrokerOperations broker = mock(ConnectorMessageBrokerOperations.class);
        DataSourceConnector connector = mock(DataSourceConnector.class);
        when(catalog.resolve(connection)).thenReturn(connector);
        when(connector.messageBroker()).thenReturn(broker);
        when(broker.withProducer(eq(connection), any())).thenThrow(
                new UnsupportedOperationException("Producer session is not supported for this connection type"));
        when(broker.produceMessage(connection, "events", "1", "{\"id\":1}", null))
                .thenReturn(new KafkaProduceResultDto("events", 0, 10L));

        String result = access.withProducer(connection, producer -> {
            producer.send("events", "1", "{\"id\":1}", null);
            return "ok";
        });

        assertEquals("ok", result);
        verify(broker).produceMessage(connection, "events", "1", "{\"id\":1}", null);
    }

    @Test
    void withProducer_usesNativeSessionWhenSupported() {
        ConnectorMessageBrokerOperations broker = mock(ConnectorMessageBrokerOperations.class);
        DataSourceConnector connector = mock(DataSourceConnector.class);
        MessageBrokerProducer producer = mock(MessageBrokerProducer.class);
        when(catalog.resolve(connection)).thenReturn(connector);
        when(connector.messageBroker()).thenReturn(broker);
        when(broker.withProducer(eq(connection), any())).thenAnswer(invocation -> {
            var callback = invocation.getArgument(1, ConnectorMessageBrokerOperations.MessageBrokerProducerCallback.class);
            return callback.apply(producer);
        });
        when(producer.send("events", "1", "{\"id\":1}", null))
                .thenReturn(new KafkaProduceResultDto("events", 0, 11L));

        String result = access.withProducer(connection, producerArg -> producerArg.send("events", "1", "{\"id\":1}", null).topic());

        assertEquals("events", result);
        verify(broker).withProducer(eq(connection), any());
    }
}
