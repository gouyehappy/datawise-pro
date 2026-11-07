package org.apache.datawise.backend.connector.yarn;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
public class YarnConnectorAutoConfiguration {

    @Bean
    YarnConnectorOperations yarnConnectorOperations() {
        return new YarnConnectorOperations();
    }

    @Bean
    YarnDataSourceConnector yarnDataSourceConnector(YarnConnectorOperations yarn) {
        return new YarnDataSourceConnector(yarn);
    }
}
