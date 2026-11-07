package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.connector.facade.messagebroker.ConnectorMessageBrokerAccess;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.database.kafka.KafkaTablePublishService;
import org.apache.datawise.backend.domain.KafkaTopicsResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ExplorerKafkaServiceTest {

    @Mock
    private ConnectionExecutionContext connectionContext;
    @Mock
    private ConnectorFacade connectorFacade;
    @Mock
    private ConnectorMessageBrokerAccess messageBrokerAccess;
    @Mock
    private KafkaTablePublishService kafkaTablePublishService;

    @InjectMocks
    private ExplorerKafkaService service;

    @Test
    void listTopics_delegatesToConnectorWithBoundedLimit() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setId("conn-1");
        entity.setDbType("kafka");
        when(connectionContext.requireAvailableConnectionForCurrentUser(
                eq("conn-1"),
                eq(ConnectionExecutionContext.EXPLORER_CONNECTION_NOT_FOUND)
        )).thenReturn(new ConnectionExecutionContext.ResolvedConnection(1L, entity));
        when(connectorFacade.messageBroker()).thenReturn(messageBrokerAccess);
        when(messageBrokerAccess.listTopics(entity, "order*", 100))
                .thenReturn(new KafkaTopicsResultDto(List.of("orders"), 1));

        KafkaTopicsResultDto result = service.listTopics("conn-1", "order*", 100);

        assertEquals(1, result.totalCount());
        verify(messageBrokerAccess).listTopics(entity, "order*", 100);
    }
}
