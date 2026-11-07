package org.apache.datawise.backend.nacos;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class NacosConnectionConfigTest {

    @Test
    void from_defaultsToHttpWithNacosContext() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("10.0.0.1");
        entity.setPort("8848");
        NacosConnectionConfig config = NacosConnectionConfig.from(entity);
        assertEquals("http://10.0.0.1:8848/nacos", config.baseUrl());
        assertFalse(config.https());
    }

    @Test
    void from_honorsUseHttpsAndContextPath() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("nacos.example.com");
        entity.setPort("443");
        entity.setAdvancedConfig("useHttps=true\ncontextPath=/");
        NacosConnectionConfig config = NacosConnectionConfig.from(entity);
        assertEquals("https://nacos.example.com:443", config.baseUrl());
        assertTrue(config.https());
    }

    @Test
    void from_parsesHttpHostPrefix() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("http://nacos.example.com:8848/nacos");
        NacosConnectionConfig config = NacosConnectionConfig.from(entity);
        assertEquals("http://nacos.example.com:8848/nacos", config.baseUrl());
        assertFalse(config.https());
        assertFalse(config.v3Api());
    }

    @Test
    void from_v3UsesConsoleRootAndV3Api() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("10.0.0.8");
        entity.setPort("8080");
        entity.setAdvancedConfig("nacosVersionMode=v3\nnamespace=dev");
        NacosConnectionConfig config = NacosConnectionConfig.from(entity);
        assertEquals("http://10.0.0.8:8080", config.baseUrl());
        assertTrue(config.v3Api());
        assertEquals("dev", config.namespace());
    }

    @Test
    void from_rnacosStaysOnOpenApiV1() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("10.0.0.8");
        entity.setPort("8848");
        entity.setAdvancedConfig("nacosImplementation=rnacos\nnacosVersionMode=v3");
        NacosConnectionConfig config = NacosConnectionConfig.from(entity);
        assertEquals("http://10.0.0.8:8848/nacos", config.baseUrl());
        assertFalse(config.v3Api());
    }
}
