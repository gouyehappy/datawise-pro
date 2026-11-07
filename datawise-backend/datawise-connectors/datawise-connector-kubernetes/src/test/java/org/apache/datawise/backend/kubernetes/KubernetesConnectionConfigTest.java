package org.apache.datawise.backend.kubernetes;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class KubernetesConnectionConfigTest {

    @Test
    void from_defaultsToHttpsApiServer() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("10.0.0.1");
        entity.setPort("6443");
        entity.setAuthType("token");
        entity.setPassword("tok");
        KubernetesConnectionConfig config = KubernetesConnectionConfig.from(entity);
        assertEquals("https://10.0.0.1:6443", config.apiServerBase());
        assertEquals("tok", config.bearerToken());
        assertTrue(config.insecureSkipTlsVerify());
    }

    @Test
    void from_parsesHttpsApiServerUrl() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("https://k8s.example.com:6443");
        entity.setAuthType("token");
        entity.setPassword("tok");
        KubernetesConnectionConfig config = KubernetesConnectionConfig.from(entity);
        assertEquals("https://k8s.example.com:6443", config.apiServerBase());
    }

    @Test
    void from_honorsExplicitHttp() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("http://k8s.example.com:8080");
        entity.setAuthType("token");
        entity.setPassword("tok");
        KubernetesConnectionConfig config = KubernetesConnectionConfig.from(entity);
        assertEquals("http://k8s.example.com:8080", config.apiServerBase());
    }
}
