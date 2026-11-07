package org.apache.datawise.backend.connector.polaris;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
public class PolarisConnectorAutoConfiguration {

    @Bean
    PolarisConnectorOperations polarisConnectorOperations() {
        return new PolarisConnectorOperations();
    }

    @Bean
    PolarisDataSourceConnector polarisDataSourceConnector(PolarisConnectorOperations polaris) {
        return new PolarisDataSourceConnector(polaris);
    }
}
