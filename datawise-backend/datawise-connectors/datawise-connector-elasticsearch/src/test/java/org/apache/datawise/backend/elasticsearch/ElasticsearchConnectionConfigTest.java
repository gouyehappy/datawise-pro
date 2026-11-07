package org.apache.datawise.backend.elasticsearch;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ElasticsearchConnectionConfigTest {

    @Test
    void from_defaultsToHttpDirectCluster() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("10.0.0.5");
        entity.setPort("9200");
        ElasticsearchConnectionConfig config = ElasticsearchConnectionConfig.from(entity);
        assertEquals("http://10.0.0.5:9200", config.clusterBaseUrl());
        assertEquals(ElasticsearchConnectionConfig.TransportMode.DIRECT, config.transportMode());
        assertEquals("/", config.connectivityCheckPath());
        assertFalse(config.connectivityCheckDisabled());
    }

    @Test
    void from_parsesHttpsHostAndAdvancedFlags() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("https://es.example.com");
        entity.setPort("9243");
        entity.setAdvancedConfig(String.join("\n",
                "connectivityCheckPath=/_cluster/health",
                "connectivityCheckDisabled=true",
                "insecureSkipTlsVerify=true"
        ));
        ElasticsearchConnectionConfig config = ElasticsearchConnectionConfig.from(entity);
        assertEquals("https://es.example.com:9243", config.clusterBaseUrl());
        assertEquals("/_cluster/health", config.connectivityCheckPath());
        assertTrue(config.connectivityCheckDisabled());
        assertTrue(config.insecureSkipTlsVerify());
    }

    @Test
    void from_enablesKibanaProxyMode() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("kibana.example.com");
        entity.setPort("5601");
        entity.setAdvancedConfig(String.join("\n",
                "mode=kibana",
                "kibanaBasePath=/kibana",
                "useHttps=true"
        ));
        ElasticsearchConnectionConfig config = ElasticsearchConnectionConfig.from(entity);
        assertEquals(ElasticsearchConnectionConfig.TransportMode.KIBANA_PROXY, config.transportMode());
        assertEquals("https://kibana.example.com:5601", config.clusterBaseUrl());
        assertEquals("/kibana", config.kibanaBasePath());
    }

    @Test
    void normalizeConnectivityCheckPath_stripsMethod() {
        assertEquals("/_cat/indices", ElasticsearchConnectionConfig.normalizeConnectivityCheckPath("GET /_cat/indices"));
        assertEquals("", ElasticsearchConnectionConfig.normalizeConnectivityCheckPath("/"));
    }

    @Test
    void normalizeKibanaBasePath() {
        assertEquals("/kibana", ElasticsearchConnectionConfig.normalizeKibanaBasePath("kibana/"));
        assertEquals("", ElasticsearchConnectionConfig.normalizeKibanaBasePath("  "));
    }

    @Test
    void from_buildsBasicAuthHeader() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("localhost");
        entity.setUsername("elastic");
        entity.setPassword("secret");
        ElasticsearchConnectionConfig config = ElasticsearchConnectionConfig.from(entity);
        assertTrue(config.authorizationHeader() != null && config.authorizationHeader().startsWith("Basic "));
    }
}
