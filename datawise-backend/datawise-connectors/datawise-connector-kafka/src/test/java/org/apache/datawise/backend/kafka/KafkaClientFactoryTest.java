package org.apache.datawise.backend.kafka;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import java.util.Properties;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class KafkaClientFactoryTest {

    @Test
    void bootstrapServers_usesHostAndPort() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("broker.local");
        entity.setPort("9093");
        assertEquals("broker.local:9093", KafkaClientFactory.bootstrapServers(entity));
    }

    @Test
    void bootstrapServers_usesAdvancedConfigOverride() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("ignored");
        entity.setPort("9092");
        entity.setAdvancedConfig("bootstrap.servers=host1:9092,host2:9092\nsecurity.protocol=PLAINTEXT");
        assertEquals("host1:9092,host2:9092", KafkaClientFactory.bootstrapServers(entity));
    }

    @Test
    void applySasl_addsPlainJaasWhenCredentialsPresent() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setAuthType("SASL_PLAINTEXT");
        entity.setUsername("user");
        entity.setPassword("secret");
        Properties props = new Properties();
        KafkaClientFactory.applySasl(props, entity);
        assertEquals("SASL_PLAINTEXT", props.get("security.protocol"));
        assertTrue(props.get("sasl.jaas.config").toString().contains("username=\"user\""));
    }
}
