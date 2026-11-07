package org.apache.datawise.backend.connector.nacos;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
public class NacosConnectorAutoConfiguration {

    @Bean
    NacosConnectorOperations nacosConnectorOperations() {
        return new NacosConnectorOperations();
    }

    @Bean
    NacosDataSourceConnector nacosDataSourceConnector(NacosConnectorOperations nacos) {
        return new NacosDataSourceConnector(nacos);
    }
}
