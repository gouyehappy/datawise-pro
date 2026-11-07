package org.apache.datawise.backend.connector.ssh;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * SSH runtime for the server classpath: shell sessions + catalog connector bean.
 * {@code META-INF/services} stays out of the main JAR (plugin classifier only) so
 * {@link org.apache.datawise.backend.connector.plugin.ConnectorPluginLoader} does not
 * re-register SSH once per other plugin JAR.
 */
@AutoConfiguration
@EnableScheduling
@EnableConfigurationProperties(SshClientProperties.class)
public class SshConnectorAutoConfiguration {

    @Bean
    SshConnectorOperations sshConnectorOperations(SshClientProperties properties) {
        return new SshConnectorOperations(properties);
    }

    @Bean
    SshDataSourceConnector sshDataSourceConnector(SshConnectorOperations ssh) {
        return new SshDataSourceConnector(ssh);
    }

    @Bean
    SshShellSessionManager sshShellSessionManager(SshClientProperties properties) {
        return new SshShellSessionManager(properties);
    }
}
