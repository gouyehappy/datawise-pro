package org.apache.datawise.backend.jenkins;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JenkinsConnectionConfigTest {

    @Test
    void from_defaultsToHttp() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("192.0.2.30");
        entity.setPort("8080");
        JenkinsConnectionConfig config = JenkinsConnectionConfig.from(entity);
        assertEquals("http://192.0.2.30:8080", config.baseUrl());
        assertFalse(config.https());
    }

    @Test
    void from_honorsUseHttpsAdvancedFlag() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("192.0.2.30");
        entity.setPort("8080");
        entity.setAdvancedConfig("useHttps=true");
        JenkinsConnectionConfig config = JenkinsConnectionConfig.from(entity);
        assertEquals("https://192.0.2.30:8080", config.baseUrl());
        assertTrue(config.https());
    }

    @Test
    void from_parsesHttpsHostPrefix() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("https://ci.example.com:8443");
        JenkinsConnectionConfig config = JenkinsConnectionConfig.from(entity);
        assertEquals("https://ci.example.com:8443", config.baseUrl());
        assertTrue(config.https());
    }

    @Test
    void from_parsesHttpHostPrefixAndContextPath() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("http://ci.example.com");
        entity.setPort("8080");
        entity.setAdvancedConfig("contextPath=/jenkins");
        JenkinsConnectionConfig config = JenkinsConnectionConfig.from(entity);
        assertEquals("http://ci.example.com:8080/jenkins", config.baseUrl());
        assertFalse(config.https());
    }

    @Test
    void from_parsesFullLoginUrl() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("http://192.0.2.30:8082/jenkins/login?from=%2Fjenkins%2F");
        JenkinsConnectionConfig config = JenkinsConnectionConfig.from(entity);
        assertEquals("http://192.0.2.30:8082/jenkins", config.baseUrl());
        assertFalse(config.https());
    }

    @Test
    void extractContextPath_stripsLoginSuffix() {
        assertEquals("/jenkins", JenkinsConnectionConfig.extractContextPath("/jenkins/login?from=%2Fjenkins%2F"));
        assertEquals("/jenkins", JenkinsConnectionConfig.extractContextPath("/jenkins/"));
        assertEquals("", JenkinsConnectionConfig.extractContextPath("/login"));
    }
}
