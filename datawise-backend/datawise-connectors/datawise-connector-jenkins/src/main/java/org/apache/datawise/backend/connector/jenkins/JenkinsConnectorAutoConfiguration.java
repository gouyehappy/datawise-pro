package org.apache.datawise.backend.connector.jenkins;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
public class JenkinsConnectorAutoConfiguration {

    @Bean
    JenkinsConnectorOperations jenkinsConnectorOperations() {
        return new JenkinsConnectorOperations();
    }

    @Bean
    JenkinsDataSourceConnector jenkinsDataSourceConnector(JenkinsConnectorOperations jenkins) {
        return new JenkinsDataSourceConnector(jenkins);
    }
}
