package org.apache.datawise.community.jenkins;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JenkinsConfigTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void buildsBaseUrlWithContextPath() {
        ObjectNode connection = mapper.createObjectNode();
        connection.put("id", "c1");
        connection.put("host", "192.0.2.30");
        connection.put("port", "8082");
        connection.put("username", "admin");
        connection.put("password", "token");
        ObjectNode ext = connection.putObject("external_config");
        ext.put("protocol", "http");
        ext.put("context_path", "/jenkins");
        ext.put("read_only", "false");
        ext.put("connect_timeout_secs", "15");

        JenkinsConfig config = JenkinsConfig.fromConnection(connection);
        assertEquals("http://192.0.2.30:8082/jenkins", config.baseUrl());
        assertFalse(config.readOnly());
        assertEquals(15, config.connectTimeoutSecs());
        assertTrue(config.authorizationHeader() != null && config.authorizationHeader().startsWith("Basic "));
    }

    @Test
    void normalizesContextPath() {
        assertEquals("", JenkinsConfig.normalizeContextPath(null));
        assertEquals("", JenkinsConfig.normalizeContextPath(""));
        assertEquals("", JenkinsConfig.normalizeContextPath("/"));
        assertEquals("/jenkins", JenkinsConfig.normalizeContextPath("jenkins"));
        assertEquals("/jenkins", JenkinsConfig.normalizeContextPath("/jenkins/"));
    }

    @Test
    void resolveDownloadDirDefaultsToUserDownloads() {
        Path path = JenkinsConfig.resolveDownloadDir("  ");
        assertEquals(Path.of(System.getProperty("user.home"), "Downloads"), path);
        assertEquals(Path.of("D:/artifacts"), JenkinsConfig.resolveDownloadDir("D:/artifacts"));
    }

    @Test
    void readOnlyAndHttpsFromConfig() {
        ObjectNode connection = mapper.createObjectNode();
        connection.put("id", "c2");
        connection.put("host", "jenkins.example");
        connection.put("port", "443");
        connection.put("username", "u");
        connection.put("password", "p");
        ObjectNode ext = connection.putObject("external_config");
        ext.put("protocol", "https");
        ext.put("read_only", "true");
        ext.put("insecure_skip_tls", "true");

        JenkinsConfig config = JenkinsConfig.fromConnection(connection);
        assertEquals("https://jenkins.example:443", config.baseUrl());
        assertTrue(config.https());
        assertTrue(config.readOnly());
        assertTrue(config.insecureSkipTls());
    }
}
