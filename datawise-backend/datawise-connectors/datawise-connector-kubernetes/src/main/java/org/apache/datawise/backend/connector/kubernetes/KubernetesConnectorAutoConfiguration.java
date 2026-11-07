package org.apache.datawise.backend.connector.kubernetes;

import org.apache.datawise.backend.kubernetes.exec.KubernetesExecSessionManager;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
public class KubernetesConnectorAutoConfiguration {

    @Bean
    KubernetesConnectorOperations kubernetesConnectorOperations() {
        return new KubernetesConnectorOperations();
    }

    @Bean
    KubernetesDataSourceConnector kubernetesDataSourceConnector(KubernetesConnectorOperations kubernetes) {
        return new KubernetesDataSourceConnector(kubernetes);
    }

    @Bean
    KubernetesExecSessionManager kubernetesExecSessionManager() {
        return new KubernetesExecSessionManager();
    }
}
