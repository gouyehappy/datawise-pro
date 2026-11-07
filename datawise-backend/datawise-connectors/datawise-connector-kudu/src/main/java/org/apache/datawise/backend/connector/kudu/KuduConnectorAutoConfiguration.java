package org.apache.datawise.backend.connector.kudu;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "org.apache.kudu.client.KuduClient")
public class KuduConnectorAutoConfiguration {

    @Bean
    KuduConnectorOperations kuduConnectorOperations() {
        return new KuduConnectorOperations();
    }

    @Bean
    KuduDataSourceConnector kuduDataSourceConnector(KuduConnectorOperations kudu) {
        return new KuduDataSourceConnector(kudu);
    }
}
