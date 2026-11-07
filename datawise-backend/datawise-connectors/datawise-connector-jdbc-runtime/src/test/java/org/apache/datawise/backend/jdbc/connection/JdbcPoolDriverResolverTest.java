package org.apache.datawise.backend.jdbc.connection;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import java.util.Properties;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

class JdbcPoolDriverResolverTest {

    @Test
    void classInitializesAndSkipsUrlSessionKeysInAdvancedConfig() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("hive");
        entity.setHost("127.0.0.1");
        entity.setPort("10000");
        entity.setAuthType("NONE");
        entity.setAdvancedConfig("""
                ssl=true
                fetchSize=500
                """);

        Properties properties = JdbcPoolDriverResolver.buildConnectionProperties(entity);

        assertFalse(properties.containsKey("ssl"));
        assertEquals("500", properties.getProperty("fetchSize"));
    }
}
