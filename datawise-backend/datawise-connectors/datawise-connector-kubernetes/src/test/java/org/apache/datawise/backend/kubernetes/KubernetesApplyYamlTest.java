package org.apache.datawise.backend.kubernetes;

import org.apache.datawise.backend.domain.K8sApplyResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class KubernetesApplyYamlTest {

    @Test
    void deniesSecretManifestsWithoutCallingApi() throws Exception {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("127.0.0.1");
        entity.setPort("6443");
        entity.setPassword("token");
        entity.setAdvancedConfig("insecureSkipTlsVerify=true\nuseHttps=true");

        String yaml = """
                apiVersion: v1
                kind: Secret
                metadata:
                  name: demo
                  namespace: default
                type: Opaque
                data:
                  password: c2VjcmV0
                """;

        K8sApplyResultDto result = KubernetesConnectionSupport.applyYaml(entity, yaml, "default");
        assertFalse(result.success());
        assertEquals(1, result.resources().size());
        assertEquals("denied", result.resources().get(0).action());
        assertTrue(result.resources().get(0).message().toLowerCase().contains("secret"));
    }
}
