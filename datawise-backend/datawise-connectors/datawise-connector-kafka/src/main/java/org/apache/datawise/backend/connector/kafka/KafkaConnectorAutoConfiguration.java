package org.apache.datawise.backend.connector.kafka;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "org.apache.kafka.clients.admin.AdminClient")
public class KafkaConnectorAutoConfiguration {

    @Bean
    KafkaConnectorOperations kafkaConnectorOperations() {
        return new KafkaConnectorOperations();
    }

    @Bean
    KafkaDataSourceConnector kafkaDataSourceConnector(KafkaConnectorOperations kafka) {
        return new KafkaDataSourceConnector(kafka);
    }
}
