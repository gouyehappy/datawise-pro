package org.apache.datawise.backend.yarn;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class YarnConnectionConfigTest {

    @Test
    void from_defaultsToHttpRestPath() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("10.0.0.1");
        entity.setPort("8088");
        YarnConnectionConfig config = YarnConnectionConfig.from(entity);
        assertEquals("http://10.0.0.1:8088/ws/v1/cluster", config.baseUrl());
    }

    @Test
    void from_parsesUiClusterUrl() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("http://rm.example.com:8088/cluster/apps");
        YarnConnectionConfig config = YarnConnectionConfig.from(entity);
        assertEquals("http://rm.example.com:8088/ws/v1/cluster", config.baseUrl());
    }

    @Test
    void from_honorsHttpsAndRestPath() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("https://rm.example.com:8090/ws/v1/cluster");
        YarnConnectionConfig config = YarnConnectionConfig.from(entity);
        assertEquals("https://rm.example.com:8090/ws/v1/cluster", config.baseUrl());
    }
}
